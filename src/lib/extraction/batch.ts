import type { PdfDocument, PdfPage } from "@/lib/pdf/document";
import type { ExtractionBlock } from "./schema";
import {
  bytesToFileHash,
  client,
  errorToMessage,
  hasExactlyPages,
  isFaithful,
  MAX_DOCUMENT_PAGES,
  mergeCollected,
  messageToText,
  pagesToGroups,
  pagesToRequestParams,
  pageToFacts,
  parseBlocks,
  readRows,
  rowsToBlocks,
  selectComplexPages,
  storeBlocks,
} from "./shared";

/**
 * Re-reads complex pages across many documents in one batch, at half price — for a
 * re-index, where nobody is waiting.
 *
 * Blocks until the batch ends, which takes ten minutes to over an hour: a command you
 * leave running, not a background job. The batch id is never persisted, so a run that dies
 * leaves nothing to clean up and re-running resends whatever was not collected.
 *
 * Never throws. Documents whose pages fail keep their layout paragraphs.
 */

/** The API's own ceiling: a batch that has not ended by then never will. */
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface BatchDocument {
  doc: PdfDocument;
  bytes: Uint8Array;
}

export interface BatchProgress {
  (message: string): void;
}

/** One request in the batch, and everything needed to check what comes back. */
interface Request {
  customId: string;
  fileHash: string;
  pages: number[];
  params: ReturnType<typeof pagesToRequestParams>;
}

/**
 * Works out what still needs reading, and builds a request for each group of pages. Pages
 * already collected are skipped, which is what makes a re-run after a crash cheap.
 */
async function planRequests(documents: BatchDocument[]): Promise<Request[]> {
  const requests: Request[] = [];

  for (const [index, { doc, bytes }] of documents.entries()) {
    const complex = selectComplexPages(doc);
    if (complex.length === 0) continue;

    if (doc.pages.length > MAX_DOCUMENT_PAGES) {
      console.warn(
        `extraction: ${doc.pages.length} pages exceeds the ${MAX_DOCUMENT_PAGES}-page` +
          ` limit — keeping layout paragraphs for ${complex.length} complex pages`,
      );
      continue;
    }

    const fileHash = bytesToFileHash(bytes);
    const rows = await readRows(
      fileHash,
      complex.map((page) => page.page),
    );

    if (rows === null) continue;

    const done = new Set(rows.map((row) => row.page));
    const wanted = complex
      .map((page) => page.page)
      .filter((page) => !done.has(page));

    // The document index keeps custom_ids distinct even if the same file were passed
    // twice; the group suffix separates the requests of one document that needed more
    // pages than a single response could hold.
    for (const [group, pages] of pagesToGroups(wanted).entries())
      requests.push({
        customId: `${index}-${group}-${fileHash.slice(0, 24)}`,
        fileHash,
        pages,
        params: pagesToRequestParams(bytes, pages),
      });
  }

  return requests;
}

/** Waits for the batch, reporting as it goes. Null if it never ended. */
async function waitForBatch(
  batchId: string,
  report: BatchProgress,
): Promise<boolean> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const batch = await client().messages.batches.retrieve(batchId);

    if (batch.processing_status === "ended") return true;

    const { processing, succeeded, errored } = batch.request_counts;
    report(
      `  waiting — processing=${processing} succeeded=${succeeded} errored=${errored}`,
    );

    await sleep(POLL_INTERVAL_MS);
  }

  report(`  gave up waiting for ${batchId}`);
  return false;
}

/**
 * Stores the pages of one request that survived validation. Layers 1 and 2 fail the whole
 * request — a response naming the wrong pages says nothing trustworthy about any of them —
 * while layer 3 is per page. Either way a failed page keeps its layout paragraphs.
 *
 * Matched back by custom_id, never by position: results arrive in completion order.
 */
async function storeResult(
  request: Request,
  blocks: Map<number, ExtractionBlock[]> | null,
  pagesByKey: Map<string, PdfPage>,
) {
  if (!blocks || !hasExactlyPages(blocks, request.pages)) return;

  for (const number of request.pages) {
    const page = pagesByKey.get(`${request.fileHash}:${number}`);
    const pageBlocks = blocks.get(number)!;

    if (page && isFaithful(pageToFacts(page), pageBlocks))
      await storeBlocks(request.fileHash, page, pageBlocks);
  }
}

export async function extractViaBatch(
  documents: BatchDocument[],
  report: BatchProgress = console.log,
): Promise<PdfDocument[]> {
  const requests = await planRequests(documents);

  if (requests.length === 0) report("  nothing to send — every page is already read");
  else
    try {
      // Rows are written only for what comes back: claiming pages up front would leave a
      // dead pending row on every one of them if the run were interrupted.
      const batch = await client().messages.batches.create({
        requests: requests.map((request) => ({
          custom_id: request.customId,
          params: request.params,
        })),
      });

      report(
        `  batch ${batch.id} — ${requests.length} request(s),` +
          ` ${requests.reduce((total, request) => total + request.pages.length, 0)} page(s)`,
      );

      if (await waitForBatch(batch.id, report)) {
        // Layer 3 needs the page as the layout read it, and this process still holds every
        // parsed document.
        const pagesByKey = new Map<string, PdfPage>();

        for (const { doc, bytes } of documents) {
          const fileHash = bytesToFileHash(bytes);
          for (const page of selectComplexPages(doc))
            pagesByKey.set(`${fileHash}:${page.page}`, page);
        }

        const byCustomId = new Map(
          requests.map((request) => [request.customId, request]),
        );

        for await (const entry of await client().messages.batches.results(batch.id)) {
          const request = byCustomId.get(entry.custom_id);
          if (!request) continue;

          if (entry.result.type !== "succeeded") {
            report(`  ${entry.custom_id}: request ${entry.result.type}`);
            await storeResult(request, null, pagesByKey);
            continue;
          }

          const text = messageToText(entry.result.message);
          await storeResult(
            request,
            text === null ? null : parseBlocks(text),
            pagesByKey,
          );
        }
      }
    } catch (error) {
      report(`  batch failed — ${errorToMessage(error)}`);
    }

  // Built from the database rather than from what just came back, so a page collected by
  // an earlier run is merged too.
  const enriched: PdfDocument[] = [];

  for (const { doc, bytes } of documents) {
    const complex = selectComplexPages(doc);

    if (complex.length === 0) {
      enriched.push(doc);
      continue;
    }

    const rows =
      (await readRows(
        bytesToFileHash(bytes),
        complex.map((page) => page.page),
      )) ?? [];

    enriched.push(mergeCollected(doc, rowsToBlocks(complex, rows)));
  }

  return enriched;
}

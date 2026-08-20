import type { PdfDocument, PdfPage } from "@/lib/pdf/document";
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
 * Re-reads complex pages while the caller waits.
 *
 * The transport for an upload someone is watching. Measured at 23.5s for a two-page
 * document, which fits a Vercel function with an order of magnitude to spare, and costs
 * about eight cents — four cents more than the same work batched. For one document that
 * trade is obviously right; for a re-index it is obviously wrong, which is what batch.ts
 * is for.
 *
 * Never throws. Every failure — no key, no database, network, quota, malformed response,
 * failed validation — leaves the affected pages with the layout paragraphs they already
 * carry, page by page rather than document by document.
 */
export async function enrichComplexPages(
  doc: PdfDocument,
  bytes: Uint8Array,
): Promise<PdfDocument> {
  const complex = selectComplexPages(doc);
  if (complex.length === 0) return doc;

  if (doc.pages.length > MAX_DOCUMENT_PAGES) {
    console.warn(
      `extraction: ${doc.pages.length} pages exceeds the ${MAX_DOCUMENT_PAGES}-page` +
        ` limit — keeping layout paragraphs for ${complex.length} complex pages`,
    );
    return doc;
  }

  const fileHash = bytesToFileHash(bytes);
  const wanted = complex.map((page) => page.page);

  const existing = await readRows(fileHash, wanted);
  if (existing === null) return doc;

  const stored = new Set(existing.map((row) => row.page));
  const missing = complex.filter((page) => !stored.has(page.page));

  if (missing.length > 0) {
    if (process.env.ANTHROPIC_API_KEY) await readGroups(bytes, fileHash, missing);
    else
      console.warn(
        "extraction: ANTHROPIC_API_KEY is not set — keeping layout paragraphs",
      );
  }

  // Re-read rather than reusing the rows from above: the calls just made added some.
  const rows = (await readRows(fileHash, wanted)) ?? [];

  return mergeCollected(doc, rowsToBlocks(complex, rows));
}

/**
 * Reads the missing pages, in as few requests as their output will fit into.
 *
 * Groups run one after another rather than at once: each re-sends the whole PDF, so
 * running them in parallel would multiply peak token throughput against the rate limit
 * for no latency gain worth having on a document this size.
 */
async function readGroups(
  bytes: Uint8Array,
  fileHash: string,
  missing: PdfPage[],
) {
  const byPage = new Map(missing.map((page) => [page.page, page]));

  for (const group of pagesToGroups(missing.map((page) => page.page)))
    try {
      // Streamed, and not optional. The SDK refuses a non-streaming request whose
      // max_tokens implies it could run past ten minutes — the cutoff works out at
      // 21,333 tokens, and MAX_OUTPUT_TOKENS is 96,000 to hold the 50-page worst case.
      // It throws before sending, so the failure costs nothing but looks exactly like a
      // network error, and every page quietly keeps its layout paragraphs.
      //
      // finalMessage() reassembles the stream into the same Message the rest of this
      // path already expects, so nothing downstream has to know. The batch transport is
      // unaffected: a batch is submitted and collected later, never held open.
      const message = await client()
        .messages.stream(pagesToRequestParams(bytes, group))
        .finalMessage();

      const text = messageToText(message);
      const blocks = text === null ? null : parseBlocks(text);

      // Layers 1 and 2 fail the whole group: a response that named the wrong pages tells
      // us nothing trustworthy about any of them.
      if (!blocks || !hasExactlyPages(blocks, group)) continue;

      // Layer 3 is per page, so one unfaithful page does not cost its neighbours. A page
      // that fails is simply not stored — it keeps its layout paragraphs, and the next
      // ingest of this document reads it again, which is the right outcome for what is
      // more often a sampling accident than a property of the page.
      for (const number of group) {
        const page = byPage.get(number)!;
        const pageBlocks = blocks.get(number)!;

        if (isFaithful(pageToFacts(page), pageBlocks))
          await storeBlocks(fileHash, page, pageBlocks);
      }
    } catch (error) {
      console.warn(`extraction: request failed — ${errorToMessage(error)}`);
    }
}

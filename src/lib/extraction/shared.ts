import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { EXTRACTION_MODEL } from "@/constants/models";
import {
  threadHeadings,
  type PdfDocument,
  type PdfPage,
} from "@/lib/pdf/document";
import { prisma } from "@/lib/prisma";
import {
  blocksSchema,
  blocksToParagraphs,
  extractionJsonSchema,
  extractionSchema,
  pagesToPrompt,
  PROMPT_HASH,
  type ExtractionBlock,
} from "./schema";

/**
 * Everything about re-reading a complex page that does not depend on how the model is
 * called.
 *
 * The two transports — sync.ts for an upload someone is waiting on, batch.ts plus
 * collect.ts for bulk work nobody is watching — differ only in how a request becomes a
 * response. Selection, validation, bookkeeping and merging are identical, and live here
 * so they cannot drift apart between the two.
 *
 * Deliberately outside lib/pdf, which is a pure function of bytes — no network, no API
 * key, no cost. The layout paragraphs already on every page remain the fallback whenever
 * the model is unavailable, out of quota, or switched off.
 */

/**
 * Above this many pages a document is left to the layout path.
 *
 * A PDF document block sends the whole file however few pages are wanted from it, so a
 * 400-page manual with three complex pages would be charged as 400 pages. Extracting
 * just the wanted pages first needs a PDF writer the project does not have, and slicing
 * would renumber the pages — a fresh way to cite the wrong one. Measured at roughly
 * 2,500 input tokens per page, so 50 pages caps one document at about a third of a
 * dollar at batch rates.
 */
export const MAX_DOCUMENT_PAGES = 50;

/**
 * Ceiling for one response, covering thinking as well as transcription.
 *
 * Opus-5 allows 128k. Measured output is roughly 1,050 tokens per transcribed page, so
 * this holds the 50-page worst case with room for the thinking that shares the budget.
 * The old 16,000 would have truncated at about a dozen pages — and a truncated response
 * fails JSON.parse, which reads as a model failure rather than the configuration limit
 * it actually is.
 *
 * Above 21,333 the SDK refuses a non-streaming request outright, on the grounds that it
 * could run past ten minutes. That is why sync.ts streams; raising this number without
 * doing so turns every live page read into a silent fallback to layout paragraphs.
 */
const MAX_OUTPUT_TOKENS = 96_000;

/**
 * Pages per request.
 *
 * Set high on purpose. Splitting is not free: every extra request re-sends the whole
 * PDF, so a second request for a 50-page document costs another 125,000 input tokens.
 * The only reason to split at all is that one response has to fit MAX_OUTPUT_TOKENS, and
 * at ~1,050 tokens per page forty pages leaves comfortable headroom for thinking.
 */
const MAX_PAGES_PER_REQUEST = 40;

/** Share of the layout's words that must survive into the model's answer. */
const MIN_FAITHFUL_SHARE = 0.9;
/** Below this many words the share above is noise rather than evidence. */
const MIN_WORDS_TO_COMPARE = 10;

export const errorToMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const client = () => new Anthropic();

export const bytesToFileHash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Pages whose geometry defeated reconstruction, in page order. */
export const selectComplexPages = (doc: PdfDocument): PdfPage[] =>
  doc.pages.filter((page) => page.layout.kind === "complex");

/** What the layout made of a page, as one string, for the faithfulness check. */
export const pageToLayoutText = (page: PdfPage) =>
  page.paragraphs.map((paragraph) => paragraph.text).join(" ");

/** Splits a page list into groups small enough for one response to hold. */
export function pagesToGroups(pages: number[]): number[][] {
  const groups: number[][] = [];

  for (let i = 0; i < pages.length; i += MAX_PAGES_PER_REQUEST)
    groups.push(pages.slice(i, i + MAX_PAGES_PER_REQUEST));

  return groups;
}

/**
 * The request body for one group of pages.
 *
 * One request per group rather than per page: the file is sent whole either way, so
 * asking for six pages in six requests would pay for the document six times.
 */
export const pagesToRequestParams = (
  bytes: Uint8Array,
  pages: number[],
): Anthropic.Messages.MessageCreateParamsNonStreaming => ({
  model: EXTRACTION_MODEL,
  max_tokens: MAX_OUTPUT_TOKENS,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            // Buffer.from copies rather than viewing bytes.buffer, which for a file
            // read by Node may be a shared pool holding unrelated data.
            data: Buffer.from(bytes).toString("base64"),
          },
        },
        { type: "text", text: pagesToPrompt(pages) },
      ],
    },
  ],
  // No citations: structured outputs and native citations are mutually exclusive and
  // sending both returns a 400. Page attribution comes from the page number this code
  // asked for and verified, which is stronger than a citation the model chose.
  output_config: {
    format: { type: "json_schema", schema: extractionJsonSchema },
  },
});

/** The text of a model response, or null when it produced none. */
export function messageToText(
  message: Anthropic.Messages.Message,
): string | null {
  // A refusal is a normal outcome to record, not a crash.
  if (message.stop_reason === "refusal") {
    console.warn("extraction: model declined to read the document");
    return null;
  }

  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Layer 1: the response is the shape the schema promised.
 *
 * Pages within one response must be distinct. A response labelling two of them 3 would
 * otherwise collapse in the map below, and the second entry — some other page's text —
 * would be filed under page 3.
 */
export function parseBlocks(
  text: string,
): Map<number, ExtractionBlock[]> | null {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    // Also how a response truncated at max_tokens arrives, which is the right outcome:
    // half a page of text is not worth merging.
    console.warn("extraction: response was not valid JSON");
    return null;
  }

  const parsed = extractionSchema.safeParse(json);

  if (!parsed.success) {
    console.warn(`extraction: response did not match schema — ${parsed.error.message}`);
    return null;
  }

  const blocks = new Map<number, ExtractionBlock[]>();

  for (const page of parsed.data.pages) {
    if (blocks.has(page.page)) {
      console.warn(`extraction: page ${page.page} appeared twice in one response`);
      return null;
    }

    blocks.set(page.page, page.blocks);
  }

  return blocks;
}

/**
 * Layer 2: the response is about the pages that were asked for.
 *
 * A schema guarantees page is a number, never that it is the number requested. A response
 * describing page 4 as page 3 would cite the wrong page with total confidence and nothing
 * downstream would detect it, so a mismatched set rejects everything rather than the
 * pages that happen to look wrong.
 */
export function hasExactlyPages(
  got: Map<number, ExtractionBlock[]>,
  requested: number[],
): boolean {
  const wanted = new Set(requested);

  if (got.size !== wanted.size || ![...wanted].every((page) => got.has(page))) {
    console.warn(
      `extraction: asked for pages [${requested.join(", ")}]` +
        ` but got [${[...got.keys()].join(", ")}] — discarding the response`,
    );
    return false;
  }

  return true;
}

/** Layers 1 and 2 together, for a response covering exactly one group of pages. */
export function parseExtraction(
  text: string,
  requested: number[],
): Map<number, ExtractionBlock[]> | null {
  const blocks = parseBlocks(text);
  if (!blocks) return null;

  return hasExactlyPages(blocks, requested) ? blocks : null;
}

const WORD_PATTERN = /[\p{L}\p{N}]+/gu;

const textToWords = (text: string) =>
  new Set(text.toLowerCase().match(WORD_PATTERN) ?? []);

/**
 * What layer 3 needs to know about a page.
 *
 * Deliberately not a PdfPage: collect runs long after the document was parsed and holds a
 * database row, not a parsed PDF. Taking the smaller shape is what lets both transports
 * share one implementation, and a validation layer written twice is one that will drift.
 */
export interface PageFacts {
  page: number;
  reasons: readonly string[];
  layoutText: string;
}

export const pageToFacts = (page: PdfPage): PageFacts => ({
  page: page.page,
  reasons: page.layout.reasons,
  layoutText: pageToLayoutText(page),
});

/**
 * Layer 3: the model transcribed the page rather than rewriting it.
 *
 * Free, because the extracted text is already in hand. Even on a page whose columns were
 * braided into nonsense every word is correct — only the order is wrong — so the layout's
 * words are a reliable inventory of what the page says. Containment is one-directional on
 * purpose: the model legitimately adds Markdown table pipes, and is only in trouble if it
 * drops what was there.
 */
export function isFaithful(
  { page, reasons, layoutText }: PageFacts,
  blocks: ExtractionBlock[],
): boolean {
  // An image-only page has no text layer to compare against. It is also the page the
  // model is most clearly better at than the geometry, so it is trusted furthest with the
  // least verification. Checked before the word count below rather than left to fall
  // through it: both would pass a scanned page, but only this one passes it for the right
  // reason, and a validation layer that is accidentally correct is a latent bug.
  if (reasons.includes("image-only")) return true;

  const layoutWords = textToWords(layoutText);

  if (layoutWords.size < MIN_WORDS_TO_COMPARE) return true;

  const modelWords = textToWords(blocks.map((block) => block.text).join(" "));

  let kept = 0;
  for (const word of layoutWords) if (modelWords.has(word)) kept++;

  const share = kept / layoutWords.size;

  if (share < MIN_FAITHFUL_SHARE)
    console.warn(
      `extraction: page ${page} kept only ${(share * 100).toFixed(0)}%` +
        " of the layout's words — falling back",
    );

  return share >= MIN_FAITHFUL_SHARE;
}

/**
 * Every page already read, or null if the database could not be reached.
 *
 * Null and empty mean different things and the caller must tell them apart: no rows means
 * no page has been read yet, whereas no answer means it is unknown which have — and
 * reading them all again would pay a second time for work already done.
 */
export async function readRows(fileHash: string, pages: number[]) {
  try {
    return await prisma.pageExtraction.findMany({
      where: {
        fileHash,
        model: EXTRACTION_MODEL,
        promptHash: PROMPT_HASH,
        page: { in: pages },
      },
    });
  } catch (error) {
    console.warn(`extraction: could not read page rows — ${errorToMessage(error)}`);
    return null;
  }
}

/**
 * Stores a page the model read successfully.
 *
 * A row exists only for a page that came back well formed and about the right page, so
 * writing one is the whole of the bookkeeping: nothing marks a read as in progress, and
 * nothing marks one as failed. An interrupted read leaves no trace to clean up.
 *
 * A conflict means another caller stored the same page first — two uploads of one file
 * racing. Their answer is as good as this one, so it stands.
 */
export async function storeBlocks(
  fileHash: string,
  page: PdfPage,
  blocks: ExtractionBlock[],
) {
  try {
    await prisma.pageExtraction.create({
      data: {
        fileHash,
        page: page.page,
        model: EXTRACTION_MODEL,
        promptHash: PROMPT_HASH,
        reasons: [...page.layout.reasons],
        blocks,
      },
    });
  } catch (error) {
    console.warn(
      `extraction: could not store page ${page.page} — ${errorToMessage(error)}`,
    );
  }
}

/**
 * Builds the enriched document from whatever has been stored so far.
 *
 * Pages never read, or read and rejected, keep their layout paragraphs — so this is safe
 * to call at any point and returns more as more is stored.
 */
export function mergeCollected(
  doc: PdfDocument,
  blocksByPage: Map<number, ExtractionBlock[]>,
): PdfDocument {
  // Paragraphs are cloned rather than reused. threadHeadings assigns heading in place,
  // and doc is also the fallback — mutating it would corrupt the thing being fallen back
  // to.
  const pages = doc.pages.map((page) => {
    const blocks = blocksByPage.get(page.page);

    return {
      ...page,
      paragraphs: blocks
        ? blocksToParagraphs(blocks)
        : page.paragraphs.map((paragraph) => ({ ...paragraph })),
    };
  });

  // Over the whole document, not just the replaced pages: a model page contributes its
  // own headings, and every page after it inherits from there.
  threadHeadings(pages, doc.title);

  return { title: doc.title, pages };
}

/**
 * Stored blocks for the pages of this document that have them, revalidated.
 *
 * Layer 3 runs here rather than only at write time: a stored row is trusted for cost, not
 * for correctness, and one written by an older, laxer validator must not slip past
 * today's.
 */
export function rowsToBlocks(
  complex: PdfPage[],
  rows: { page: number; blocks: unknown }[],
): Map<number, ExtractionBlock[]> {
  const byPage = new Map(rows.map((row) => [row.page, row]));
  const accepted = new Map<number, ExtractionBlock[]>();

  for (const page of complex) {
    const row = byPage.get(page.page);
    if (!row) continue;

    const parsed = blocksSchema.safeParse(row.blocks);
    if (!parsed.success) continue;

    if (isFaithful(pageToFacts(page), parsed.data))
      accepted.set(page.page, parsed.data);
  }

  return accepted;
}

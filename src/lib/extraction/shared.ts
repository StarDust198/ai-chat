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
 * Selection, validation, bookkeeping and merging for re-reading a complex page — shared by
 * both transports (sync.ts, batch.ts), which differ only in how a request becomes a
 * response.
 *
 * Deliberately outside lib/pdf, which stays a pure function of bytes. The layout
 * paragraphs already on every page are the fallback whenever the model is unavailable.
 */

/**
 * Above this many pages a document is left to the layout path. A PDF block sends the whole
 * file however few pages are wanted, so a 400-page manual is charged as 400 pages; at
 * ~2,500 input tokens each, this caps one document at about a third of a dollar.
 */
export const MAX_DOCUMENT_PAGES = 50;

/**
 * Ceiling for one response, thinking included. At ~1,050 tokens per transcribed page this
 * holds the 50-page worst case. Above 21,333 the SDK refuses a non-streaming request, so
 * sync.ts streams.
 */
const MAX_OUTPUT_TOKENS = 96_000;

/**
 * Pages per request. High because every extra request re-sends the whole PDF; the only
 * reason to split is that one response must fit MAX_OUTPUT_TOKENS.
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
 * The request body for one group of pages. Per group rather than per page: the file is
 * sent whole either way, so six pages in six requests pay for the document six times.
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
            // Buffer.from copies rather than viewing bytes.buffer, which for a file read
            // by Node may be a shared pool holding unrelated data.
            data: Buffer.from(bytes).toString("base64"),
          },
        },
        { type: "text", text: pagesToPrompt(pages) },
      ],
    },
  ],
  // No citations: structured outputs and native citations are mutually exclusive and
  // sending both returns a 400. Page attribution comes from the page number this code
  // asked for and verified.
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
 * Layer 1: the response is the shape the schema promised, and its pages are distinct — two
 * pages labelled 3 would collapse in the map below, filing one under the other's number.
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
 * Layer 2: the response is about the pages that were asked for. A schema guarantees page
 * is a number, never that it is the number requested — and a page 4 returned as page 3
 * would cite the wrong page with nothing downstream to catch it. A mismatched set rejects
 * everything, not just the pages that look wrong.
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
 * What layer 3 needs to know about a page. Not a PdfPage, because the batch transport
 * validates long after the document was parsed.
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
 * Even where the layout braided two columns into nonsense every word is correct — only the
 * order is wrong — so its words are a reliable inventory of what the page says. The
 * comparison is one-directional: the model legitimately adds Markdown table pipes, and is
 * only in trouble if it drops what was there.
 */
export function isFaithful(
  { page, reasons, layoutText }: PageFacts,
  blocks: ExtractionBlock[],
): boolean {
  // No text layer to compare against. Checked ahead of the word count below so it passes
  // for this reason rather than by accident.
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
 * Every page already read, or null if the database could not be reached. The caller must
 * tell those apart: no rows means nothing has been read, no answer means it is unknown
 * what has — and re-reading would pay twice for work already done.
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
 * Stores a page the model read successfully — the whole of the bookkeeping, since nothing
 * marks a read as in progress or failed. A conflict means two uploads of one file raced;
 * the answer already stored is as good as this one, so it stands.
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
 * Builds the enriched document from whatever has been stored so far. Pages never read, or
 * read and rejected, keep their layout paragraphs.
 */
export function mergeCollected(
  doc: PdfDocument,
  blocksByPage: Map<number, ExtractionBlock[]>,
): PdfDocument {
  // Cloned rather than reused: threadHeadings assigns heading in place, and doc is also
  // the fallback — mutating it would corrupt the thing being fallen back to.
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
 * Stored blocks for the pages that have them, revalidated: a stored row is trusted for
 * cost, not for correctness, and one written by an older, laxer validator must not pass.
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

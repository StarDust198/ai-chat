import type { SegmentSource, SourceSegment } from "./sources";

/**
 * Groups source segments into the passages that get embedded and retrieved.
 *
 * Segments are structural units, which is not the same thing as a good retrieval unit: a
 * single paragraph is usually too small to answer anything on its own, and
 * linesToParagraphs also breaks on a font-size change, so a caption or a bolded lead-in
 * arrives as its own fragment. Merging fixes that — but only within the boundaries the
 * upstream layers were careful to establish.
 */

/** One row of Chunk, minus the embedding. */
export interface ChunkInput {
  content: string;
  heading: string | null;
  page: number | null;
  pageLabel: string | null;
  source: SegmentSource;
  kind: "paragraph" | "table";
  tokenCount: number;
  index: number;
}

/**
 * Deliberately an approximation: characters over four, no tokenizer.
 *
 * Good enough to fill a prompt budget, where being 20% out costs a little context, and
 * not good enough to police a hard input limit, where being 20% out is a failed request.
 * storeChunks measures the real limit against the real string instead.
 */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Merging stops here. Large enough to carry an argument, small enough to retrieve several. */
const TARGET_TOKENS = 300;
/** A single prose segment above this is split rather than embedded whole. */
const MAX_TOKENS = 1500;

const MAX_CHARS = MAX_TOKENS * 4;

/**
 * Whether two segments may end up in the same chunk.
 *
 * Every clause here protects a column on the row. A chunk that spanned two pages could
 * not be cited to either, one that spanned a heading would misattribute its context, and
 * one that mixed layout and model text could not answer which produced it. Enforcing all
 * three in one place is what lets page, pageLabel and source stay single values rather
 * than ranges and arrays.
 */
const isMergeable = (left: SourceSegment, right: SourceSegment) =>
  left.page === right.page &&
  left.heading === right.heading &&
  left.source === right.source &&
  left.kind !== "table" &&
  right.kind !== "table";

/**
 * Breaks a passage too long to embed into pieces, preferring sentence boundaries.
 *
 * Only ever reached by a single oversized segment — merging stops well before this — so
 * in practice this is a runaway paragraph or a page of prose the layout read as one
 * block. Word boundaries are the last resort, and a word longer than the budget is cut,
 * because returning a piece that still cannot be embedded would defeat the point.
 */
function splitOversized(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];

  const pieces: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.length > 0) pieces.push(buffer);
    buffer = "";
  };

  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (buffer.length > 0 && buffer.length + 1 + sentence.length > MAX_CHARS) flush();

    if (sentence.length <= MAX_CHARS) {
      buffer = buffer.length > 0 ? `${buffer} ${sentence}` : sentence;
      continue;
    }

    // One sentence longer than the whole budget: pack it word by word instead.
    for (const word of sentence.split(/\s+/)) {
      if (buffer.length > 0 && buffer.length + 1 + word.length > MAX_CHARS) flush();

      buffer =
        buffer.length > 0
          ? `${buffer} ${word}`
          : // A single word past the budget cannot be broken sensibly, only cut.
            word.slice(0, MAX_CHARS);
    }
  }

  flush();
  return pieces;
}

/**
 * Turns segments into chunks, in document order.
 *
 * Heading segments contribute no chunk of their own. threadHeadings has already copied
 * each heading's text into the `heading` field of every paragraph beneath it, so the text
 * survives in the column and in what gets embedded. The one thing this loses is a heading
 * with no body under it at all, which is a section title with nothing to retrieve.
 *
 * A table is never merged and never split. The extraction prompt demands a whole table in
 * one block because a reader who retrieves one piece of a split table has been given
 * nothing useful, and re-splitting it here would undo that at the last step.
 */
export function segmentsToChunks(segments: SourceSegment[]): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  let buffer: SourceSegment[] = [];

  const flush = () => {
    if (buffer.length === 0) return;

    const [first] = buffer;
    const text = buffer.map((segment) => segment.text).join("\n\n");
    const kind = first.kind === "table" ? ("table" as const) : ("paragraph" as const);

    // Tables are exempt: an oversized one stays whole and is handled at embed time.
    const contents = kind === "table" ? [text] : splitOversized(text);

    for (const content of contents)
      chunks.push({
        content,
        heading: first.heading,
        page: first.page,
        pageLabel: first.pageLabel,
        source: first.source,
        kind,
        tokenCount: estimateTokens(content),
        index: chunks.length,
      });

    buffer = [];
  };

  for (const segment of segments) {
    if (segment.kind === "heading") continue;

    const last = buffer.at(-1);

    if (last) {
      const merged = estimateTokens(
        [...buffer, segment].map(({ text }) => text).join("\n\n"),
      );

      if (!isMergeable(last, segment) || merged > TARGET_TOKENS) flush();
    }

    buffer.push(segment);
  }

  flush();
  return chunks;
}

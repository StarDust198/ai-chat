import type { SegmentSource, SourceSegment } from "./sources";

/**
 * Groups source segments into the passages that get embedded and retrieved. A structural
 * unit is not a good retrieval unit: one paragraph is usually too small to answer
 * anything, and a caption or bolded lead-in arrives as its own fragment.
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
 * An approximation — characters over four, no tokenizer. Good enough to fill a prompt
 * budget, not to police a hard input limit; storeChunks measures that itself.
 */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Merging stops here. Large enough to carry an argument, small enough to retrieve several. */
const TARGET_TOKENS = 300;
/** A single prose segment above this is split rather than embedded whole. */
const MAX_TOKENS = 1500;

const MAX_CHARS = MAX_TOKENS * 4;

/**
 * Whether two segments may end up in the same chunk. Every clause protects a column: a
 * chunk spanning two pages could be cited to neither, one spanning a heading would
 * misattribute its context, one mixing layout and model text could not say which produced
 * it. Enforcing them here is what keeps page, pageLabel and source single values.
 */
const isMergeable = (left: SourceSegment, right: SourceSegment) =>
  left.page === right.page &&
  left.heading === right.heading &&
  left.source === right.source &&
  left.kind !== "table" &&
  right.kind !== "table";

/**
 * Breaks a passage too long to embed into pieces, preferring sentence boundaries. Only
 * reached by a single oversized segment, since merging stops well before this. A word
 * longer than the budget is cut — a piece that still cannot be embedded is no use.
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
 * Heading segments contribute no chunk of their own — threadHeadings has already copied
 * each into the `heading` field of every paragraph beneath it — so the only thing lost is
 * a heading with no body, which has nothing to retrieve. A table is never merged and never
 * split: one piece of a split table is no use to whoever retrieves it.
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

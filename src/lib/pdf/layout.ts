import { internalGaps, type Line } from "./lines";

/**
 * Why a page's text cannot be trusted to the geometric reconstruction in lines.ts.
 *
 * Named after what was measured, not what was concluded: "vertical-split" covers a
 * two-column page and a table indistinguishably (both score 29–34% of lines divided by
 * the band), and the label must not claim to know which it found.
 */
export type LayoutReason =
  | "vertical-split"
  | "wide-gaps"
  | "rotated"
  | "image-only";

export interface LayoutAssessment {
  kind: "prose" | "complex";
  reasons: LayoutReason[];
  /** Widest interior band no line writes into, in points. */
  gutterWidth: number;
  /** Share of lines carrying a gap far beyond word spacing, 0–1. */
  wideGapRatio: number;
}

/** Below this many characters a page is not carrying its own content. */
const MIN_TEXT_CHARS = 24;
/**
 * Characters a page may hold and still count as no more than its picture. Must not exceed
 * IMAGE_CHECK_TEXT_GATE in extract.ts, which bounds the pages hasImages is computed for.
 */
const IMAGE_PAGE_MAX_CHARS = 200;
/** Below this many lines the ratios below are noise rather than evidence. */
const MIN_LINES_TO_ASSESS = 5;
/** Lines left after full-width ones are set aside, below which a gutter is a guess. */
const MIN_COLUMNAR_LINES = 5;
/** Narrower than this is a wide word space, not a column gutter. */
const GUTTER_MIN_WIDTH = 12;
/** Share of lines a band may intrude on and still count as a gutter. */
const GUTTER_COVERAGE_TOLERANCE = 0.05;
/** Share of lines that must be cut by a band for it to divide anything. */
const GUTTER_SIDE_SHARE = 0.2;
/** Share of the text block a line must cover before it counts as full-width. */
const SPANNING_SHARE = 0.8;
/** Multiples of the font size at which a gap stops being punctuation of any kind. */
const WIDE_GAP_EM = 3;
/**
 * Share of lines with such a gap that marks the page as tabular. Measured on
 * mock-data/pdf: pages without a table score zero, the lowest-scoring page with one
 * reaches 9.8%. This sits between them.
 */
const WIDE_GAP_LINE_SHARE = 0.05;
/** Resolution of the horizontal coverage scan, in points. */
const BIN_WIDTH = 1;

// line.text arrives trimmed from joinWithGaps.
const countCharacters = (lines: Line[]) =>
  lines.reduce((total, line) => total + line.text.length, 0);

const largestInternalGap = (line: Line) =>
  Math.max(0, ...internalGaps(line.items).map(({ gap }) => gap));

/**
 * A line that runs the full width of the text block without a break in it. Both conditions
 * are load-bearing: a line whose two columns were read as one also runs the full width,
 * but carries the gutter as an internal gap.
 */
const isSpanning = (line: Line, blockWidth: number) => {
  const right = Math.max(...line.items.map((item) => item.x + item.width));

  return (
    right - line.x >= blockWidth * SPANNING_SHARE &&
    largestInternalGap(line) < GUTTER_MIN_WIDTH
  );
};

/**
 * Widest vertical band that almost no line writes into. Prose leaves none — its word gaps
 * land at a different x on every line — while a gutter survives because both columns avoid
 * the same strip.
 */
function widestGutter(lines: Line[]): number {
  const items = lines.flatMap((line) => line.items);
  if (items.length === 0) return 0;

  const minX = Math.min(...items.map((item) => item.x));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const blockWidth = maxX - minX;
  const bins = Math.ceil(blockWidth / BIN_WIDTH);
  if (bins <= 2) return 0;

  // Full-width elements — a title, a spanning abstract — sit on top of a gutter rather
  // than denying it, and counting them would erase a gutter the page is plainly set in.
  const columnar = lines.filter((line) => !isSpanning(line, blockWidth));
  if (columnar.length < MIN_COLUMNAR_LINES) return 0;

  // How many lines write into each vertical slice of the text block.
  const coverage = new Array<number>(bins).fill(0);

  for (const line of columnar) {
    const touched = new Set<number>();

    for (const item of line.items) {
      const from = Math.floor((item.x - minX) / BIN_WIDTH);
      const to = Math.ceil((item.x + item.width - minX) / BIN_WIDTH);
      for (let bin = Math.max(0, from); bin < Math.min(bins, to); bin++)
        touched.add(bin);
    }

    for (const bin of touched) coverage[bin]++;
  }

  const maxIntrusion = columnar.length * GUTTER_COVERAGE_TOLERANCE;
  let widest = 0;
  let runStart: number | null = null;

  for (let bin = 0; bin <= bins; bin++) {
    const empty = bin < bins && coverage[bin] <= maxIntrusion;

    if (empty) {
      runStart ??= bin;
      continue;
    }

    // Interior runs only: the margins either side of the text block are not gutters.
    if (runStart !== null && runStart > 0 && bin < bins) {
      const width = (bin - runStart) * BIN_WIDTH;
      if (width >= GUTTER_MIN_WIDTH && dividesContent(lines, minX, runStart, bin))
        widest = Math.max(widest, width);
    }

    runStart = null;
  }

  return widest;
}

/**
 * Whether a real share of the page is actually divided by the band. A line counts only if
 * the band cuts it — content on both sides, nothing reaching into the middle — or a
 * full-width title would count as divided by any band it crosses.
 */
function dividesContent(
  lines: Line[],
  minX: number,
  fromBin: number,
  toBin: number,
): boolean {
  const left = minX + fromBin * BIN_WIDTH;
  const right = minX + toBin * BIN_WIDTH;

  const divided = lines.filter(
    (line) =>
      line.items.some((item) => item.x + item.width <= left) &&
      line.items.some((item) => item.x >= right) &&
      !line.items.some((item) => item.x < right && item.x + item.width > left),
  ).length;

  return divided >= lines.length * GUTTER_SIDE_SHARE;
}

/** Share of lines holding a gap far too wide to be spacing between words. */
function wideGapRatio(lines: Line[]): number {
  if (lines.length === 0) return 0;

  const wide = lines.filter((line) =>
    internalGaps(line.items).some(({ gap, em }) => gap > em * WIDE_GAP_EM),
  ).length;

  return wide / lines.length;
}

const finalise = (
  reasons: LayoutReason[],
  gutterWidth: number,
  ratio: number,
): LayoutAssessment => ({
  kind: reasons.length > 0 ? "complex" : "prose",
  reasons,
  gutterWidth,
  wideGapRatio: ratio,
});

/**
 * Decides whether a page's text can be reconstructed from its geometry. Expects running
 * headers and footers already removed: a footer spaces its fields across the page, which
 * reads as tabular and would flag every page of a document that has one.
 */
export function assessLayout(
  lines: Line[],
  rotation: number,
  hasImages: boolean,
): LayoutAssessment {
  const reasons: LayoutReason[] = [];

  if (rotation === 90 || rotation === 270) reasons.push("rotated");

  const characters = countCharacters(lines);

  // Ahead of everything below: a picture has no ratios worth measuring and too few lines
  // to survive the small-page guard, so it would be written off as ordinary prose.
  if (hasImages && characters < IMAGE_PAGE_MAX_CHARS)
    return finalise([...reasons, "image-only"], 0, 0);

  // Nothing to recover: asking a model to read blank paper costs a call to be told so.
  if (characters < MIN_TEXT_CHARS) return finalise(reasons, 0, 0);

  // Short but complete: a title page or a section divider.
  if (lines.length < MIN_LINES_TO_ASSESS) return finalise(reasons, 0, 0);

  const gutterWidth = widestGutter(lines);
  const gapRatio = wideGapRatio(lines);

  if (gutterWidth >= GUTTER_MIN_WIDTH) reasons.push("vertical-split");
  if (gapRatio > WIDE_GAP_LINE_SHARE) reasons.push("wide-gaps");

  return finalise(reasons, gutterWidth, gapRatio);
}

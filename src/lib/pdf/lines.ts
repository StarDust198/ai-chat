import type { StructuredTextItem } from "unpdf";

export interface Line {
  /** 1-based page number. */
  page: number;
  /** Representative baseline (median of the line's items), PDF space: origin bottom-left. */
  y: number;
  /** Left edge of the leftmost item. */
  x: number;
  text: string;
  /** Largest font size on the line — body size, not a superscript's. */
  fontSize: number;
  items: StructuredTextItem[];
}

/** Rectangle in PDF space, origin bottom-left — the space item coordinates use. */
export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Paragraph {
  text: string;
  /** Largest font size in the paragraph — how a heading is told from body text. */
  fontSize: number;
  /** Where it sits on the page, for highlighting a cited passage in a viewer. */
  bbox: BBox;
}

/** Baselines within this fraction of a font size belong to the same visual line. */
const BASELINE_TOLERANCE = 0.5;
/** A single line may not span more than this many font sizes vertically. */
const MAX_LINE_SPAN = 1.2;
/** Horizontal gap, in em, that implies a word break. Lower if words come out glued. */
const SPACE_GAP = 0.25;

/**
 * Groups positioned text items into visual lines.
 *
 * PDF.js emits one item per style run, not per word or line: "The *quick* brown fox"
 * can arrive as three items, and spaces are frequently absent. Reading order in the
 * array is not guaranteed to be visual order either. Both are reconstructed here.
 *
 * Left-to-right scripts only — see the note at the bottom of this file.
 */
export function itemsToLines(
  items: StructuredTextItem[],
  page: number,
): Line[] {
  const sorted = items
    .filter((item) => item.str.trim().length > 0)
    // Top-to-bottom, then left-to-right.
    .sort((left, right) => right.y - left.y || left.x - right.x);

  const lines: Line[] = [];

  // Baselines are compared against the previous item rather than the line's first
  // item: a gradually slanting line drifts out of range of its anchor but never out
  // of range of its immediate neighbour. lineTop caps the total span so that drift
  // cannot ratchet an entire slanted page into one line.
  let previousY = Number.POSITIVE_INFINITY;
  let lineTop = Number.POSITIVE_INFINITY;

  for (const item of sorted) {
    // Both subtractions are non-negative: the sort guarantees y never increases.
    const nearPrevious =
      previousY - item.y <= Math.max(2, item.fontSize * BASELINE_TOLERANCE);
    const spanBounded = lineTop - item.y <= item.fontSize * MAX_LINE_SPAN;

    if (lines.length > 0 && nearPrevious && spanBounded) {
      lines.at(-1)!.items.push(item);
    } else {
      lines.push({
        page,
        y: item.y,
        x: item.x,
        text: "",
        fontSize: item.fontSize,
        items: [item],
      });
      lineTop = item.y;
    }

    previousY = item.y;
  }

  for (const line of lines) {
    line.items.sort((left, right) => left.x - right.x);
    line.x = line.items[0].x;
    // The median baseline, not the first item's: a line that opens with a superscript
    // would otherwise report the superscript's position as its own, and callers test
    // that position against the page's margin bands.
    line.y = median(line.items.map((item) => item.y));
    line.fontSize = Math.max(...line.items.map((item) => item.fontSize));
    line.text = joinWithGaps(line.items);
  }

  return lines;
}

/**
 * Concatenates a line's items, inferring spaces from horizontal gaps.
 *
 * The em is taken from the larger of the two adjacent items: scaling by the current
 * item alone makes the threshold collapse at a superscript (6pt * 0.25 = 1.5pt, which
 * ordinary kerning exceeds), producing "word ¹" instead of "word¹".
 */
export function joinWithGaps(items: StructuredTextItem[]): string {
  if (items.length === 0) return "";

  let text = items[0].str;

  for (let i = 1; i < items.length; i++) {
    const previous = items[i - 1];
    const current = items[i];
    const gap = current.x - (previous.x + previous.width);
    const em = Math.max(previous.fontSize, current.fontSize);

    if (gap > em * SPACE_GAP) text += " ";
    text += current.str;
  }

  // An item's own str can begin or end with spaces, so inferred gaps are not the
  // only source of whitespace here and doubled spaces are routine.
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Collapses a run of lines into one paragraph. The box is measured from items rather
 * than baselines: a line's y is its baseline, so a baseline-derived box clips every
 * ascender.
 */
const toParagraph = (lines: Line[]): Paragraph | null => {
  const text = lines
    .map((line) => line.text)
    .join(" ")
    .trim();

  if (!text) return null;

  const items = lines.flatMap((line) => line.items);

  return {
    text,
    fontSize: Math.max(...lines.map((line) => line.fontSize)),
    bbox: {
      x0: Math.min(...items.map((item) => item.x)),
      y0: Math.min(...items.map((item) => item.y)),
      x1: Math.max(...items.map((item) => item.x + item.width)),
      y1: Math.max(...items.map((item) => item.y + item.height)),
    },
  };
};

/**
 * Splits lines into paragraphs on vertical gaps larger than the document's normal
 * leading. PDF stores no paragraph structure at all; this is where it is
 * reconstructed, and it is why positioned items are worth the trouble over plain
 * extracted text.
 */
export function linesToParagraphs(lines: Line[], gapFactor = 1.4): Paragraph[] {
  if (lines.length === 0) return [];

  const paragraphs: Paragraph[] = [];
  let buffer: Line[] = [];

  const flush = () => {
    const paragraph = buffer.length > 0 ? toParagraph(buffer) : null;
    if (paragraph) paragraphs.push(paragraph);
    buffer = [];
  };

  for (const [i, line] of lines.entries()) {
    if (i > 0) {
      const previous = lines[i - 1];
      const gap = previous.y - line.y;
      const em = Math.max(previous.fontSize, line.fontSize);

      // Typical leading is ~1.2em, so a break is anything meaningfully beyond that.
      const wideGap = gap > em * 1.2 * gapFactor;
      // A font-size change is a boundary on its own — heading into body, body into caption.
      const sizeChanged =
        Math.abs(previous.fontSize - line.fontSize) > em * 0.15;

      if (wideGap || sizeChanged) flush();
    }
    buffer.push(line);
  }

  flush();
  return paragraphs;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Known limitation: RTL and vertical scripts.
 *
 * `left.x - right.x` and `current.x - (previous.x + previous.width)` both assume text
 * flows left-to-right. For items where `dir` is "rtl" or "ttb" the sort order and the
 * gap arithmetic are both wrong. Detectable via item.dir if a document ever needs it.
 */

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
    .sort((a, b) => b.y - a.y || a.x - b.x); // top-to-bottom, then left-to-right

  const lines: Line[] = [];

  // Compared against the *previous item*, not the line's first item: a gradually
  // slanting line drifts out of range of its anchor but never out of range of its
  // immediate neighbour. lineTop caps the total span so that drift can't ratchet
  // an entire slanted page into one line.
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
    line.items.sort((a, b) => a.x - b.x);
    line.x = line.items[0].x;
    // Median, not the first item's baseline: a superscript anchor would misreport
    // the line's position, and stripBoilerplate tests y against the margin bands.
    line.y = median(line.items.map((i) => i.y));
    line.fontSize = Math.max(...line.items.map((i) => i.fontSize));
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

  let out = items[0].str;

  for (let i = 1; i < items.length; i++) {
    const previous = items[i - 1];
    const current = items[i];
    const gap = current.x - (previous.x + previous.width);
    const em = Math.max(previous.fontSize, current.fontSize);

    if (gap > em * SPACE_GAP) out += " ";
    out += current.str;
  }

  // Collapses any doubled whitespace, including spaces already inside item.str.
  // Load-bearing — do not remove it in favour of guards at the append site.
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Splits lines into paragraphs on vertical gaps larger than the document's normal
 * leading. PDF has no paragraph concept; this is where it gets reconstructed, and
 * it is the reason plain extractText output is not sufficient for chunking.
 */
export function linesToParagraphs(lines: Line[], gapFactor = 1.4): string[] {
  if (lines.length === 0) return [];

  const paragraphs: string[] = [];
  let buffer: string[] = [];

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

      if (wideGap || sizeChanged) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
    }
    buffer.push(line.text);
  }

  if (buffer.length > 0) paragraphs.push(buffer.join(" "));
  return paragraphs.filter((p) => p.trim().length > 0);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Known limitation: RTL and vertical scripts.
 *
 * `a.x - b.x` and `current.x - (previous.x + previous.width)` both assume text flows
 * left-to-right. For items where `dir` is "rtl" or "ttb" the sort order and the gap
 * arithmetic are both wrong. Detectable via item.dir if a document ever needs it.
 */

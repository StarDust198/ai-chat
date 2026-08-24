import type { Line } from "./lines";

/** Pages a document needs before repetition is measurable at all. */
const MIN_PAGES_TO_STRIP = 2;
/** Occurrences required before repetition is evidence rather than coincidence. */
const MIN_REPEATS = 2;
/**
 * Fraction of pages a header must appear on. Well below 1 because running headers
 * are routinely absent from cover pages, section dividers, and landscape pages.
 */
const REPEAT_RATIO = 0.6;
/** Drift allowed between occurrences of one header, in points. */
const POSITION_TOLERANCE = 6;

/** "Annual Report 2024 — page 1" and "… page 28" must normalise to the same key. */
const normalise = (str: string) =>
  str.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

const inMargin = (line: Line, pageHeight: number) =>
  line.y > pageHeight * 0.9 || line.y < pageHeight * 0.1;

/**
 * Boilerplate repeats at a stable position. Repeated text alone is not enough: "Table 1."
 * and "Table 2." normalise to the same key, so two captions that happen to fall in a
 * margin band are otherwise indistinguishable from a running header.
 */
const positionStable = (positions: number[]) =>
  Math.max(...positions) - Math.min(...positions) <= POSITION_TOLERANCE;

/**
 * Removes running headers and footers, identified by repeating in a margin band at a
 * consistent height across pages.
 *
 * Removed lines are returned whole rather than as the keys that matched them: a caller
 * wanting the printed page number or the running title needs the original text, and
 * normalising has replaced every digit with a placeholder.
 */
export function stripBoilerplate(
  pages: Line[][],
  pageHeights: number[],
): { pages: Line[][]; removed: Line[] } {
  // Degrades silently otherwise: a missing height makes both inMargin comparisons
  // NaN, so every line on that page reads as body text.
  if (pages.length !== pageHeights.length)
    throw new Error(
      `stripBoilerplate: ${pages.length} pages, ${pageHeights.length} heights`,
    );

  // Not enough pages for repetition to mean anything.
  if (pages.length < MIN_PAGES_TO_STRIP) return { pages, removed: [] };

  // One entry per page per key, so a key's array length is also the number of pages
  // it appeared on.
  const baselines = new Map<string, number[]>();

  for (const [i, lines] of pages.entries()) {
    const seen = new Set<string>();

    for (const line of lines.filter((line) => inMargin(line, pageHeights[i]))) {
      const key = normalise(line.text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      baselines.set(key, [...(baselines.get(key) ?? []), line.y]);
    }
  }

  const threshold = Math.max(
    MIN_REPEATS,
    Math.ceil(pages.length * REPEAT_RATIO),
  );
  const boilerplate = new Set(
    [...baselines]
      .filter(
        ([, positions]) =>
          positions.length >= threshold && positionStable(positions),
      )
      .map(([key]) => key),
  );

  const cleaned: Line[][] = [];
  const removed: Line[] = [];

  for (const [i, lines] of pages.entries()) {
    const kept: Line[] = [];

    for (const line of lines) {
      const isBoilerplate =
        inMargin(line, pageHeights[i]) && boilerplate.has(normalise(line.text));

      (isBoilerplate ? removed : kept).push(line);
    }

    cleaned.push(kept);
  }

  return { pages: cleaned, removed };
}

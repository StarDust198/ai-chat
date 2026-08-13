// lib/pdf/boilerplate.ts
import type { Line } from "./lines";

/** Pages a document needs before repetition is measurable at all. */
const MIN_PAGES_TO_STRIP = 2;
/** Occurrences required before repetition is evidence rather than coincidence. */
const MIN_REPEATS = 2;
const REPEAT_RATIO = 0.6;
/** Allowed header/footer shift. */
const POSITION_TOLERANCE = 6;

/** "Annual Report 2024 — page 1" and "… page 28" must normalise to the same key. */
const normalise = (str: string) =>
  str.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

const inMargin = (line: Line, pageHeight: number) =>
  line.y > pageHeight * 0.9 || line.y < pageHeight * 0.1;

/**
 * Boilerplate repeats at a stable position. Repeated text alone is not enough:
 * "Table 1." and "Table 2." normalise to the same key, so two captions that happen
 * to fall in a margin band are otherwise indistinguishable from a running header.
 */
const positionStable = (ys: number[]) =>
  Math.max(...ys) - Math.min(...ys) <= POSITION_TOLERANCE;

export function stripBoilerplate(
  pages: Line[][],
  pageHeights: number[],
): { pages: Line[][]; removed: string[] } {
  // Degrades silently otherwise: a missing height makes both inMargin comparisons
  // NaN, so every line on that page reads as body text.
  if (pages.length !== pageHeights.length)
    throw new Error(
      `stripBoilerplate: ${pages.length} pages, ${pageHeights.length} heights`,
    );

  // Not enough pages for repetition to mean anything.
  if (pages.length < MIN_PAGES_TO_STRIP) return { pages, removed: [] };

  // At most one entry per page, so a key's array length is also the number of
  // pages it appeared on.
  const baselines = new Map<string, number[]>();

  for (const [i, lines] of pages.entries()) {
    const seen = new Set<string>(); // count once per page
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
      .filter(([, ys]) => ys.length >= threshold && positionStable(ys))
      .map(([key]) => key),
  );

  const cleaned = pages.map((lines, i) =>
    lines.filter(
      (line) =>
        !(
          inMargin(line, pageHeights[i]) &&
          boilerplate.has(normalise(line.text))
        ),
    ),
  );

  return { pages: cleaned, removed: [...boilerplate] };
}

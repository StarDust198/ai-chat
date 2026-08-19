import { stripBoilerplate } from "./boilerplate";
import { extractTextItemsFromPDF } from "./extract";
import { assessLayout, type LayoutAssessment } from "./layout";
import {
  itemsToLines,
  joinWithGaps,
  linesToParagraphs,
  median,
  type BBox,
  type Line,
} from "./lines";

export interface PdfParagraph {
  text: string;
  /**
   * What this paragraph is. "table" can only ever come from a model: position and
   * font size cannot tell a table row from a paragraph, which is why a page holding
   * one is routed away from this reconstruction in the first place.
   */
  kind: "heading" | "paragraph" | "table";
  /**
   * The section heading this paragraph sits under, carried forward across page
   * boundaries — page 2 of a section that began on page 1 keeps that heading. Null
   * before the document's first heading. Filled in by threadHeadings.
   */
  heading: string | null;
  /** Where it sits on the page. Null when the text did not come from the layout. */
  bbox: BBox | null;
  /**
   * "layout" — reconstructed from text positions on the page. "model" — extracted by
   * an LLM because the layout defeated reconstruction, as tables and multi-column
   * pages do. Answers who decided, where kind answers what was decided.
   */
  source: "layout" | "model";
}

export interface PdfPage {
  /** 1-based physical page index, as a citation would render it. */
  page: number;
  /**
   * The page number the document prints on itself, when that disagrees with the
   * physical index — front matter numbered i, ii, iii, or an offprint starting at
   * 47. Null when it agrees, or when the PDF declares no labels at all.
   */
  label: string | null;
  /**
   * The page's /Rotate value, 0 for almost everything. Text coordinates are stored
   * unrotated, so at 90 or 270 a page authored in the rotated frame has its visual
   * lines running down the y axis and this layer reads them out of order. The margin
   * bands are still correct; the reading order is not.
   */
  rotation: number;
  /**
   * Whether the paragraphs below can be trusted. A "complex" page still carries
   * layout-derived paragraphs — they are the fallback — but its columns, table cells,
   * or scanned content need extracting by other means before they are worth citing.
   */
  layout: LayoutAssessment;
  paragraphs: PdfParagraph[];
}

export interface PdfDocument {
  /**
   * The document's own title, for citation display — "Expense and Reimbursement
   * Policy" reads better than "03-expense-policy.pdf". Null when the layout offers no
   * candidate, in which case the caller should fall back to the filename.
   */
  title: string | null;
  pages: PdfPage[];
}

/** A title is set meaningfully larger than body text, not merely emphasised. */
const TITLE_SIZE_RATIO = 1.15;
/** Font sizes within this many points count as the same size. */
const SIZE_TOLERANCE = 0.5;

/**
 * The line set in the largest font on page one, falling back to the running header.
 *
 * Only the items at the title's own size are joined. On a multi-column page the title
 * shares a baseline with body text from the neighbouring column, and taking the whole
 * line would splice that text onto the end of the title.
 */
function deriveTitle(
  firstPage: Line[],
  removed: Line[],
  firstPageHeight: number,
  bodySize: number,
): string | null {
  const candidates = firstPage.filter(
    (line) => line.fontSize > bodySize * TITLE_SIZE_RATIO,
  );

  if (candidates.length > 0) {
    const size = Math.max(...candidates.map((line) => line.fontSize));
    // Lines arrive in reading order, so the first match is the topmost.
    const line = candidates.find((candidate) => candidate.fontSize === size)!;
    const title = joinWithGaps(
      line.items.filter(
        (item) => Math.abs(item.fontSize - size) <= SIZE_TOLERANCE,
      ),
    );

    if (title) return title;
  }

  // A running header names the document on every page, which makes it the next best
  // title. Top margin only — the footer is the other thing stripped from that band.
  return (
    removed.find((line) => line.page === 1 && line.y > firstPageHeight * 0.5)
      ?.text ?? null
  );
}

/**
 * A label is worth carrying only when it disagrees with the physical index. A
 * PageLabels dictionary that merely spells out 1, 2, 3 tells a citation nothing, and
 * keeping it would put a redundant string on every chunk of every document.
 */
const pageLabel = (raw: string | undefined, page: number): string | null => {
  const label = raw?.trim();
  return label && label !== String(page) ? label : null;
};

/**
 * Turns a PDF into pages of citable text.
 *
 * The only supported entry point. Stage order and page numbering are defined here
 * and nowhere else, so a second caller cannot assemble them differently and end up
 * citing the wrong page.
 */
export async function pdfToDocument(
  data: Uint8Array | ArrayBuffer,
): Promise<PdfDocument> {
  const { items, heights, rotations, hasImages, labels } =
    await extractTextItemsFromPDF(data);

  // Page numbers are 1-based from here down; they reach the reader in citations.
  const lines = items.map((pageItems, i) => itemsToLines(pageItems, i + 1));

  const { pages, removed } = stripBoilerplate(lines, heights);

  const bodySize = median(pages.flat().map((line) => line.fontSize));
  const title = deriveTitle(pages[0] ?? [], removed, heights[0], bodySize);

  const pdfPages: PdfPage[] = [];

  for (const [i, pageLines] of pages.entries()) {
    const paragraphs: PdfParagraph[] = [];

    // Paragraphs are built per page and never merged across one: a paragraph that
    // spans a page break cannot be attributed to a single page, and a citation needs
    // exactly one.
    for (const paragraph of linesToParagraphs(pageLines)) {
      paragraphs.push({
        text: paragraph.text,
        // The only evidence available here is size: anything set larger than the
        // body is a heading, and nothing distinguishes a table row from prose.
        kind: paragraph.fontSize > bodySize ? "heading" : "paragraph",
        heading: null,
        bbox: paragraph.bbox,
        source: "layout",
      });
    }

    pdfPages.push({
      page: i + 1,
      label: pageLabel(labels?.[i], i + 1),
      rotation: rotations[i],
      // Assessed on the cleaned lines: a running footer spaces its fields across the
      // page and would read as tabular on every page of a document that has one.
      layout: assessLayout(pageLines, rotations[i], hasImages[i]),
      paragraphs,
    });
  }

  threadHeadings(pdfPages, title);

  return { title, pages: pdfPages };
}

/**
 * Gives every paragraph the heading it sits under, carrying it across page
 * boundaries — page 2 of a section that began on page 1 keeps that heading.
 *
 * Runs over the whole document rather than inside the page loop because it has to be
 * run again whenever paragraphs are replaced: a page re-extracted by other means
 * contributes its own headings, and every page after it inherits from there.
 *
 * Reads kind rather than font size, so it behaves the same on paragraphs that never
 * had a font size to measure.
 */
export function threadHeadings(pages: PdfPage[], title: string | null) {
  let heading: string | null = null;

  for (const page of pages)
    for (const paragraph of page.paragraphs) {
      // The title is set larger than any heading, but it names the document rather
      // than a section and PdfDocument.title already carries it.
      if (paragraph.kind === "heading" && paragraph.text !== title)
        heading = paragraph.text;

      paragraph.heading = heading;
    }
}

import { extractTextItems, getDocumentProxy, getResolvedPDFJS } from "unpdf";
import type { StructuredTextItem } from "unpdf";

// Uint8Array is accepted so callers can pass readFile's Buffer directly. Reaching
// for its .buffer is a trap: Node serves small files from a shared pool, so the
// underlying ArrayBuffer can be larger than the file and start at a byte offset.
// new Uint8Array(typedArray) copies element-wise and honours both.
type PdfBytes = Uint8Array | ArrayBuffer;

/**
 * Characters below which a page is worth inspecting for images. Reading the operator
 * list means parsing the content stream, which is real work across a long document,
 * and a page with this much text cannot be a scan whatever it paints.
 *
 * Deliberately far more generous than the threshold the layout verdict uses, because
 * the count here is taken before running headers and footers are stripped.
 */
const IMAGE_CHECK_TEXT_GATE = 200;

type PdfPageProxy = Awaited<
  ReturnType<Awaited<ReturnType<typeof getDocumentProxy>>["getPage"]>
>;

/**
 * Whether a page paints an image, checked only where it could change a verdict.
 *
 * A page with no text layer and a page that is simply empty are indistinguishable by
 * text alone, and only one of them has content worth recovering.
 */
async function detectImages(
  pages: PdfPageProxy[],
  items: StructuredTextItem[][],
): Promise<boolean[]> {
  const { OPS } = await getResolvedPDFJS();
  const imageOps = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintImageMaskXObjectRepeat,
  ]);

  return Promise.all(
    pages.map(async (page, i) => {
      const characters = (items[i] ?? []).reduce(
        (total, item) => total + item.str.trim().length,
        0,
      );

      if (characters >= IMAGE_CHECK_TEXT_GATE) return false;

      const { fnArray } = await page.getOperatorList();
      return fnArray.some((operator) => imageOps.has(operator));
    }),
  );
}

/**
 * Reads a PDF's positioned text items and the per-page geometry the later stages
 * measure against. Everything returned is plain numbers, strings, and objects, so
 * it stays valid after the parsed document is released.
 */
export async function extractTextItemsFromPDF(data: PdfBytes) {
  // Opened here because page viewports and labels are reachable only through the
  // document, which unpdf's extractTextItems does not expose.
  const pdf = await getDocumentProxy(new Uint8Array(data));

  try {
    const { items } = await extractTextItems(pdf);

    const [pages, labels] = await Promise.all([
      Promise.all(
        Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)),
      ),
      // Null unless the PDF carries a PageLabels dictionary, which most do not.
      pdf.getPageLabels(),
    ]);

    return {
      items,
      // Heights come from the MediaBox, not getViewport(). A viewport describes the
      // page as displayed and so swaps width and height at /Rotate 90 and 270, while
      // item coordinates stay unrotated. Measuring one against the other puts the
      // margin bands in the wrong place: on a rotated A4 the top band would begin at
      // 535 instead of 758, and body text would be mistaken for a running header.
      heights: pages.map(({ view }) => view[3] - view[1]),
      rotations: pages.map(({ rotate }) => rotate),
      // False also means "not checked" — see the gate in detectImages. Only
      // meaningful for pages that carry too little text to stand on their own.
      hasImages: await detectImages(pages, items),
      labels,
    };
  } finally {
    // unpdf releases only documents it opened itself, so one opened here is ours to
    // release. destroy() lives on the loading task, not on the document proxy.
    await pdf.loadingTask.destroy();
  }
}

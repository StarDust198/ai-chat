import { extractTextItems, getDocumentProxy } from "unpdf";

// Uint8Array is accepted so callers can pass readFile's Buffer directly. Reaching
// for its .buffer is a trap: Node serves small files from a shared pool, so the
// underlying ArrayBuffer can be larger than the file and start at a byte offset.
// new Uint8Array(typedArray) copies element-wise and honours both.
type PdfBytes = Uint8Array | ArrayBuffer;

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
    const { totalPages, items } = await extractTextItems(pdf);

    const [pages, labels] = await Promise.all([
      Promise.all(
        Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)),
      ),
      // Null unless the PDF carries a PageLabels dictionary, which most do not.
      pdf.getPageLabels(),
    ]);

    return {
      totalPages,
      items,
      // Heights come from the MediaBox, not getViewport(). A viewport describes the
      // page as displayed and so swaps width and height at /Rotate 90 and 270, while
      // item coordinates stay unrotated. Measuring one against the other puts the
      // margin bands in the wrong place: on a rotated A4 the top band would begin at
      // 535 instead of 758, and body text would be mistaken for a running header.
      heights: pages.map(({ view }) => view[3] - view[1]),
      rotations: pages.map(({ rotate }) => rotate),
      labels,
    };
  } finally {
    // unpdf releases only documents it opened itself, so one opened here is ours to
    // release. destroy() lives on the loading task, not on the document proxy.
    await pdf.loadingTask.destroy();
  }
}

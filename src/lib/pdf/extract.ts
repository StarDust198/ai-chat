import { extractText, extractTextItems, getDocumentProxy } from "unpdf";

export async function extractTextFromPDF(buffer: ArrayBuffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  return {
    totalPages,
    text,
  };
}

export async function extractTextItemsFromPDF(buffer: ArrayBuffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, items } = await extractTextItems(pdf);

  const heights = await Promise.all(
    Array.from({ length: pdf.numPages }, (_, index) =>
      pdf.getPage(index + 1).then((p) => p.getViewport({ scale: 1 }).height),
    ),
  );

  return {
    totalPages,
    items,
    heights,
    pdf,
  };
}

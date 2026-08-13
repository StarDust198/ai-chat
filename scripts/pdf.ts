import { stripBoilerplate } from "@/lib/pdf/boilerplate";
import { extractTextFromPDF, extractTextItemsFromPDF } from "@/lib/pdf/extract";
import { itemsToLines, linesToParagraphs } from "@/lib/pdf/lines";
import { readFile } from "node:fs/promises";

const main = async () => {
  // const buffer = await fetch(
  //   "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  // ).then((res) => res.arrayBuffer());
  const { buffer } = await readFile("./mock-data/pdf/01-company-overview.pdf");

  // const fileBuffer = await readFile("./mock-data/pdf/01-company-overview.pdf");
  // const buffer = fileBuffer.buffer.slice(
  //   fileBuffer.byteOffset,
  //   fileBuffer.byteOffset + fileBuffer.byteLength,
  // );

  // const { totalPages, text } = await extractTextFromPDF(buffer);
  const { totalPages, items, heights } = await extractTextItemsFromPDF(buffer);

  const { pages } = stripBoilerplate(
    items.map((pageItems, i) => itemsToLines(pageItems, i + 1)),
    heights,
  );

  console.log(`Total pages: ${totalPages}`);
  // console.log(text);
  console.log(linesToParagraphs(pages[0]));
  // console.log(heights);
  // console.log(pdf);
};

main();

import { pdfToDocument } from "@/lib/pdf/document";
import { readFile } from "node:fs/promises";

const main = async () => {
  // const bytes = new Uint8Array(
  //   await fetch(
  //     "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  //   ).then((res) => res.arrayBuffer()),
  // );
  const bytes = await readFile("./mock-data/pdf/15-glossary.pdf");

  const { title, pages } = await pdfToDocument(bytes);

  console.log(`${title ?? "(untitled)"} — ${pages.length} pages`);
  for (const { page, paragraphs, layout } of pages) {
    console.log(
      `\n--- page ${page} — ${paragraphs.length} paragraphs, layout: ${JSON.stringify(layout)}`,
    );
    for (const { heading, text } of paragraphs)
      console.log(`  [${heading ?? "—"}] ${text.slice(0, 90)}`);
  }
};

main();

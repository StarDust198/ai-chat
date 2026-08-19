import { pdfToDocument, type PdfPage } from "@/lib/pdf/document";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Prints the layout verdict and the raw signals behind it for every page available,
 * so the thresholds in lib/pdf/layout.ts can be set from measurements rather than
 * guesses. The flagged share is the cost input for routing pages to a model.
 */

const DIRS = ["./mock-data/pdf", "./mock-data/pdf-fixtures"];

const describe = (page: PdfPage) => {
  const { kind, reasons, gutterWidth, wideGapRatio } = page.layout;
  const verdict = kind === "complex" ? `COMPLEX ${reasons.join(",")}` : "prose";

  return (
    `  p${page.page} ${verdict.padEnd(28)}` +
    ` gutter=${gutterWidth.toFixed(0).padStart(3)}pt` +
    ` wideGaps=${(wideGapRatio * 100).toFixed(0).padStart(3)}%` +
    ` paragraphs=${String(page.paragraphs.length).padStart(2)}`
  );
};

async function main() {
  let pages = 0;
  let flagged = 0;
  const byReason = new Map<string, number>();

  for (const dir of DIRS) {
    const files = (await readdir(dir)).filter((file) => file.endsWith(".pdf"));

    for (const file of files.sort()) {
      const doc = await pdfToDocument(await readFile(path.join(dir, file)));
      console.log(`\n${file} — ${doc.title ?? "(untitled)"}`);

      for (const page of doc.pages) {
        console.log(describe(page));
        pages++;
        if (page.layout.kind === "complex") flagged++;
        for (const reason of page.layout.reasons)
          byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
      }
    }
  }

  const share = ((flagged / pages) * 100).toFixed(0);
  console.log(`\n${flagged}/${pages} pages flagged (${share}%)`);
  for (const [reason, count] of [...byReason].sort(
    (left, right) => right[1] - left[1],
  ))
    console.log(`  ${reason}: ${count}`);
}

main();

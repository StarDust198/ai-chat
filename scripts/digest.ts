import { pdfToDocument } from "@/lib/pdf/document";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Fingerprints the deterministic pipeline so a change to anything downstream of it can
 * be shown not to have moved it.
 *
 * The model reader replaces paragraphs on complex pages only, and only after
 * pdfToDocument has returned. Nothing it does may alter what pdfToDocument produces, and
 * a digest is the cheapest way to prove that across a whole corpus: one number to
 * compare rather than 352 paragraphs to read.
 */

const DIR = "./mock-data/pdf";

/** Length that keeps the digest readable in a commit message without collision risk. */
const DIGEST_LENGTH = 32;

const EXPECTED = {
  digest: "82de7d63c1809ef8456a59c6cc511a64",
  documents: 15,
  titles: 15,
  paragraphs: 352,
  headings: 76,
  badBoxes: 0,
};

/**
 * A bbox that cannot describe a rectangle on a page.
 *
 * Page dimensions are not carried on PdfPage, so this checks what is checkable without
 * re-parsing every file: coordinates that are finite, ordered, and non-negative. PDF
 * space has its origin at the bottom-left corner, so nothing on a page is negative.
 */
const isBadBox = (box: { x0: number; y0: number; x1: number; y1: number }) =>
  ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) ||
  box.x0 > box.x1 ||
  box.y0 > box.y1 ||
  Math.min(box.x0, box.y0, box.x1, box.y1) < 0;

const report = (label: string, actual: number | string, expected: number | string) =>
  console.log(
    `  ${(actual === expected ? "ok  " : "FAIL") + " " + label.padEnd(12)}` +
      ` ${String(actual).padStart(32)}` +
      (actual === expected ? "" : `  expected ${expected}`),
  );

async function main() {
  const files = (await readdir(DIR)).filter((file) => file.endsWith(".pdf"));

  const hash = createHash("sha256");
  const totals = { documents: 0, titles: 0, paragraphs: 0, headings: 0, badBoxes: 0 };

  // Sorted so the digest is a property of the corpus rather than of readdir's order.
  for (const file of files.sort()) {
    const doc = await pdfToDocument(await readFile(path.join(DIR, file)));

    totals.documents++;
    if (doc.title !== null) totals.titles++;

    for (const { page, paragraphs } of doc.pages)
      for (const { heading, text, kind, bbox } of paragraphs) {
        hash.update(`${page}|${heading}|${text}\n`);

        totals.paragraphs++;
        if (kind === "heading") totals.headings++;
        if (bbox && isBadBox(bbox)) totals.badBoxes++;
      }
  }

  const digest = hash.digest("hex").slice(0, DIGEST_LENGTH);

  console.log(`\n${DIR} — deterministic pipeline\n`);
  report("digest", digest, EXPECTED.digest);
  report("documents", totals.documents, EXPECTED.documents);
  report("titles", totals.titles, EXPECTED.titles);
  report("paragraphs", totals.paragraphs, EXPECTED.paragraphs);
  report("headings", totals.headings, EXPECTED.headings);
  report("badBoxes", totals.badBoxes, EXPECTED.badBoxes);

  const failed =
    digest !== EXPECTED.digest ||
    totals.documents !== EXPECTED.documents ||
    totals.titles !== EXPECTED.titles ||
    totals.paragraphs !== EXPECTED.paragraphs ||
    totals.headings !== EXPECTED.headings ||
    totals.badBoxes !== EXPECTED.badBoxes;

  console.log(failed ? "\nThe deterministic path moved.\n" : "\nUnchanged.\n");
  if (failed) process.exitCode = 1;
}

main();

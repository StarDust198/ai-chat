import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes synthetic PDFs for the branches no real document in mock-data reaches:
 * page rotation, PageLabels dictionaries, a scanned page, and a blank one.
 *
 * These are hand-assembled rather than produced by a library because the features
 * under test live in the page dictionary, not in the content — a generator would be
 * a heavier dependency than the fifty lines it saves.
 */

const OUT_DIR = "./mock-data/pdf-fixtures";
const PAGE = { width: 595, height: 842 };

/** Numbers the objects, then indexes them in a cross-reference table by byte offset. */
function buildPdf(objects: string[]): Buffer {
  let pdf = "%PDF-1.7\n";
  const offsets: number[] = [];

  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  const size = objects.length + 1;

  // Every xref entry must be exactly 20 bytes, trailing space included.
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;

  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const stream = (dict: string, data: string) =>
  `<< ${dict} /Length ${Buffer.byteLength(data, "latin1")} >>\nstream\n${data}\nendstream`;

const mediaBox = `/MediaBox [0 0 ${PAGE.width} ${PAGE.height}]`;

/** Two identical pages of text at one font size, at the given /Rotate. */
function rotated(rotate: number): Buffer {
  const lines: [number, string][] = [
    [800, "Running header on every page"],
    [700, "Body paragraph that repeats verbatim on both pages"],
    [620, "Second body line also repeated on both pages"],
    [560, "Third body line repeated as well"],
    [300, "Unique middle content"],
    [40, "Footer CONFIDENTIAL"],
  ];
  const content = lines
    .map(([y, text]) => `BT /F1 11 Tf 50 ${y} Td (${text}) Tj ET`)
    .join("\n");
  const page = `<< /Type /Page /Parent 2 0 R ${mediaBox} /Rotate ${rotate} /Contents 5 0 R /Resources << /Font << /F1 6 0 R >> >> >>`;

  return buildPdf([
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>`,
    page,
    page,
    stream("", content),
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ]);
}

/** Four empty pages carrying a /PageLabels numbering scheme. */
function labelled(nums: string): Buffer {
  return buildPdf([
    `<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [${nums}] >> >>`,
    `<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R] /Count 4 >>`,
    ...Array.from(
      { length: 4 },
      () => `<< /Type /Page /Parent 2 0 R ${mediaBox} >>`,
    ),
  ]);
}

/**
 * A two-column page under a full-width title and abstract, in the proportions a
 * conference paper uses: a gutter wide enough to divide the page but narrower than
 * the three-em bar the tabular signal watches for.
 *
 * Both detector signals miss this on their own. The braided lines carry a gap too
 * small to read as tabular, and the spanning lines above cover the gutter beneath
 * them, so a coverage count that trusted every line would find no band at all.
 */
function twoColumn(): Buffer {
  // Helvetica at 10pt averages ~4.46pt per character, so the spanning lines run to
  // roughly 410pt and the columns to 223pt each. That puts the left column's edge at
  // 280 against a right column opening at 298: an 18pt gutter, comfortably over the
  // 12pt a gutter must reach and comfortably under the 30pt that reads as tabular.
  const spanning: [number, string][] = [
    [790, "Delivery Semantics for Event Infrastructure Operated at Substantial and Steadily Increasing Scale"],
    [772, "A. Sarapuu and T. Brenner, Nordvane OU, Tallinn, Estonia, and a number of other places besides it"],
    [742, "Abstract. Each of these lines runs the full width of the text block that sits above two columns of"],
    [730, "body text, which is precisely the arrangement that defeats any coverage count trusting every line"],
    [718, "equally, because the gutter underneath begins immediately below this final line of the abstract."],
  ];

  // Left column widths are hand-tuned to land within a few points of each other:
  // the narrowest gap decides whether a gutter is found at all, and the widest
  // decides whether the page also reads as tabular. Both must stay between them.
  const columns: [number, string, string][] = [
    [690, "Webhook delivery is rebuilt at every company that", "company that attempts it, and in much the same way"],
    [678, "attempts it, and in much the same way each single", "is the observation that the company was founded on"],
    [666, "time, which is the observation the company itself.", "and retries come first, then ordering, and then a"],
    [654, "was founded upon. Retries come first, and then the", "rewrite that the second attempt made unavoidable"],
    [642, "ordering guarantees, and then the full rewrites the", "for everyone who was involved in it afterwards, so"],
    [630, "second attempt made unavoidable for everyone in", "none of these teams wanted to be in this business"],
    [618, "afterwards. None of these teams ever wanted to be", "at all, and none of them costed the work up front"],
    [606, "in this business at all, and none of them costed it", "which turns out to matter rather more than any of"],
    [594, "the work before beginning it, which is the part of it", "the individual technical decisions taken along the"],
    [582, "it that matters more than any technical decision at", "way toward shipping something that actually works"],
  ];

  const content = [
    ...spanning.map(([y, text]) => `BT /F1 10 Tf 57 ${y} Td (${text}) Tj ET`),
    ...columns.flatMap(([y, left, right]) => [
      `BT /F1 10 Tf 57 ${y} Td (${left}) Tj ET`,
      `BT /F1 10 Tf 298 ${y} Td (${right}) Tj ET`,
    ]),
  ].join("\n");

  return buildPdf([
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R ${mediaBox} /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    stream("", content),
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ]);
}

/** One page painting an image and holding no text — a scan with no OCR layer. */
function scanned(): Buffer {
  // Four grey samples stretched over the whole page. The pixels are irrelevant; the
  // detector only looks for the paintImageXObject operator this produces.
  const pixels = "00FF7F40>";
  const content = `q ${PAGE.width} 0 0 ${PAGE.height} 0 0 cm /Im0 Do Q`;

  return buildPdf([
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R ${mediaBox} /Contents 5 0 R /Resources << /XObject << /Im0 4 0 R >> >> >>`,
    stream(
      `/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode`,
      pixels,
    ),
    stream("", content),
  ]);
}

/** One page with neither text nor images — the case that must not route. */
function blank(): Buffer {
  return buildPdf([
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R ${mediaBox} >>`,
  ]);
}

const fixtures: Record<string, Buffer> = {
  "rot-0": rotated(0),
  "rot-90": rotated(90),
  "rot-180": rotated(180),
  "rot-270": rotated(270),
  // i, ii then 1, 2 — front matter, the case where labels carry real information.
  "labels-roman": labelled("0 << /S /r >> 2 << /S /D >>"),
  // 1, 2, 3, 4 — a dictionary saying nothing the page index does not.
  "labels-plain": labelled("0 << /S /D >>"),
  "labels-offset": labelled("0 << /S /D /St 47 >>"),
  "labels-prefix": labelled("0 << /S /D /P (A-) >>"),
  "two-column": twoColumn(),
  scanned: scanned(),
  blank: blank(),
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const [name, bytes] of Object.entries(fixtures)) {
    await writeFile(path.join(OUT_DIR, `${name}.pdf`), bytes);
    console.log(`${name}.pdf — ${bytes.byteLength} bytes`);
  }
}

main();

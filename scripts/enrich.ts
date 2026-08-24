import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { extractViaBatch } from "@/lib/extraction/batch";
import {
  isFaithful,
  pagesToGroups,
  pagesToRequestParams,
  parseExtraction,
  selectComplexPages,
  type PageFacts,
} from "@/lib/extraction/shared";
import { enrichComplexPages } from "@/lib/extraction/sync";
import {
  extractionJsonSchema,
  pagesToPrompt,
  PROMPT_HASH,
} from "@/lib/extraction/schema";
import { pdfToDocument, type PdfDocument } from "@/lib/pdf/document";
import type { LayoutReason } from "@/lib/pdf/layout";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Everything the page reader does before it needs the network: which pages would be sent,
 * what they would be sent with, and what the validation layers do to a response that is
 * wrong in each of the ways a response can be wrong.
 *
 *   pnpm tsx scripts/enrich.ts            offline checks only
 *   pnpm tsx scripts/enrich.ts --live     one synchronous read, billed
 *   pnpm tsx scripts/enrich.ts --batch    the same work batched, billed
 */

const DIRS = ["./mock-data/pdf"];

/** Pages the detector should flag, and pages it should leave alone. */
const EXPECTED_SELECTION: [string, number, boolean][] = [
  ["15-glossary.pdf", 1, true],
  ["09-pricing-and-plans.pdf", 1, true],
];

const EXPECTED_FLAGGED = 20;
const EXPECTED_PAGES = 29;

const check = (passed: boolean, label: string) =>
  console.log(`  ${passed ? "ok  " : "FAIL"} ${label}`);

/** The little a page has to carry for the faithfulness check. */
const facts = (
  layoutText: string,
  reasons: LayoutReason[] = ["wide-gaps"],
): PageFacts => ({ page: 1, reasons, layoutText });

const LAYOUT_TEXT =
  "Idempotency key An optional client supplied identifier that makes a retried" +
  " request safe to process twice without duplicating the effect";

async function selection() {
  console.log("\n=== pages that would be sent ===\n");

  const selected = new Map<string, number[]>();
  let pages = 0;
  let flagged = 0;

  for (const dir of DIRS) {
    const files = (await readdir(dir)).filter((file) => file.endsWith(".pdf"));

    for (const file of files.sort()) {
      const doc = await pdfToDocument(await readFile(path.join(dir, file)));
      const complex = selectComplexPages(doc);

      pages += doc.pages.length;
      flagged += complex.length;
      selected.set(
        file,
        complex.map((page) => page.page),
      );

      if (complex.length === 0) continue;

      const reasons = complex
        .map((page) => `p${page.page} ${page.layout.reasons.join(",")}`)
        .join("  ");

      console.log(`  ${file.padEnd(32)} ${reasons}`);
    }
  }

  console.log(`\n  ${flagged}/${pages} pages would be sent`);
  check(flagged === EXPECTED_FLAGGED, `flagged ${flagged}, expected ${EXPECTED_FLAGGED}`);
  check(pages === EXPECTED_PAGES, `pages ${pages}, expected ${EXPECTED_PAGES}`);

  console.log("\n=== named pages ===\n");
  for (const [file, page, shouldSend] of EXPECTED_SELECTION) {
    const sends = selected.get(file)?.includes(page) ?? false;
    check(
      sends === shouldSend,
      `${file} p${page} ${sends ? "sent" : "kept"}${shouldSend === sends ? "" : " — WRONG"}`,
    );
  }
}

async function request() {
  console.log("\n=== the request ===\n");
  console.log(`  prompt hash ${PROMPT_HASH}\n`);
  console.log(pagesToPrompt([1, 3, 7]).replace(/^/gm, "  "));

  console.log("\n  json schema:");
  console.log(JSON.stringify(extractionJsonSchema, null, 2).replace(/^/gm, "  "));

  const bytes = await readFile("./mock-data/pdf/15-glossary.pdf");
  const params = pagesToRequestParams(bytes, [1]);

  // The base64 blob is the whole file and would bury everything else.
  const body = JSON.parse(JSON.stringify(params));
  for (const block of body.messages[0].content)
    if (block.type === "document")
      block.source.data = `<${block.source.data.length} base64 chars>`;

  console.log("\n  body:");
  console.log(JSON.stringify(body, null, 2).replace(/^/gm, "  "));
}

function validation() {
  console.log("\n=== layer 2: page identity ===\n");

  const good = parseExtraction(
    JSON.stringify({ pages: [{ page: 3, blocks: [{ type: "paragraph", text: "hi" }] }] }),
    [3],
  );
  check(good?.has(3) === true, "the requested page is accepted");

  check(
    parseExtraction(
      JSON.stringify({ pages: [{ page: 4, blocks: [] }] }),
      [3],
    ) === null,
    "a page that was never asked for is rejected",
  );

  check(
    parseExtraction(
      JSON.stringify({ pages: [{ page: 3, blocks: [] }] }),
      [3, 7],
    ) === null,
    "a missing page rejects the whole response",
  );

  check(
    parseExtraction(
      JSON.stringify({
        pages: [
          { page: 3, blocks: [] },
          { page: 3, blocks: [] },
        ],
      }),
      [3, 7],
    ) === null,
    "a duplicated page does not pass as a complete set",
  );

  check(parseExtraction("not json at all", [3]) === null, "unparseable JSON is rejected");

  check(
    parseExtraction(JSON.stringify({ pages: [{ page: 3 }] }), [3]) === null,
    "a response missing blocks is rejected",
  );

  console.log("\n=== request splitting ===\n");

  const many = Array.from({ length: 95 }, (_, i) => i + 1);
  const groups = pagesToGroups(many);

  check(pagesToGroups([1, 2, 3]).length === 1, "a small page list stays one request");
  check(
    groups.flat().join(",") === many.join(","),
    "splitting loses no page and preserves order",
  );
  check(
    groups.every((group) => group.length <= 40),
    "no group exceeds what one response can hold",
  );
  check(
    groups.length === Math.ceil(many.length / 40),
    `95 pages split into ${groups.length} requests`,
  );
  check(pagesToGroups([]).length === 0, "no pages means no request");

  console.log("\n=== layer 3: faithfulness ===\n");

  check(
    isFaithful(facts(LAYOUT_TEXT), [
      { type: "heading", text: "Idempotency key" },
      {
        type: "paragraph",
        text:
          "An optional client supplied identifier that makes a retried request safe" +
          " to process twice without duplicating the effect",
      },
    ]),
    "the same words, unbraided and reordered, pass",
  );

  check(
    !isFaithful(facts(LAYOUT_TEXT), [
      { type: "paragraph", text: "A key that makes retries safe." },
    ]),
    "a summary is rejected",
  );

  check(
    isFaithful(facts(LAYOUT_TEXT), [
      { type: "table", text: `| Term | Meaning |\n| --- | --- |\n| ${LAYOUT_TEXT} | ` },
    ]),
    "added Markdown table syntax does not count against it",
  );

  check(
    isFaithful(facts("", ["image-only"]), [
      { type: "paragraph", text: "Text only the model can see." },
    ]),
    "an image-only page skips the check it cannot run",
  );

  check(
    isFaithful(facts("Figure 3"), [{ type: "paragraph", text: "Something else" }]),
    "too few words to judge passes rather than guesses",
  );

  // A page with plenty of layout words the model did not return: the word floor cannot
  // apply, so passing proves the image-only branch is what let it through.
  check(
    isFaithful(facts(LAYOUT_TEXT, ["image-only"]), [
      { type: "paragraph", text: "Nothing in common with the layout at all." },
    ]),
    "image-only passes on its own branch, not by falling through the word floor",
  );
}

/** Enough of the corpus to see each interesting case, and nothing more. */
const LIVE_DOCS = [
  "15-glossary.pdf", // two braided columns — the clearest before/after
  "09-pricing-and-plans.pdf", // a pricing table, which should come back as one block
  "01-company-overview.pdf", // two complex pages in one document
];

const show = (paragraphs: { heading: string | null; kind: string; text: string }[]) => {
  for (const { heading, kind, text } of paragraphs) {
    const body = text.length > 400 ? `${text.slice(0, 400)}…` : text;
    console.log(`    (${kind}) [${heading ?? "—"}]`);
    console.log(body.replace(/^/gm, "      "));
  }
};

async function load() {
  const client = new Anthropic();
  const loaded = [];

  console.log("\n=== token cost, measured ===\n");

  for (const file of LIVE_DOCS) {
    const bytes = await readFile(path.join("./mock-data/pdf", file));
    const doc = await pdfToDocument(bytes);
    const pages = selectComplexPages(doc).map((page) => page.page);

    const { model, messages } = pagesToRequestParams(bytes, pages);
    const { input_tokens } = await client.messages.countTokens({ model, messages });

    console.log(
      `  ${file.padEnd(30)} ${doc.pages.length}pp` +
        ` — sending ${pages.length} page(s) [${pages.join(", ")}]` +
        ` — ${String(input_tokens).padStart(5)} input tokens`,
    );

    loaded.push({ file, bytes, doc });
  }

  return loaded;
}

type Loaded = Awaited<ReturnType<typeof load>>;

function compare(loaded: Loaded, enriched: PdfDocument[]) {
  for (const [i, { file, doc }] of loaded.entries())
    for (const before of selectComplexPages(doc)) {
      const after = enriched[i].pages.find((page) => page.page === before.page)!;

      console.log(`\n--- ${file} p${before.page} [${before.layout.reasons.join(",")}]`);
      console.log(`\n  before — layout, ${before.paragraphs.length} paragraphs:`);
      show(before.paragraphs);
      console.log(
        `\n  after — ${after.paragraphs[0]?.source ?? "unchanged"},` +
          ` ${after.paragraphs.length} paragraphs:`,
      );
      show(after.paragraphs);
    }
}

/** The synchronous transport, end to end: what an upload does, with the caller waiting. */
async function live() {
  const loaded = await load();

  console.log("\n=== synchronous read ===\n");

  const started = Date.now();
  const enriched = [];
  for (const { bytes, doc } of loaded)
    enriched.push(await enrichComplexPages(doc, bytes));

  console.log(`  returned in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  compare(loaded, enriched);
}

/**
 * The batch transport: every document in one batch, half price, and a long wait. What a
 * re-index does — leave it running, the queue takes ten minutes to over an hour.
 */
async function batch() {
  const loaded = await load();

  console.log("\n=== batch ===\n");

  const started = Date.now();
  const enriched = await extractViaBatch(loaded);
  console.log(`\n  finished in ${((Date.now() - started) / 1000).toFixed(0)}s`);

  compare(loaded, enriched);
}

async function main() {
  if (process.argv.includes("--live")) {
    await live();
    return;
  }

  if (process.argv.includes("--batch")) {
    await batch();
    return;
  }

  await selection();
  await request();
  validation();
}

main();

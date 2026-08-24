import "dotenv/config";
import { ingestDocument } from "@/lib/rag/ingest";
import { pdfSource, textSource, type DocumentSource } from "@/lib/rag/sources";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Ingests the mock corpus.
 *
 *   pnpm tsx scripts/ingest.ts                the PDFs, pausing after each
 *   pnpm tsx scripts/ingest.ts --yes          the PDFs, without pausing
 *   pnpm tsx scripts/ingest.ts --txt          the plain-text copies instead
 *   pnpm tsx scripts/ingest.ts --all          both
 *   pnpm tsx scripts/ingest.ts --only a,b     only files whose name contains a or b
 *   pnpm tsx scripts/ingest.ts --delay 0      no wait between documents (default 30s)
 *
 * --only exists because a live ingest of a complex page costs money: it is how you try
 * two documents before committing the corpus to a model re-read.
 *
 * --delay is for the embedding provider's free tier, and defaults to spacing documents
 * well apart because that tier rejects a burst outright: a run at 2s spacing got five
 * documents in and was then refused through 62 seconds of the SDK's own backoff. The
 * limit does replenish — a later run finished the remaining ten — so spacing is the lever
 * that works, not retrying. One request covers one document, so this delays a dozen calls
 * rather than hundreds. Pass --delay 0 on paid credits, where none of this applies.
 *
 * mock-data/txt holds the same fifteen documents as mock-data/pdf, so --all stores the
 * corpus twice and retrieval returns near-duplicate passages from two documents. Useful
 * for exercising the text path, misleading for judging retrieval quality — hence PDFs by
 * default.
 */

const TEXT_DIR = "./mock-data/txt";
const PDF_DIR = "./mock-data/pdf";
const USER_ID = "user_3EfGCicqs0zZFVz1bvnXeb64ycb";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const rl = createInterface({ input: process.stdin, output: process.stdout });

const args = process.argv.slice(2);
const wantsText = args.includes("--txt") || args.includes("--all");
const wantsPdf = args.includes("--all") || !args.includes("--txt");
const pauses = !args.includes("--yes");

const only = (args[args.indexOf("--only") + 1] ?? "")
  .split(",")
  .map((part) => part.trim())
  .filter((part) => part.length > 0 && !part.startsWith("--"));

const wanted = (filename: string) =>
  only.length === 0 || only.some((part) => filename.includes(part));

/**
 * Milliseconds between documents. 0 — the default — is back to back.
 *
 * The flag's presence is checked before its value, unlike --only above: indexOf returns
 * -1 when absent, and args[0] is a perfectly good number if the script is ever called
 * with a bare one.
 */
/** Spacing between documents when --delay is not passed. */
const DEFAULT_DELAY_MS = 30_000;

// A malformed value falls back to the default rather than to 0: the default exists to
// keep a run under the free tier's limit, and silently disabling it is the one outcome
// worth ruling out. `--delay 0` is still an explicit, valid way to turn it off.
const delayIndex = args.indexOf("--delay");
const delayArg = delayIndex === -1 ? NaN : Number(args[delayIndex + 1]);
const delayMs =
  Number.isFinite(delayArg) && delayArg >= 0 ? delayArg : DEFAULT_DELAY_MS;

/**
 * How much of the document a model read.
 *
 * Worth printing because the fallback is silent: a document whose complex pages all failed
 * extraction ingests exactly as cleanly as one where every page came back.
 */
const summarise = ({ segments }: DocumentSource) => {
  const model = segments.filter((segment) => segment.source === "model").length;

  return `${segments.length} segments` + (model > 0 ? `, ${model} from the model` : "");
};

async function ingest(source: DocumentSource) {
  await ingestDocument(USER_ID, source);
  console.log(`  ingested ${source.filename.padEnd(32)} ${summarise(source)}`);

  // The prompt is a review gate, not a rate limit, so --delay is only consulted when
  // there is nothing already stopping between documents.
  if (pauses) await rl.question("  press enter to continue... ");
  else if (delayMs) await sleep(delayMs);
}

const filesIn = async (dir: string, pattern: RegExp) =>
  (await readdir(dir))
    .filter((file) => pattern.test(file) && wanted(file))
    .sort();

async function main() {
  if (wantsPdf) {
    console.log(`\n${PDF_DIR}\n`);

    for (const filename of await filesIn(PDF_DIR, /\.pdf$/)) {
      const bytes = await readFile(path.join(PDF_DIR, filename));
      await ingest(await pdfSource(filename, bytes));
    }
  }

  if (wantsText) {
    console.log(`\n${TEXT_DIR}\n`);

    for (const filename of await filesIn(TEXT_DIR, /\.(txt|md)$/)) {
      const text = await readFile(path.join(TEXT_DIR, filename), "utf8");
      await ingest(textSource(filename, text));
    }
  }

  console.log("\ndone — run scripts/verify.ts to check what landed\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    rl.close();
    return prisma.$disconnect();
  });

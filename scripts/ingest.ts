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
 * A live ingest of a complex page costs money, so --only is how you try two documents
 * before committing the whole corpus to a model re-read.
 *
 * --delay spaces out embedding requests, which the provider's free tier rejects in a
 * burst; retrying does not help, since the limit replenishes over minutes. One request
 * covers one document. Pass --delay 0 on paid credits.
 *
 * mock-data/txt holds the same fifteen documents as mock-data/pdf, so --all stores the
 * corpus twice and retrieval returns near-duplicate passages. Useful for exercising the
 * text path, misleading for judging retrieval quality — hence PDFs by default.
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

/** Milliseconds between documents when --delay is not passed. */
const DEFAULT_DELAY_MS = 30_000;

// A malformed value falls back to the default rather than to 0, since silently removing
// the spacing is the one outcome worth ruling out. `--delay 0` still turns it off.
const delayIndex = args.indexOf("--delay");
const delayArg = delayIndex === -1 ? NaN : Number(args[delayIndex + 1]);
const delayMs =
  Number.isFinite(delayArg) && delayArg >= 0 ? delayArg : DEFAULT_DELAY_MS;

/**
 * How much of the document a model read. Worth printing because the fallback is silent: a
 * document whose complex pages all failed extraction ingests exactly as cleanly as one
 * where every page came back.
 */
const summarise = ({ segments }: DocumentSource) => {
  const model = segments.filter((segment) => segment.source === "model").length;

  return `${segments.length} segments` + (model > 0 ? `, ${model} from the model` : "");
};

async function ingest(source: DocumentSource) {
  await ingestDocument(USER_ID, source);
  console.log(`  ingested ${source.filename.padEnd(32)} ${summarise(source)}`);

  // The prompt is a review gate, not a rate limit, so --delay only applies when nothing
  // is already stopping between documents.
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

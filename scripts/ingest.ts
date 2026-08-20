import "dotenv/config";
import { ingestDocument } from "@/lib/rag/ingest";
import { pdfSource, textSource, type DocumentSource } from "@/lib/rag/sources";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
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
 *
 * --only exists because a live ingest of a complex page costs money: it is how you try
 * two documents before committing the corpus to a model re-read.
 *
 * mock-data/txt holds the same fifteen documents as mock-data/pdf, so --all stores the
 * corpus twice and retrieval returns near-duplicate passages from two documents. Useful
 * for exercising the text path, misleading for judging retrieval quality — hence PDFs by
 * default.
 */

const TEXT_DIR = "./mock-data/txt";
const PDF_DIR = "./mock-data/pdf";
const USER_ID = "dev-user";

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
  if (pauses) await rl.question("  press enter to continue... ");
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

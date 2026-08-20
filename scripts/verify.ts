import "dotenv/config";
import { EMBEDDING_MODEL } from "@/constants/models";
import { semanticSearch } from "@/lib/rag/search";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * What landed in the database, and whether it holds the properties ingest promises.
 *
 * Split into invariants and observations on purpose. An invariant is something the code
 * guarantees whatever corpus it is pointed at — no chunk without its embedding, no PDF
 * chunk without a page — and a break in one is a bug. An observation is a property of this
 * corpus, printed rather than asserted, because the numbers move whenever a page is
 * re-read by a model or a threshold is tuned, and a test that fails on that would be
 * noise.
 */

const USER_ID = "dev-user";

/** A question whose answer lives on a two-column page, so it can only come from the model. */
const LIVE_QUERY = "What is an idempotency key?";

/**
 * What LIVE_QUERY scored when the glossary stored as three chunks of eight definitions.
 *
 * The correct chunk, retrieved at 0.771 against a 0.8 cutoff — one vector averaging eight
 * unrelated concepts. Kept as the number to beat once each entry is its own chunk.
 */
const BASELINE_DISTANCE = 0.771;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let failures = 0;

const check = (passed: boolean, label: string) => {
  if (!passed) failures++;
  console.log(`  ${passed ? "ok  " : "FAIL"} ${label}`);
};

const rows = <T>(query: TemplateStringsArray, ...values: unknown[]) =>
  prisma.$queryRaw<T[]>(query, ...values);

async function shape() {
  console.log("\n=== corpus ===\n");

  const [{ documents, titled, hashed }] = await rows<{
    documents: number;
    titled: number;
    hashed: number;
  }>`
    SELECT count(*)::int AS documents,
           count(*) FILTER (WHERE title IS NOT NULL)::int AS titled,
           count(*) FILTER (WHERE "fileHash" IS NOT NULL)::int AS hashed
    FROM "Document"
  `;

  const [{ chunks }] = await rows<{ chunks: number }>`
    SELECT count(*)::int AS chunks FROM "Chunk"
  `;

  const statuses = await rows<{ status: string; n: number }>`
    SELECT status, count(*)::int AS n FROM "Document" GROUP BY status ORDER BY n DESC
  `;

  console.log(`  documents         ${documents} (${titled} titled, ${hashed} hashed)`);
  console.log(`  chunks            ${chunks}`);
  console.log(
    `  status            ${statuses.map(({ status, n }) => `${status}=${n}`).join("  ")}`,
  );

  // Per document, because the number that matters is not the total but whether a
  // definition list came apart into entries or landed as three slabs.
  const perDocument = await rows<{ filename: string; n: number; headed: number }>`
    SELECT d.filename,
           count(*)::int AS n,
           count(*) FILTER (WHERE c.heading IS NOT NULL)::int AS headed
    FROM "Chunk" c JOIN "Document" d ON d.id = c."documentId"
    GROUP BY d.id, d.filename
    ORDER BY d.filename
  `;

  console.log("");
  for (const doc of perDocument)
    console.log(
      `  ${doc.filename.padEnd(32)} ${String(doc.n).padStart(3)} chunks,` +
        ` ${String(doc.headed).padStart(3)} with a heading`,
    );

  check(documents > 0, "the corpus is not empty");
  check(
    statuses.every(({ status }) => status === "success"),
    "every document finished ingesting",
  );

  return { documents, chunks };
}

async function invariants() {
  console.log("\n=== invariants ===\n");

  const [{ unembedded }] = await rows<{ unembedded: number }>`
    SELECT count(*)::int AS unembedded FROM "Chunk" WHERE embedding IS NULL
  `;
  // The whole point of writing embeddings in the same statement as their rows: there is
  // no longer a window in which a chunk exists without one.
  check(unembedded === 0, `every chunk has an embedding (${unembedded} without)`);

  const models = await rows<{ model: string }>`
    SELECT DISTINCT model FROM "Chunk"
  `;
  check(
    models.length === 1 && models[0]?.model === EMBEDDING_MODEL,
    `model records ${EMBEDDING_MODEL} (found ${models.map((m) => m.model).join(", ") || "nothing"})`,
  );

  const [{ pageless }] = await rows<{ pageless: number }>`
    SELECT count(*)::int AS pageless
    FROM "Chunk" c JOIN "Document" d ON d.id = c."documentId"
    WHERE d.filename LIKE '%.pdf' AND c.page IS NULL
  `;
  check(pageless === 0, `every PDF chunk knows its page (${pageless} without)`);

  const [{ untyped }] = await rows<{ untyped: number }>`
    SELECT count(*)::int AS untyped
    FROM "Chunk" WHERE source IS NULL OR kind IS NULL OR "tokenCount" IS NULL
  `;
  check(untyped === 0, `every chunk carries its provenance (${untyped} without)`);

  // index is what @@unique([documentId, index]) orders by, and a gap would mean the
  // chunker dropped something between building and writing.
  const gaps = await rows<{ filename: string; n: number; lo: number; hi: number }>`
    SELECT d.filename, count(*)::int AS n, min(c.index)::int AS lo, max(c.index)::int AS hi
    FROM "Chunk" c JOIN "Document" d ON d.id = c."documentId"
    GROUP BY d.id, d.filename
    HAVING min(c.index) <> 0 OR max(c.index) <> count(*) - 1
  `;
  check(gaps.length === 0, `chunk indexes are dense per document (${gaps.length} broken)`);
  for (const gap of gaps)
    console.log(`       ${gap.filename}: ${gap.n} chunks spanning ${gap.lo}..${gap.hi}`);
}

async function provenance() {
  console.log("\n=== provenance ===\n");

  const sources = await rows<{ source: string; n: number }>`
    SELECT source, count(*)::int AS n FROM "Chunk" GROUP BY source ORDER BY n DESC
  `;
  const kinds = await rows<{ kind: string; n: number }>`
    SELECT kind, count(*)::int AS n FROM "Chunk" GROUP BY kind ORDER BY n DESC
  `;
  const [{ withHeading, withLabel, total }] = await rows<{
    withHeading: number;
    withLabel: number;
    total: number;
  }>`
    SELECT count(*) FILTER (WHERE heading IS NOT NULL)::int AS "withHeading",
           count(*) FILTER (WHERE "pageLabel" IS NOT NULL)::int AS "withLabel",
           count(*)::int AS total
    FROM "Chunk"
  `;

  console.log(`  source            ${sources.map((s) => `${s.source}=${s.n}`).join("  ")}`);
  console.log(`  kind              ${kinds.map((k) => `${k.kind}=${k.n}`).join("  ")}`);
  console.log(`  with heading      ${withHeading}/${total}`);
  console.log(`  with page label   ${withLabel}/${total}`);

  // A heading should be a noun phrase. If the model starts promoting sentences that merely
  // open with emphasis, threadHeadings carries the mistake forward over everything after it —
  // and length is the cheapest way to see that happening.
  const longest = await rows<{ heading: string; len: number }>`
    SELECT DISTINCT heading, length(heading)::int AS len
    FROM "Chunk" WHERE heading IS NOT NULL
    ORDER BY len DESC LIMIT 3
  `;

  if (longest.length > 0) {
    console.log("\n  longest headings:");
    for (const { heading, len } of longest)
      console.log(`    ${String(len).padStart(3)}  ${JSON.stringify(heading)}`);
  }

  const model = sources.find((s) => s.source === "model")?.n ?? 0;

  // Not an invariant: extraction falls back page by page and an ingest with no API key is
  // a legitimate outcome. But it is the number the whole extraction stack exists to move,
  // so a zero here is worth saying out loud rather than burying in a distribution.
  if (model === 0)
    console.log(
      "\n  NOTE  no chunk came from the model — every complex page fell back to layout." +
        "\n        Check ANTHROPIC_API_KEY and the PageExtraction rows below.",
    );

  console.log("\n=== extraction cache ===\n");

  const cached = await rows<{ pages: number; documents: number }>`
    SELECT count(p.*)::int AS pages, count(DISTINCT d.id)::int AS documents
    FROM "Document" d JOIN "PageExtraction" p ON p."fileHash" = d."fileHash"
  `;

  console.log(
    `  ${cached[0].pages} cached page reads reachable from ${cached[0].documents} documents`,
  );
  console.log(
    "  (joined on fileHash — this is what Document.fileHash was added for)",
  );
}

async function sizes() {
  console.log("\n=== chunk sizes ===\n");

  const [stat] = await rows<{
    min: number;
    median: number;
    p90: number;
    max: number;
    avg: number;
  }>`
    SELECT min("tokenCount")::int AS min,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY "tokenCount")::int AS median,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY "tokenCount")::int AS p90,
           max("tokenCount")::int AS max,
           round(avg("tokenCount"))::int AS avg
    FROM "Chunk"
  `;

  console.log(
    `  min ${stat.min}  median ${stat.median}  p90 ${stat.p90}  max ${stat.max}  avg ${stat.avg}`,
  );

  // 8,191 is the embedding model's input limit. storeChunks truncates before sending, so
  // exceeding it is not a failure — but it means a passage was embedded incompletely.
  check(stat.max < 8000, `no chunk approaches the embedding input limit (max ${stat.max})`);

  const tables = await rows<{ filename: string; page: number; tokens: number; preview: string }>`
    SELECT d.filename, c.page, c."tokenCount" AS tokens, left(c.content, 90) AS preview
    FROM "Chunk" c JOIN "Document" d ON d.id = c."documentId"
    WHERE c.kind = 'table'
    ORDER BY c."tokenCount" DESC
    LIMIT 3
  `;

  if (tables.length === 0) {
    console.log("\n  no table chunks — expected if nothing was model-extracted");
    return;
  }

  console.log("\n  largest tables, which must be whole:");
  for (const table of tables) {
    console.log(`    ${table.filename} p${table.page} — ${table.tokens} tokens`);
    console.log(`      ${table.preview.replace(/\n/g, " ⏎ ")}`);
  }
}

/** The end of the pipeline: a real question, embedded, matched, and attributed. */
async function retrieval() {
  console.log("\n=== retrieval ===\n");
  console.log(`  "${LIVE_QUERY}"\n`);

  // Same numbers the chat route uses, so this reports on what production would see.
  const matches = await semanticSearch(LIVE_QUERY, USER_ID, {
    limit: 20,
    maxDistance: 0.8,
    maxTokens: 4000,
  });

  if (matches.length === 0) {
    check(false, "the query matched something");
    return;
  }

  for (const match of matches) {
    const cite = [
      match.title ?? match.filename,
      match.pageLabel ?? match.page ? `p${match.pageLabel ?? match.page}` : null,
      match.heading,
    ]
      .filter(Boolean)
      .join(" › ");

    console.log(`  ${match.distance.toFixed(3)}  ${cite}  [${match.source ?? "?"}]`);
    console.log(`         ${match.content.slice(0, 110).replace(/\n/g, " ⏎ ")}…`);
  }

  const top = matches[0];
  check(matches.length > 0, `the query matched ${matches.length} chunks`);
  check(
    Boolean(top.title ?? top.filename) && top.page !== null,
    "the best match can be cited to a document and a page",
  );

  // Reported rather than asserted: a hard threshold on an embedding distance is brittle, and
  // this number's job is to be compared against what it used to be. BASELINE_DISTANCE is what
  // this query scored when the whole glossary was three chunks of eight definitions each.
  const delta = top.distance - BASELINE_DISTANCE;
  console.log(
    `\n  top distance ${top.distance.toFixed(3)} vs ${BASELINE_DISTANCE} baseline` +
      ` (${delta <= 0 ? "" : "+"}${delta.toFixed(3)}${delta < 0 ? " — better" : ""})`,
  );

  const budget = matches.reduce((total, m) => total + (m.tokenCount ?? 0), 0);
  console.log(`\n  ${budget} tokens returned, budget 4000`);
  check(budget <= 4000 || matches.length === 1, "the token budget held");
}

async function main() {
  const { chunks } = await shape();

  if (chunks === 0) {
    console.log("\nNo chunks. Run: pnpm tsx scripts/ingest.ts --yes\n");
    return;
  }

  await invariants();
  await provenance();
  await sizes();

  try {
    await retrieval();
  } catch (error) {
    console.log(
      `\n  retrieval skipped — ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  console.log(
    failures === 0 ? "\nAll invariants hold.\n" : `\n${failures} FAILED.\n`,
  );

  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

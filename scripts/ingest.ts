import "dotenv/config";
import { ingestDocument } from "@/lib/rag/ingest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const DIR = "./mock-data";
const USER_ID = "dev-user";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function main() {
  for (const filename of await readdir(DIR)) {
    if (!/\.(txt|md)$/.test(filename)) continue;
    const text = await readFile(path.join(DIR, filename), "utf8");
    await ingestDocument(USER_ID, filename, text);
    console.log("ingested", filename);
    await rl.question("Press enter to continue... ");
  }
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

import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  const result = await prisma.note.updateMany({
    where: { createdBy: null },
    data: { createdBy: "user_3EAAG5iJnoO9RbJkKT7kLLsygfp" },
  });
  console.log(`Backfilled ${result.count} rows`);
}

main()
  .catch(console.error)
  .finally(() => process.exit());

import { prisma } from "../prisma";
import { embedQuery } from "./embeddings";

type Hit = {
  id: string;
  content: string;
  documentId: string;
  filename: string;
  distance: number;
};

export async function search(
  query: string,
  userId: string,
  { limit = 5, maxDistance = 0.6 } = {},
): Promise<Hit[]> {
  const queryVector = await embedQuery(query);
  const vec = JSON.stringify(queryVector);

  return prisma.$queryRaw<Hit[]>`
    SELECT
      c.id,
      c.content,
      c."documentId",
      d.filename,
      c.embedding <=> ${vec}::vector AS distance
    FROM "Chunk" c
    JOIN "Document" d ON d.id = c."documentId"
    -- WHERE d."userId" = ${userId}
    --   AND c.embedding IS NOT NULL
    WHERE c.embedding IS NOT NULL
      AND c.embedding <=> ${vec}::vector < ${maxDistance}
    ORDER BY c.embedding <=> ${vec}::vector
    LIMIT ${limit}
  `;
}

import { prisma } from "../prisma";
import { embedQuery } from "./embeddings";

export type SearchMatch = {
  id: string;
  content: string;
  documentId: string;
  filename: string;
  distance: number;
};

export async function semanticSearch(
  query: string,
  userId: string,
  { limit = 5, maxDistance = 0.6 } = {},
): Promise<SearchMatch[]> {
  const queryVector = await embedQuery(query);
  const vec = JSON.stringify(queryVector);

  return prisma.$queryRaw<SearchMatch[]>`
    SELECT
      c.id,
      c.content,
      c."documentId",
      d.filename,
      c.embedding <=> ${vec}::vector AS distance
    FROM "Chunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE c.embedding IS NOT NULL
      AND c.embedding <=> ${vec}::vector < ${maxDistance}
    ORDER BY c.embedding <=> ${vec}::vector
    LIMIT ${limit}
  `;
}

// -- WHERE d."userId" = ${userId}
// --   AND c.embedding IS NOT NULL

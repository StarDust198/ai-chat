import { prisma } from "../prisma";
import { embedChunks } from "./embeddings";

export async function storeChunks(documentId: string, texts: string[]) {
  const vectors = await embedChunks(texts);

  // Step 1 — normal Prisma. Everything except the embedding.
  const created = await prisma.$transaction(
    texts.map((content, index) =>
      prisma.chunk.create({
        data: {
          documentId,
          content,
          index,
          // tokenCount: estimateTokens(content),
        },
        select: { id: true },
      }),
    ),
  );

  // Step 2 — raw SQL. Fill in the embeddings.
  await prisma.$transaction(
    created.map(
      ({ id }, i) =>
        prisma.$executeRaw`
          UPDATE "Chunk"
          SET embedding = ${JSON.stringify(vectors[i])}::vector
          WHERE id = ${id}
        `,
    ),
  );
}

// Alternative bulk
// await prisma.$executeRaw`
//   INSERT INTO "Chunk" (id, "documentId", content, "tokenCount", index, embedding)
//   SELECT
//     gen_random_uuid()::text,
//     ${documentId},
//     t.content,
//     t.token_count,
//     t.idx,
//     t.embedding::vector
//   FROM unnest(
//     ${contents}::text[],
//     ${tokenCounts}::int[],
//     ${indexes}::int[],
//     ${vectors.map((v) => JSON.stringify(v))}::text[]
//   ) AS t(content, token_count, idx, embedding)
// `;

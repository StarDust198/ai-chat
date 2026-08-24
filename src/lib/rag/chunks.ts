import { randomUUID } from "node:crypto";
import { EMBEDDING_MODEL } from "@/constants/models";
import { prisma } from "../prisma";
import type { ChunkInput } from "./chunker";
import { embedChunks } from "./embeddings";

/**
 * Characters of embedding input that are certainly safe to send. text-embedding-3-small
 * accepts 8,191 tokens; with no tokenizer here the ceiling is characters at a pessimistic
 * ~2.5 per token, since erring low costs one passage's tail and erring high costs the
 * whole request. Not derived from ChunkInput.tokenCount, which excludes the breadcrumb.
 */
const MAX_EMBEDDING_CHARS = 20_000;

/**
 * What actually gets embedded: where the passage sits, then the passage. "the limit is $25"
 * is unfindable without "Reimbursement limits" attached.
 *
 * Prefixed here rather than stored in `content`, so what is quoted back to a reader stays
 * the passage as printed while what is matched carries its context. The title is included
 * because nothing else puts it in the vector space; it shifts every chunk of a document
 * equally, changing how the document ranks against others rather than internally.
 */
const chunkToEmbeddingInput = (
  { heading, content }: ChunkInput,
  title: string | null,
) => {
  const breadcrumb = [title, heading].filter(Boolean).join(" › ");
  const text = breadcrumb ? `${breadcrumb}\n\n${content}` : content;

  if (text.length <= MAX_EMBEDDING_CHARS) return text;

  console.warn(
    `storeChunks: truncating ${text.length} characters of embedding input to` +
      ` ${MAX_EMBEDDING_CHARS} — the stored content is unaffected`,
  );

  return text.slice(0, MAX_EMBEDDING_CHARS);
};

/**
 * Embeds the chunks of one document and writes them in a single statement, embeddings
 * included — filling them in afterwards would let a crash strand rows with a null
 * embedding, permanently invisible to search and therefore silent.
 *
 * Raw SQL because embedding is Unsupported() and cannot appear in a Prisma create. Ids are
 * generated here rather than by @default(cuid()), which a raw insert bypasses.
 */
export async function storeChunks(
  documentId: string,
  chunks: ChunkInput[],
  title: string | null,
) {
  if (chunks.length === 0) return;

  const vectors = await embedChunks(
    chunks.map((chunk) => chunkToEmbeddingInput(chunk, title)),
  );

  await prisma.$executeRaw`
    INSERT INTO "Chunk" (
      id, "documentId", content, index, model,
      page, "pageLabel", heading, source, kind, "tokenCount", embedding
    )
    SELECT
      t.id,
      ${documentId},
      t.content,
      t.index,
      ${EMBEDDING_MODEL},
      t.page,
      t.page_label,
      t.heading,
      t.source,
      t.kind,
      t.token_count,
      t.embedding::vector
    FROM unnest(
      ${chunks.map(() => randomUUID())}::text[],
      ${chunks.map((chunk) => chunk.content)}::text[],
      ${chunks.map((chunk) => chunk.index)}::int[],
      ${chunks.map((chunk) => chunk.page)}::int[],
      ${chunks.map((chunk) => chunk.pageLabel)}::text[],
      ${chunks.map((chunk) => chunk.heading)}::text[],
      ${chunks.map((chunk) => chunk.source)}::text[],
      ${chunks.map((chunk) => chunk.kind)}::text[],
      ${chunks.map((chunk) => chunk.tokenCount)}::int[],
      ${vectors.map((vector) => JSON.stringify(vector))}::text[]
    ) AS t(
      id, content, index, page, page_label,
      heading, source, kind, token_count, embedding
    )
  `;
}

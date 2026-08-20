import { randomUUID } from "node:crypto";
import { EMBEDDING_MODEL } from "@/constants/models";
import { prisma } from "../prisma";
import type { ChunkInput } from "./chunker";
import { embedChunks } from "./embeddings";

/**
 * Characters of embedding input that are certainly safe to send.
 *
 * text-embedding-3-small accepts 8,191 tokens. There is no tokenizer in this project, so
 * the ceiling is expressed in characters at a deliberately pessimistic ~2.5 per token
 * rather than the ~4 used for prompt budgeting: erring low costs the tail of one unusually
 * large passage, erring high costs the whole request.
 *
 * Not derived from ChunkInput.tokenCount, which describes `content` alone — the string
 * sent for embedding also carries the heading.
 */
const MAX_EMBEDDING_CHARS = 20_000;

/**
 * What actually gets embedded: where the passage sits, then the passage.
 *
 * A paragraph retrieved on its own has lost the thing that says what it is about — "the
 * limit is $25" is unfindable and unusable without "Reimbursement limits" attached. The
 * breadcrumb is prefixed here rather than stored in `content` so that what is quoted back
 * to a reader stays the passage as printed, while what is matched against a question
 * carries its context. Both remain reproducible from the row: the title lives on
 * Document, the heading on Chunk.
 *
 * The title is included because nothing else puts it in the vector space. deriveTitle
 * finds it, threadHeadings refuses to promote it — correctly, it names the document
 * rather than a section — and the chunker drops heading segments, so a question naming
 * the document had nothing to match against.
 *
 * It shifts every chunk of a document by the same amount, so it changes how this document
 * ranks against others rather than how its own chunks rank against each other. Worth it
 * for a title that means something; closer to noise for a generic one.
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
 * Embeds the chunks of one document and writes them.
 *
 * One statement, with the embeddings in it. The previous shape wrote rows first and filled
 * their embeddings in a second transaction, which left a window: a process that died
 * between the two left rows with a null embedding, permanently invisible to search because
 * of the `embedding IS NOT NULL` filter and therefore silent. unnest closes it and drops
 * the per-row round trips at the same time.
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

import { EMBEDDING_MODEL } from "@/constants/models";
import { prisma } from "../prisma";
import { estimateTokens } from "./chunker";
import { embedQuery } from "./embeddings";

export type SearchMatch = {
  id: string;
  content: string;
  documentId: string;
  filename: string;
  /** The document's own title, when it has one. Fall back to filename for display. */
  title: string | null;
  page: number | null;
  /** Prefer `pageLabel ?? page` when citing — see Chunk.pageLabel. */
  pageLabel: string | null;
  heading: string | null;
  kind: string | null;
  /** "layout" | "model" | "text" — how this passage's text was produced. */
  source: string | null;
  tokenCount: number | null;
  distance: number;
};

/**
 * Trims matches to a token budget, in rank order.
 *
 * A fixed match count is the wrong unit here: chunk sizes are non-uniform by design,
 * because a whole table is one chunk, so seven matches is anywhere from a few hundred
 * tokens to several thousand.
 *
 * Stops at the first match that does not fit rather than skipping it to look for smaller
 * ones further down. Packing more in would mean handing the model a weak short passage
 * over a strong long one, which is the opposite of what ranking is for.
 *
 * The best match is always kept whatever its size: a large table as the top hit would
 * otherwise exceed the budget on its own and return nothing at all.
 */
function withinBudget(matches: SearchMatch[], maxTokens: number): SearchMatch[] {
  const kept: SearchMatch[] = [];
  let total = 0;

  for (const match of matches) {
    const cost = match.tokenCount ?? estimateTokens(match.content);

    if (kept.length > 0 && total + cost > maxTokens) break;

    kept.push(match);
    total += cost;
  }

  return kept;
}

export async function semanticSearch(
  query: string,
  userId: string,
  { limit = 5, maxDistance = 0.6, maxTokens = 4000 } = {},
): Promise<SearchMatch[]> {
  const queryVector = await embedQuery(query);
  const vec = JSON.stringify(queryVector);

  const matches = await prisma.$queryRaw<SearchMatch[]>`
    SELECT
      c.id,
      c.content,
      c."documentId",
      c.page,
      c."pageLabel",
      c.heading,
      c.kind,
      c.source,
      c."tokenCount",
      d.filename,
      d.title,
      c.embedding <=> ${vec}::vector AS distance
    FROM "Chunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE d."userId" = ${userId}
      AND c.embedding IS NOT NULL
      -- Rows embedded by a different model are in a different vector space, so their
      -- distances are not comparable to these and ranking them together is meaningless.
      -- Chunk.model exists for exactly this; see the column's comment in schema.prisma.
      AND c.model = ${EMBEDDING_MODEL}
      AND c.embedding <=> ${vec}::vector < ${maxDistance}
    ORDER BY c.embedding <=> ${vec}::vector
    LIMIT ${limit}
  `;

  return withinBudget(matches, maxTokens);
}

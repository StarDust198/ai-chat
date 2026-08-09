import { EMBEDDING_MODEL } from "@/constants/models";
import { embed, embedMany } from "ai";

const providerOptions = {
  openai: {
    dimensions: 1536,
  },
};

/** Batch — for ingesting document chunks. */
export async function embedChunks(texts: string[]): Promise<number[][]> {
  const { embeddings, usage, responses } = await embedMany({
    model: EMBEDDING_MODEL,
    values: texts,
    providerOptions,
    maxParallelCalls: 2,
  });

  console.log(
    "embedChunks",
    `embedded ${texts.length} chunks, ${usage.tokens} tokens`,
    { responses, embeddings },
  );

  return embeddings;
}

/** Single — for the search query in Part 8. */
export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: text,
    providerOptions,
  });

  return embedding;
}

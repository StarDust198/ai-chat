import { EMBEDDING_MODEL } from "@/constants/models";
import { embed, embedMany } from "ai";

const providerOptions = {
  openai: {
    dimensions: 1536,
  },
};

export async function embedChunks(texts: string[]): Promise<number[][]> {
  const { embeddings, usage, responses } = await embedMany({
    model: EMBEDDING_MODEL,
    values: texts,
    providerOptions,
    maxParallelCalls: 2,
    // More than the default 2: the free tier answers a burst with 429. The SDK backs off
    // exponentially and honours the response's retry-after header, so it waits exactly as
    // long as the server asked.
    maxRetries: 5,
  });

  // Counts only — the embeddings themselves are 1,536 floats per chunk.
  console.log(
    "embedChunks",
    `embedded ${texts.length} chunks, ${usage.tokens} tokens,` +
      ` ${responses?.length ?? 0} request(s)`,
  );

  return embeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: text,
    providerOptions,
  });

  return embedding;
}

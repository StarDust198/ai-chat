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
    /**
     * More attempts than the default 2, because the free tier answers a burst with 429.
     *
     * Raising this rather than sleeping between requests: the SDK already backs off
     * exponentially and reads the response's own retry-after header, so it waits exactly
     * as long as the server asked. A fixed delay is a guess that is either too slow on
     * every run or still too fast on the one that matters.
     *
     * One request covers a whole document — embedMany batches up to the model's
     * maxEmbeddingsPerCall, which no document here comes close to — so this is guarding
     * a handful of calls per corpus, not one per chunk.
     */
    maxRetries: 5,
  });

  // Counts only. Logging `embeddings` here meant 1,536 floats per chunk on every ingest,
  // which buried the per-document summary lines the ingest script prints.
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

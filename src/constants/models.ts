export const EMBEDDING_MODEL = "openai/text-embedding-3-small";

/**
 * Reads pages whose layout defeated geometric reconstruction. Deliberately the strongest
 * model available: these pages have already beaten the cheaper path, so quality is the
 * entire value of the call — the saving comes from the Batches API, not a smaller model.
 *
 * Part of the extraction cache key, so changing it re-reads rather than serving rows
 * produced by the old model.
 */
export const EXTRACTION_MODEL = "claude-opus-5";

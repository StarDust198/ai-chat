import type { LanguageModelUsage } from "ai";

/**
 * Per-model pricing for the AI Elements `Context` component cost display.
 *
 * We compute cost here instead of using `tokenlens` because its bundled catalog
 * lags new Anthropic models (e.g. claude-haiku-4-5-20251001, claude-sonnet-4-6,
 * claude-opus-4-8 are absent), which makes its `getUsage(...).costUSD` resolve to
 * `undefined` and the footer fall back to $0.00.
 */

const TOKENS_PER_UNIT = 1_000_000;

// Prompt-caching multipliers, relative to the base input rate.
const CACHE_READ_MULTIPLIER = 0.1; // cache hits bill at 0.1x input
const CACHE_WRITE_MULTIPLIER = 1.25; // 5-minute cache writes bill at 1.25x input

/**
 * Base rates in USD per million tokens, keyed by model id.
 * Source: Anthropic pricing (platform.claude.com/docs/en/about-claude/pricing),
 * verified 2026-07-04. Update here when Anthropic changes published rates.
 */
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-fable-5": { input: 10, output: 50 },
  // Project Glasswing only; same rates as Fable 5.
  "claude-mythos-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-5-20251101": { input: 5, output: 25 },
  // Introductory pricing through 2026-08-31; reverts to { input: 3, output: 15 }.
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-opus-4-1-20250805": { input: 15, output: 75 },
};

/** Per-token USD rates for a model, or `undefined` if the model is unknown. */
export type ModelRates = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export const getModelRates = (
  modelId: string | undefined,
): ModelRates | undefined => {
  if (!modelId) return undefined;
  const base = PRICING_PER_MTOK[modelId];
  if (!base) return undefined;

  const input = base.input / TOKENS_PER_UNIT;
  const output = base.output / TOKENS_PER_UNIT;
  return {
    input,
    output,
    cacheRead: input * CACHE_READ_MULTIPLIER,
    cacheWrite: input * CACHE_WRITE_MULTIPLIER,
  };
};

/**
 * Cost breakdown for a single assistant message, in USD.
 *
 * `inputUSD`/`outputUSD`/`reasoningUSD`/`cacheUSD` mirror the rows the `Context`
 * component renders. `totalUSD` is the *net* cost the footer should show: it
 * prices cache reads at 0.1x and cache writes at 1.25x rather than charging
 * every input token at the full rate.
 *
 * Notes on the AI SDK usage shape (Anthropic provider):
 *   - `inputTokens` is the total prompt size: `noCache + cacheRead + cacheWrite`.
 *   - `outputTokens` already includes the reasoning tokens (thinking is billed as
 *     output), so `reasoningUSD` is informational and is NOT added to `totalUSD`.
 *   - Cache/reasoning counts come from `inputTokenDetails`/`outputTokenDetails`;
 *     the flat `cachedInputTokens`/`reasoningTokens` fields are deprecated.
 */
export type UsageCost = {
  inputUSD: number;
  outputUSD: number;
  reasoningUSD: number;
  cacheUSD: number;
  totalUSD: number;
};

export const getUsageCost = (
  modelId: string | undefined,
  usage: LanguageModelUsage | undefined,
): UsageCost | undefined => {
  const rates = getModelRates(modelId);
  if (!rates || !usage) return undefined;

  const inputTokens = usage.inputTokens ?? 0; // noCache + cacheRead + cacheWrite
  const outputTokens = usage.outputTokens ?? 0; // includes reasoning
  const reasoningTokens = usage.outputTokenDetails.reasoningTokens ?? 0;
  const cacheReadTokens = usage.inputTokenDetails.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.inputTokenDetails.cacheWriteTokens ?? 0;
  const noCacheTokens =
    usage.inputTokenDetails.noCacheTokens ??
    Math.max(inputTokens - cacheReadTokens - cacheWriteTokens, 0);

  const inputUSD = inputTokens * rates.input;
  const outputUSD = outputTokens * rates.output;
  const reasoningUSD = reasoningTokens * rates.output;
  const cacheUSD = cacheReadTokens * rates.cacheRead;
  const totalUSD =
    noCacheTokens * rates.input +
    cacheReadTokens * rates.cacheRead +
    cacheWriteTokens * rates.cacheWrite +
    outputUSD;

  return { inputUSD, outputUSD, reasoningUSD, cacheUSD, totalUSD };
};

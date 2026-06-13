import { streamText, UIMessage, convertToModelMessages, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { weatherTool } from "@/lib/tools/weather";
import { calcTool } from "@/lib/tools/calc";

const schema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  model: z.string(),
});

// const webSearchTool = anthropic.tools.webSearch_20260209({
const webSearchTool = anthropic.tools.webSearch_20250305({
  maxUses: 5,
});

// Rates per 1M tokens [input, output]. Update from the pricing pages.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
};

function logCost(
  modelId: string,
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  },
) {
  const rate = PRICING[modelId];
  if (!rate) return console.warn(`No pricing for ${modelId}`);

  const totalIn = usage.inputTokens ?? 0;
  const out = usage.outputTokens ?? 0;
  const cachedIn = usage.cachedInputTokens ?? 0; // cache *reads* (subset of totalIn)
  const freshIn = totalIn - cachedIn;

  // cache reads bill at 0.1x the input rate
  const inputCost = (freshIn * rate.in + cachedIn * rate.in * 0.1) / 1_000_000;
  const outputCost = (out * rate.out) / 1_000_000;
  const cost = inputCost + outputCost;

  console.log(
    `[${modelId}] in=${totalIn} (cached ${cachedIn}) out=${out} ` +
      `→ $${cost.toFixed(6)}`,
  );
}

export async function POST(req: Request) {
  const { messages, model: modelId } = schema.parse(await req.json());

  const modelMessages = await convertToModelMessages(messages);

  // mark the final message as the cache breakpoint
  const last = modelMessages.at(-1);
  if (last) {
    last.providerOptions = {
      ...last.providerOptions,
      anthropic: { cacheControl: { type: "ephemeral" } },
    };
  }

  const result = streamText({
    model: anthropic(modelId),
    messages: modelMessages,
    onFinish: ({ usage, providerMetadata }) => {
      logCost(modelId, usage);
      // cache *writes* show up here for Anthropic (billed at 1.25x input):
      console.log(providerMetadata?.anthropic?.cacheCreationInputTokens);
    },
    stopWhen: stepCountIs(5),
    tools: {
      calc: calcTool,
      weather: weatherTool,
      web_search: {
        ...webSearchTool,
        providerOptions: { cacheControl: { type: "ephemeral" } },
      },
    },
  });

  // stopWhen: stepCountIs(5),
  // tools: {
  //   weather: tool({
  //     description: "Get the weather in a location (fahrenheit)",
  //     inputSchema: z.object({
  //       location: z.string().describe("The location to get the weather for"),
  //     }),
  //     execute: async ({ location }) => {
  //       const temperature = Math.round(Math.random() * (90 - 32) + 32);
  //       return {
  //         location,
  //         temperature,
  //       };
  //     },
  //   }),
  //   convertFahrenheitToCelsius: tool({
  //     description: "Convert a temperature in fahrenheit to celsius",
  //     inputSchema: z.object({
  //       temperature: z
  //         .number()
  //         .describe("The temperature in fahrenheit to convert"),
  //     }),
  //     execute: async ({ temperature }) => {
  //       const celsius = Math.round((temperature - 32) * (5 / 9));
  //       return {
  //         celsius,
  //       };
  //     },
  //   }),
  // },
  // onStepFinish: ({ toolResults }) => {
  //   console.log(toolResults);
  // },

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type !== "finish") return;

      return { finishReason: part.finishReason };
    },
  });
}

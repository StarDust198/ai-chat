import { InferUITools, LanguageModelUsage, UIDataTypes, UIMessage } from "ai";
import { z } from "zod";
import { tools } from "@/lib/tools";

export type MyMetadata = {
  finishReason?: FinishReason;
  usage?: LanguageModelUsage;
  modelId?: string;
};

export type MyTools = InferUITools<typeof tools>;

export type MyUIMessage = UIMessage<MyMetadata, UIDataTypes, MyTools>;

export type FinishReason = (typeof FinishReason)[keyof typeof FinishReason];

export const FinishReason = {
  stop: "stop",
  length: "length",
  error: "error",
  other: "other",
  contentFilter: "content-filter",
  toolCalls: "tool-calls",
} as const;

export const metadataSchema = z
  .object({
    finishReason: z.enum(FinishReason).optional(),
    usage: z
      .object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        totalTokens: z.number().optional(),
      })
      .loose()
      .optional(),
    modelId: z.string().optional(),
  })
  .optional();

export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export const MessageRole = {
  user: "user",
  assistant: "assistant",
  system: "system",
} as const;

export type ChatStatus = (typeof ChatStatus)[keyof typeof ChatStatus];

export const ChatStatus = {
  submitted: "submitted",
  streaming: "streaming",
  ready: "ready",
  error: "error",
} as const;

import { UIMessage } from "ai";

export type MyMetadata = {
  finishReason?: FinishReason;
};

export type MyUIMessage = UIMessage<MyMetadata>;

export type FinishReason = (typeof FinishReason)[keyof typeof FinishReason];

export const FinishReason = {
  stop: "stop",
  length: "length",
  error: "error",
  other: "other",
  contentFilter: "content-filter",
  toolCalls: "tool-calls",
} as const;

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

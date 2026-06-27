"use client";

import { AnthropicModel } from "@/lib/api/anthropic";
import { MessageRole, MyUIMessage } from "@/types/chat";
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "../ai-elements/context";
import { memo } from "react";

export type ChatContextProps = {
  models: AnthropicModel[];
  messages: MyUIMessage[];
};

export const ChatContext = memo(({ models, messages }: ChatContextProps) => {
  const lastMessage = messages
    .toReversed()
    .find((message) => message.role === MessageRole.assistant);
  const lastMessageMeta = lastMessage?.metadata;
  const lastMessageUsage = lastMessageMeta?.usage;
  const lastMessageModelId = lastMessageMeta?.modelId;
  const lastMessageModel = lastMessageModelId
    ? models.find((model) => model.id === lastMessageModelId)
    : undefined;

  if (!lastMessageUsage || !lastMessageModel) return null;

  return (
    <Context
      maxTokens={lastMessageModel.max_input_tokens}
      modelId={lastMessageModelId}
      usage={lastMessageUsage}
      usedTokens={
        (lastMessageUsage.inputTokens ?? 0) +
        (lastMessageUsage.outputTokens ?? 0)
      }
    >
      <ContextTrigger />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <ContextInputUsage />
          <ContextOutputUsage />
          <ContextReasoningUsage />
          <ContextCacheUsage />
        </ContextContentBody>
        <ContextContentFooter />
      </ContextContent>
    </Context>
  );
});

ChatContext.displayName = "ChatContext";

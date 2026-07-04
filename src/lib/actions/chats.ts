"use server";

import { prisma } from "@/lib/prisma";
import { Chat } from "@prisma/client";
import { generateText, Output, validateUIMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { metadataSchema, MyUIMessage } from "@/types/chat";
import { tools } from "../tools";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

async function getUserId() {
  const { userId, isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirect("/signin");
  }

  return userId;
}

export async function createChatTitle(
  textToSummarize: string,
): Promise<string> {
  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system:
      "You are a precise text summarizer. Assume text provided is a first message of the user in a conversation and provide a concise, up to 4-5 words summary - title of the possible conversation. Do not add outside knowledge.",
    prompt: `Summarize the following text:\n\n${textToSummarize}`,
    output: Output.text(),
  });

  return text;
}

export async function validateMessages(
  messages: unknown,
): Promise<MyUIMessage[]> {
  if (Array.isArray(messages) && messages.length == 0) return [];

  return await validateUIMessages<MyUIMessage>({
    messages,
    metadataSchema,
    tools,
  });
}

export async function saveChat({
  chatId,
  messages,
}: {
  chatId: string;
  messages: MyUIMessage[];
}): Promise<Chat> {
  const userId = await getUserId();

  const JSONMessages = JSON.stringify(messages, null, 2);

  return await prisma.chat.update({
    where: {
      id: chatId,
      userId,
    },
    data: {
      messages: JSONMessages,
    },
  });
}

export async function createChat({
  userMessage,
  id,
}: {
  userMessage: string;
  id?: string;
}): Promise<Chat> {
  const userId = await getUserId();

  const title = await createChatTitle(userMessage);

  return await prisma.chat.create({
    data: {
      id,
      userId,
      title,
    },
  });
}

export async function getChat({
  chatId,
}: {
  chatId: string;
}): Promise<Chat | null> {
  const userId = await getUserId();

  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      userId,
    },
  });

  if (!chat) return null;

  const messages =
    typeof chat.messages === "string" ? JSON.parse(chat.messages) : [];

  return {
    ...chat,
    messages,
  };
}

export async function getChats(): Promise<Chat[]> {
  const userId = await getUserId();

  return await prisma.chat.findMany({
    where: {
      userId,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

export async function deleteChat({ id }: { id: string }): Promise<Chat> {
  return await prisma.chat.delete({
    where: {
      id,
    },
  });
}

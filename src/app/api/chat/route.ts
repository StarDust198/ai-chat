import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStreamResponse,
  toUIMessageStream,
  TypeValidationError,
  createIdGenerator,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { buildTools } from "@/lib/tools";
import { buildSystemPrompt } from "@/lib/prompts/chat";
import { getChat, saveChat, validateMessages } from "@/lib/actions/chats";
import { MyUIMessage } from "@/types/chat";
import { auth } from "@clerk/nextjs/server";

const schema = z.object({
  // Message is validated below
  message: z.custom<MyUIMessage>(),
  // messages: z.array(z.custom<MyUIMessage>()),
  modelId: z.string(),
  chatId: z.string(),
  /**
   * Which retrieval tools this message may use. Absent means both, so a client that
   * knows nothing about sources — which is every client until the toggles are built —
   * gets the full set.
   */
  sources: z
    .object({ documents: z.boolean(), web: z.boolean() })
    .partial()
    .default({})
    .transform(({ documents = true, web = true }) => ({ documents, web })),
});

export async function POST(req: Request) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { message, modelId, chatId, sources } = parsed.data;

  const chat = await getChat({ chatId });

  if (!chat) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let validatedMessages: MyUIMessage[];

  try {
    validatedMessages = await validateMessages(chat.messages);
  } catch (error) {
    if (error instanceof TypeValidationError) {
      console.error("Database messages validation failed:", error);
      // Could implement message migration or filtering here
      // For now, start with empty history
      validatedMessages = [];
    } else {
      return Response.json(
        { error: "Error validating DB messages" },
        { status: 500 },
      );
    }
  }

  try {
    const [validatedMessage] = await validateMessages([message]);

    validatedMessages.push(validatedMessage);
  } catch (error) {
    console.error("User message validation failed:", error);

    return Response.json(
      { error: "Error validating user message" },
      { status: 400 },
    );
  }

  const modelMessages = await convertToModelMessages(validatedMessages);

  // mark the final message as the cache breakpoint
  const last = modelMessages.at(-1);
  if (last) {
    last.providerOptions = {
      ...last.providerOptions,
      anthropic: { cacheControl: { type: "ephemeral" } },
    };
  }

  // The whole map is always declared and `activeTools` does the narrowing. Which sources
  // are on is a property of this request; the conversation it replays is permanent, so a
  // history holding a web_search call has to stay valid on a turn where web is off.
  const activeTools = [
    "calc",
    "weather",
    ...(sources.documents ? (["search_documents"] as const) : []),
    ...(sources.web ? (["web_search"] as const) : []),
  ] as const;

  const result = streamText({
    model: anthropic(modelId),
    system: buildSystemPrompt(sources),
    messages: modelMessages,
    stopWhen: stepCountIs(5),
    tools: buildTools(userId),
    activeTools,
  });

  // consume the stream to ensure it runs to completion & triggers onEnd
  // even when the client response is aborted:
  result.consumeStream(); // no await

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: validatedMessages,
      generateMessageId: createIdGenerator({
        prefix: "msg",
        size: 16,
      }),
      onEnd: ({ messages }) => {
        saveChat({ chatId, messages });
      },
      messageMetadata: ({ part }) => {
        if (part.type !== "finish") return;

        return {
          finishReason: part.finishReason,
          usage: part.totalUsage,
          modelId,
        };
      },
    }),
  });
}

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
import { tools } from "@/lib/tools";
import { getChat, saveChat, validateMessages } from "@/lib/actions/chats";
import { MyUIMessage } from "@/types/chat";
import { auth } from "@clerk/nextjs/server";
import { SearchMatch, semanticSearch } from "@/lib/rag/search";

const schema = z.object({
  // Message is validated below
  message: z.custom<MyUIMessage>(),
  // messages: z.array(z.custom<MyUIMessage>()),
  modelId: z.string(),
  chatId: z.string(),
});

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * Where a passage came from, as attributes the model can quote back.
 *
 * pageLabel wins over page when it exists, because it is what the page prints on itself —
 * citing "page 4" for a page numbered iv sends the reader to the wrong place. Empty
 * fields are omitted rather than rendered as null, which reads to a model as a fact.
 */
const matchToAttributes = (match: SearchMatch) => {
  const printed = match.pageLabel ?? match.page;

  return [
    `file="${escapeAttribute(match.filename)}"`,
    match.title && `title="${escapeAttribute(match.title)}"`,
    printed !== null && `page="${escapeAttribute(String(printed))}"`,
    match.heading && `heading="${escapeAttribute(match.heading)}"`,
  ]
    .filter(Boolean)
    .join(" ");
};

const createPrompt = (question: string, searchResults: SearchMatch[]) => {
  return `
    You are about to be given a set of documents, matching user's request.
    Your task is to answer user's question using only the information in the documents.
    If there are no documents - say that there's no information available.

    Cite the source of every fact you use: the document's title (or its filename when it
    has no title) and the page it appears on, taken from that document's attributes.

    Here is the user's question:
    <question>
      ${question}
    </question>

    Here are the document parts in the matching order:
    <documents>
      ${searchResults
        .map((match) => {
          return `<document ${matchToAttributes(match)}>${match.content}</document>`;
        })
        .join("\n\n")}
    </documents>
`;
};

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
  const { message, modelId, chatId } = parsed.data;

  // ! Addition
  if (message.parts[0].type === "text") {
    const messageText = message.parts[0].text;
    const searchResults = await semanticSearch(messageText, userId, {
      // A count alone is not a budget: one of these could be a whole table, and a
      // glossary entry is a fortieth of one. maxTokens is the real control; limit is
      // only the cap on how far down the ranking it is worth looking.
      limit: 20,
      maxDistance: 0.8,
      maxTokens: 4000,
    });

    console.log("Chat handler", { searchResults });

    message.parts[0].text = createPrompt(messageText, searchResults);
  }
  // ! Addition

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

  const result = streamText({
    model: anthropic(modelId),
    messages: modelMessages,
    stopWhen: stepCountIs(5),
    tools,
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

"use client";

import { useChat } from "@ai-sdk/react";
import {
  AlertCircleIcon,
  CopyIcon,
  MessageSquare,
  RefreshCcwIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { MessageRole, MyUIMessage } from "@/types/chat";
import { Button } from "../ui/button";
import { AnthropicModel } from "@/lib/api/anthropic";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "../ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "../ai-elements/message";
import {
  PromptInput,
  PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "../ai-elements/prompt-input";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "../ai-elements/model-selector";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { ChatContext } from "./chat-context";
import { DefaultChatTransport } from "ai";
import { useCreateChat } from "@/lib/query/use-chat-hooks";

interface ChatProps {
  models: AnthropicModel[];
  id: string;
  initialMessages: MyUIMessage[];
}

const PREFFERED_MODEL = "haiku";

export function Chat({ id, models, initialMessages }: ChatProps) {
  const [userMessageText, setUserMessageText] = useState("");
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() => {
    return (
      models.find((model) => model.id.includes(PREFFERED_MODEL))?.id ?? null
    );
  });

  const createChatMutation = useCreateChat();
  const { messages, sendMessage, status, regenerate, error } =
    useChat<MyUIMessage>({
      id,
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest({ messages, body }) {
          return {
            body: {
              message: messages[messages.length - 1],
              chatId: body?.chatId,
              modelId: body?.modelId,
            },
          };
        },
      }),
    });

  const handleSubmit = async (message: PromptInputMessage) => {
    const trimmedMessage = message.text.trim();

    if (!trimmedMessage) return;

    if (messages.length === 0) {
      try {
        await createChatMutation.mutateAsync({
          userMessage: trimmedMessage,
          id,
        });
      } catch {
        toast("Error", {
          description: "Couldn't create a new chat",
          action: {
            label: "Retry",
            onClick: () => handleSubmit(message),
          },
        });

        return;
      }
    }

    try {
      await sendMessage(
        { text: message.text },
        { body: { modelId: selectedModelId, chatId: id } },
      );

      setUserMessageText("");
    } catch {
      toast("Error", {
        description: "Couldn't send a message",
        action: {
          label: "Retry",
          onClick: () => handleSubmit(message),
        },
      });
    }
  };

  const handleRegenerate = () => {
    regenerate({ body: { modelId: selectedModelId, chatId: id } });
  };

  const handleModelSelect = useCallback((id: string) => {
    setSelectedModelId(id);
    setIsModelSelectorOpen(false);
  }, []);

  const selectedModelData = models.find(
    (model) => model.id === selectedModelId,
  );

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="grow min-h-0 overflow-y-auto flex flex-col gap-1">
        <Conversation>
          <ConversationContent className="h-full">
            {messages.length > 0 ? (
              <>
                {messages.map((message, messageIndex) => {
                  const isLastMessage = messageIndex === messages.length - 1;
                  const isStreaming = status === "streaming";
                  const isMessageStreaming = isLastMessage && isStreaming;

                  const messageText = message.parts
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("\n\n");

                  return (
                    <Message from={message.role} key={message.id}>
                      <MessageContent>
                        {message.parts.map((part, partIndex) => {
                          switch (part.type) {
                            case "text":
                              return (
                                <MessageResponse
                                  key={`${message.id}-${partIndex}`}
                                >
                                  {part.text}
                                </MessageResponse>
                              );
                            default:
                              return null;
                          }
                        })}
                      </MessageContent>

                      {message.role === MessageRole.assistant &&
                        !isMessageStreaming && (
                          <MessageActions>
                            {isLastMessage && (
                              <MessageAction
                                onClick={() => handleRegenerate()}
                                label="Retry"
                              >
                                <RefreshCcwIcon className="size-3" />
                              </MessageAction>
                            )}

                            <MessageAction
                              onClick={() =>
                                navigator.clipboard.writeText(messageText)
                              }
                              label="Copy"
                            >
                              <CopyIcon className="size-3" />
                            </MessageAction>
                          </MessageActions>
                        )}
                    </Message>
                  );
                })}

                {!!error && (
                  <Alert variant="destructive" className="max-w-3/4">
                    <AlertCircleIcon className="h-4 w-4" />
                    <AlertTitle>{"Couldn't get a response"}</AlertTitle>
                    <AlertDescription className="flex flex-col items-start gap-2">
                      <span className="text-xs">{error.message}</span>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRegenerate()}
                      >
                        Try again
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            ) : (
              <ConversationEmptyState
                icon={<MessageSquare className="size-12" />}
                title="Start a conversation"
                description="Type a message below to begin chatting"
              />
            )}
          </ConversationContent>

          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className="">
        <div className="flex gap-4 justify-between">
          <ModelSelector
            onOpenChange={setIsModelSelectorOpen}
            open={isModelSelectorOpen}
          >
            <ModelSelectorTrigger
              render={
                <Button className="w-50 justify-between" variant="outline">
                  {selectedModelData && (
                    <>
                      <ModelSelectorLogo provider="anthropic" />
                      <ModelSelectorName>
                        {selectedModelData?.display_name}
                      </ModelSelectorName>
                    </>
                  )}
                </Button>
              }
            ></ModelSelectorTrigger>
            <ModelSelectorContent>
              <ModelSelectorInput placeholder="Search models..." />
              <ModelSelectorList>
                <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>

                {models.map((model) => (
                  <ModelSelectorItem
                    key={model.id}
                    onSelect={handleModelSelect}
                    value={model.id}
                    data-checked={selectedModelId === model.id}
                  >
                    <ModelSelectorLogo provider="anthropic" />

                    <ModelSelectorName>{model.display_name}</ModelSelectorName>

                    {/* Show thinking capabilities, etc */}
                    {/* <ModelSelectorLogoGroup>
                  {model.capabilities.map((capability) => (
                    <ModelSelectorLogo key={capability} provider={capability} />
                  ))}
                </ModelSelectorLogoGroup> */}
                  </ModelSelectorItem>
                ))}
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>

          <ChatContext models={models} messages={messages} />
        </div>

        <PromptInput
          onSubmit={handleSubmit}
          className="mt-4 w-full mx-auto relative"
        >
          <PromptInputTextarea
            value={userMessageText}
            placeholder="Say something..."
            onChange={(e) => setUserMessageText(e.currentTarget.value)}
            className="pr-12"
            disabled={status === "submitted" || status === "streaming"}
          />

          <PromptInputSubmit
            status={status === "streaming" ? "streaming" : "ready"}
            disabled={
              !userMessageText.trim() ||
              createChatMutation.isPending ||
              status === "submitted"
            }
            className="absolute bottom-1 right-1"
          />
        </PromptInput>
      </div>
    </div>
  );
}

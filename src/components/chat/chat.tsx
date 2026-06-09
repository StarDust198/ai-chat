"use client";

import { useChat } from "@ai-sdk/react";
import { CopyIcon, MessageSquare, RefreshCcwIcon } from "lucide-react";
import { Fragment, useCallback, useState } from "react";
import { toast } from "sonner";

import { MyUIMessage } from "@/types/chat";
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

interface ChatProps {
  models: AnthropicModel[];
}

const PREFFERED_MODEL = "haiku";

export function Chat({ models }: ChatProps) {
  // const form = useForm<z.infer<typeof FormMessageSchema>>({
  //   defaultValues: {
  //     content: "",
  //     model: models.find((model) => model.id.includes(PREFFERED_MODEL))?.id,
  //   },
  //   reValidateMode: "onBlur",
  //   resolver: zodResolver(FormMessageSchema),
  // });

  const [userMessageText, setUserMessageText] = useState("");
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() => {
    return (
      models.find((model) => model.id.includes(PREFFERED_MODEL))?.id ?? null
    );
  });

  const { messages, sendMessage, status, regenerate } = useChat<MyUIMessage>();

  const handleSubmit = async (message: PromptInputMessage) => {
    const trimmedMessage = message.text.trim();

    if (!trimmedMessage) return;

    try {
      await sendMessage(
        { text: message.text },
        { body: { model: selectedModelId } },
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

  const handleModelSelect = useCallback((id: string) => {
    setSelectedModelId(id);
    setIsModelSelectorOpen(false);
  }, []);

  const hasMessages = messages.length > 0;
  const selectedModelData = models.find(
    (model) => model.id === selectedModelId,
  );

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="grow min-h-0 overflow-y-auto flex flex-col gap-1 px-2">
        <Conversation>
          <ConversationContent>
            {messages.map((message, messageIndex) => (
              <Fragment key={message.id}>
                {hasMessages ? (
                  message.parts.map((part, i) => {
                    switch (part.type) {
                      case "text":
                        const isLastMessage =
                          messageIndex === messages.length - 1;

                        return (
                          <Message
                            from={message.role}
                            key={`${message.id}-${i}`}
                          >
                            <MessageContent>
                              <MessageResponse>{part.text}</MessageResponse>
                            </MessageContent>

                            {message.role === "assistant" && isLastMessage && (
                              <MessageActions>
                                <MessageAction
                                  onClick={() => regenerate()}
                                  label="Retry"
                                >
                                  <RefreshCcwIcon className="size-3" />
                                </MessageAction>

                                <MessageAction
                                  onClick={() =>
                                    navigator.clipboard.writeText(part.text)
                                  }
                                  label="Copy"
                                >
                                  <CopyIcon className="size-3" />
                                </MessageAction>
                              </MessageActions>
                            )}
                          </Message>
                        );
                      default:
                        return null;
                    }
                  })
                ) : (
                  <ConversationEmptyState
                    icon={<MessageSquare className="size-12" />}
                    title="Start a conversation"
                    description="Type a message below to begin chatting"
                  />
                )}
              </Fragment>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className="">
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

        <PromptInput
          onSubmit={handleSubmit}
          className="mt-4 w-full mx-auto relative"
        >
          <PromptInputTextarea
            value={userMessageText}
            placeholder="Say something..."
            onChange={(e) => setUserMessageText(e.currentTarget.value)}
            className="pr-12"
          />

          <PromptInputSubmit
            status={status === "streaming" ? "streaming" : "ready"}
            disabled={!userMessageText.trim()}
            className="absolute bottom-1 right-1"
          />
        </PromptInput>
      </div>
    </div>
  );
}

"use client";

import { useChat } from "@ai-sdk/react";
import { AlertTriangleIcon, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Fragment } from "react";
import { toast } from "sonner";

import {
  ChatStatus,
  FinishReason,
  MessageRole,
  MyUIMessage,
} from "@/types/chat";
import { ChatBubble } from "./chat-bubble";
import { Button } from "../ui/button";
import { AnthropicModel } from "@/lib/api/anthropic";
import { FieldGroup } from "../ui/field";
import { FormMessageSchema } from "@/schemas/message";
import { SelectGroup, SelectItem, SelectLabel } from "../ui/select";
import { FormSelect, FormTextarea } from "../form/form";

interface ChatProps {
  models: AnthropicModel[];
}

const PREFFERED_MODEL = "haiku";

export function Chat({ models }: ChatProps) {
  const form = useForm<z.infer<typeof FormMessageSchema>>({
    defaultValues: {
      content: "",
      model: models.find((model) => model.id.includes(PREFFERED_MODEL))?.id,
    },
    reValidateMode: "onBlur",
    resolver: zodResolver(FormMessageSchema),
  });
  const { messages, sendMessage, status, regenerate } = useChat<MyUIMessage>();

  async function handleSubmit({
    content,
    model,
  }: z.infer<typeof FormMessageSchema>) {
    try {
      await sendMessage({ text: content }, { body: { model } });
      form.resetField("content");
    } catch {
      toast("Error", {
        description: "Couldn't send a message",
        action: {
          label: "Retry",
          onClick: () => handleSubmit({ content, model }),
        },
      });
    }
  }

  const lastMessage = messages[messages.length - 1];
  const isError = status === ChatStatus.error;
  const isStreaming = status === ChatStatus.streaming;
  const isInterrupted =
    lastMessage?.role === MessageRole.assistant &&
    status !== ChatStatus.streaming &&
    status !== ChatStatus.submitted &&
    lastMessage.metadata?.finishReason !== FinishReason.stop;

  console.log({ messages });

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="grow min-h-0 overflow-y-auto flex flex-col gap-1 px-2">
        {messages.map((message) => (
          <Fragment key={message.id}>
            {message.parts.map((part, partIndex) => {
              switch (part.type) {
                case "text":
                  if (message.role === MessageRole.system) return null;

                  if (message.role === MessageRole.user)
                    return (
                      <>
                        <div className="text-end">User:</div>

                        <ChatBubble
                          className="max-w-3/4 self-end"
                          role={MessageRole.user}
                        >
                          {part.text}
                        </ChatBubble>
                      </>
                    );

                  return (
                    <>
                      <div>AI:</div>

                      <div
                        key={`${message.id}-${partIndex}`}
                        className={"prose dark:prose-invert max-w-9/10"}
                      >
                        <Markdown remarkPlugins={[remarkGfm]}>
                          {part.text}
                        </Markdown>
                      </div>
                    </>
                  );
              }
            })}
          </Fragment>
        ))}

        {isStreaming && <Loader2 className="animate-spin" size={12} />}

        {isError ||
          (isInterrupted && (
            <div className="flex gap-1 items-center">
              <AlertTriangleIcon size={16} className="text-red-400" />

              <div className="text-red-400 text-sm">
                {isError
                  ? "Something went wrong..."
                  : "This response was interrupted and may be incomplete"}
              </div>

              <Button
                variant="destructive"
                size="xs"
                className="cursor-pointer"
                onClick={() => regenerate()}
              >
                Retry
              </Button>
            </div>
          ))}
      </div>

      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-2"
      >
        <FieldGroup>
          <FormSelect
            control={form.control}
            name="model"
            getTriggerText={(value: string) =>
              models.find((m) => m.id === value)?.display_name ?? value
            }
          >
            <SelectGroup>
              <SelectLabel>Models</SelectLabel>
              {models.map((model) => {
                return (
                  <SelectItem value={model.id} key={model.id}>
                    {model.display_name}
                  </SelectItem>
                );
              })}
            </SelectGroup>
          </FormSelect>

          <FormTextarea control={form.control} name="content" />

          <Button type="submit">Send</Button>
        </FieldGroup>
      </form>
    </div>
  );
}

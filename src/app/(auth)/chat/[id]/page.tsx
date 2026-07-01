import { Chat } from "@/components/chat/chat";
import { getChat, validateMessages } from "@/lib/actions/chats";
import { anthropicApi } from "@/lib/api/anthropic";

import { chatsOptions } from "@/lib/query/chats-options";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";

export default async function Page(props: PageProps<"/chat/[id]">) {
  const models = await anthropicApi.getModels();

  const { id: chatId } = await props.params;

  const chat = await getChat({ chatId });

  const initialMessages = chat ? await validateMessages(chat.messages) : [];
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery(chatsOptions());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Chat
        models={models.data}
        id={chatId}
        initialMessages={initialMessages}
      />
    </HydrationBoundary>
  );
}

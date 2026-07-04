import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Chat } from "@prisma/client";
import { createChat, deleteChat } from "@/lib/actions/chats";
import { chatsOptions } from "./chats-options";

export function useCreateChat() {
  const queryClient = useQueryClient();
  const { queryKey } = chatsOptions();

  return useMutation({
    mutationFn: createChat,
    onSuccess: (newChat) => {
      queryClient.setQueryData<Chat[]>(queryKey, (old = []) => [
        newChat,
        ...old,
      ]);
    },
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  const { queryKey } = chatsOptions();

  return useMutation({
    mutationFn: deleteChat,
    onSuccess: (deletedChat) => {
      queryClient.setQueryData<Chat[]>(queryKey, (old = []) =>
        old.filter((chat) => chat.id !== deletedChat.id),
      );
    },
  });
}

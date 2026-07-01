import { queryOptions } from "@tanstack/react-query";
import { getChats } from "../actions/chats";

export const chatsOptions = () =>
  queryOptions({
    queryKey: ["chats"],
    queryFn: getChats,
  });

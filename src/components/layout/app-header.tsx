"use client";

import { Show, UserButton } from "@clerk/nextjs";
import { ThemeSwitcher } from "../themes/theme-switcher";
import { SidebarTrigger } from "../ui/sidebar";
import { usePathname } from "next/navigation";
import { NEW_CHAT_TITLE, titleByUrl } from "@/constants/routes";
import { cn } from "@/lib/cn";
import { useQuery } from "@tanstack/react-query";
import { chatsOptions } from "@/lib/query/chats-options";
import { useMemo } from "react";

export type AppHeaderProps = {
  className?: string;
};

export function AppHeader({ className }: AppHeaderProps) {
  const pathname = usePathname();
  const { data: chats } = useQuery(chatsOptions());

  const title = useMemo(() => {
    const match = pathname.match(/^\/chat\/([^/]+)$/);

    if (!match) return titleByUrl[pathname];

    const chatId = match[1];

    return chats?.find((chat) => chat.id === chatId)?.title ?? NEW_CHAT_TITLE;
  }, [chats, pathname]);

  return (
    <div
      className={cn("flex gap-4 items-center shrink-0 py-4 px-6", className)}
    >
      <SidebarTrigger className="shrink-0" />

      <h1 className="text-2xl font-medium grow truncate min-w-0">{title}</h1>

      <ThemeSwitcher />

      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}

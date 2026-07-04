"use client";

import { ReactNode, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Show, SignOutButton } from "@clerk/nextjs";
import {
  ArrowRightEndOnRectangleIcon,
  ArrowRightStartOnRectangleIcon,
  ChatBubbleLeftRightIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import {
  NEW_CHAT_TITLE,
  publicRoutes,
  RouteData,
  RouteKey,
  SIGN_OUT_TITLE,
} from "@/constants/routes";
import { useQuery } from "@tanstack/react-query";
import { chatsOptions } from "@/lib/query/chats-options";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { EllipsisVertical } from "lucide-react";
import { useDeleteChat } from "@/lib/query/use-chat-hooks";

export type AppSidebarItem = {
  title: string;
  url: string;
  icon: ReactNode;
};

export type AppSidebarProps = {
  items: AppSidebarItem[];
};

const routeIconsMap: Record<RouteKey, ReactNode> = {
  signin: <ArrowRightEndOnRectangleIcon />,
  signup: <UserPlusIcon />,
};

export function AppSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const { data: chats } = useQuery(chatsOptions());

  const deleteChatMutation = useDeleteChat();

  const isExpanded = state === "expanded";

  const isNewChatRoute = useMemo(() => {
    const match = pathname.match(/^\/chat\/([^/]+)$/);

    if (!match) return false;

    const id = match[1];

    return !chats?.map((chat) => chat.id).includes(id);
  }, [chats, pathname]);

  const renderRouteGroup = (
    routeGroup: Partial<Record<RouteKey, RouteData>>,
  ) => {
    return Object.entries(routeGroup).map(([routeKey, { url, title }]) => {
      return (
        <SidebarMenuItem key={url}>
          <SidebarMenuButton
            tooltip={title}
            isActive={pathname === url}
            render={
              <Link href={url}>
                {routeIconsMap[routeKey as RouteKey]}

                <span>{title}</span>
              </Link>
            }
          />
        </SidebarMenuItem>
      );
    });
  };

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <div className="flex justify-between items-center">
          {isExpanded && (
            <h2 className="px-2 py-1 font-semibold">AI Chat App</h2>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <Show when="signed-out">{renderRouteGroup(publicRoutes)}</Show>

              <Show when="signed-in">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={NEW_CHAT_TITLE}
                    isActive={isNewChatRoute}
                    render={
                      <Link href="/chat">
                        <ChatBubbleLeftRightIcon />

                        <span>{NEW_CHAT_TITLE}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={SIGN_OUT_TITLE}
                    className="cursor-pointer"
                    render={
                      <SignOutButton>
                        <button className="cursor-pointer">
                          <ArrowRightStartOnRectangleIcon />

                          <span>{SIGN_OUT_TITLE}</span>
                        </button>
                      </SignOutButton>
                    }
                  />
                </SidebarMenuItem>
              </Show>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Show when="signed-in">
          <SidebarGroup className="min-h-0">
            <SidebarGroupLabel>Chats</SidebarGroupLabel>

            <SidebarGroupContent className="flex flex-col grow min-h-0 gap-0.5 px-1 overflow-hidden hover:overflow-y-auto">
              <SidebarMenu>
                {chats?.map((chat) => {
                  const chatUrl = `/chat/${chat.id}`;
                  const isActiveChat = pathname === chatUrl;

                  return (
                    <SidebarMenuItem
                      key={chat.id}
                      className="flex items-center gap-2 justify-between"
                    >
                      <SidebarMenuButton
                        tooltip={chat.title}
                        isActive={isActiveChat}
                        render={
                          <Link href={chatUrl}>
                            <span className="truncate">{chat.title}</span>
                          </Link>
                        }
                      />

                      {!isActiveChat && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="shrink-0 md:not-group-hover/menu-item:not-data-popup-open:hidden group-data-[state=collapsed]:hidden"
                              >
                                <EllipsisVertical />
                              </Button>
                            }
                          />

                          <DropdownMenuContent>
                            <DropdownMenuItem
                              disabled={deleteChatMutation.isPending}
                              onClick={() =>
                                deleteChatMutation.mutateAsync({ id: chat.id })
                              }
                            >
                              Delete Chat
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Show>
      </SidebarContent>
    </Sidebar>
  );
}

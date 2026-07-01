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
import { publicRoutes, RouteData, RouteKey } from "@/constants/routes";
import { useQuery } from "@tanstack/react-query";
import { chatsOptions } from "@/lib/query/chats-options";

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

const NEW_CHAT_TITLE = "New Chat";
const SIGN_OUT_TITLE = "Sign Out";

export function AppSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const { data: chats } = useQuery(chatsOptions());

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

                  return (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        tooltip={chat.title}
                        isActive={pathname === chatUrl}
                        render={
                          <Link href={chatUrl}>
                            <span className="truncate">{chat.title}</span>
                          </Link>
                        }
                      />
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

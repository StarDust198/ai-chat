"use client";
import { ReactNode } from "react";
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
  privateRoutes,
  publicRoutes,
  RouteData,
  RouteKey,
} from "@/constants/routes";

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
  chat: <ChatBubbleLeftRightIcon />,
};

export function AppSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();

  const isExpanded = state === "expanded";

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
                {renderRouteGroup(privateRoutes)}

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Sign Out"
                    render={
                      <SignOutButton>
                        <button className="cursor-pointer">
                          <ArrowRightStartOnRectangleIcon />

                          <span>Sign Out</span>
                        </button>
                      </SignOutButton>
                    }
                  />
                </SidebarMenuItem>
              </Show>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

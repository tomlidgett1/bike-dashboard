"use client";

import Link from "next/link";
import { ChevronsUpDown, ExternalLink, Settings, Store } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { StoreSidebarLogo } from "./store-sidebar-logo";

export function StoreSwitcher() {
  const { isMobile } = useSidebar();
  const { profile } = useUserProfile();
  const name = profile?.business_name || profile?.name || "Your store";

  return (
    <div
      className={cn(
        "rounded-full border border-gray-200 bg-white p-1 shadow-md",
        "group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center",
        "group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none"
      )}
    >
      <SidebarMenu className="group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:items-center">
        <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                tooltip={name}
                className={cn(
                  "h-11 rounded-full bg-transparent hover:bg-gray-100 active:bg-gray-100 data-[state=open]:bg-gray-100 data-[state=open]:text-foreground",
                  "group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                )}
              >
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white group-data-[collapsible=icon]:hidden">
                  <StoreSidebarLogo logoUrl={profile?.logo_url} alt={name} />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Bike store
                  </span>
                </div>
                <ChevronsUpDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground",
                    "ml-auto group-data-[collapsible=icon]:ml-0"
                  )}
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {name}
              </DropdownMenuLabel>
              {profile?.user_id ? (
                <DropdownMenuItem asChild className="gap-2">
                  <Link
                    href={`/marketplace/store/${profile.user_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Store className="size-4" />
                    View my store
                    <ExternalLink className="ml-auto size-3.5 text-muted-foreground" />
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild className="gap-2">
                <Link href="/settings/store">
                  <Settings className="size-4" />
                  Storefront settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="gap-2">
                <Link href="/settings">
                  <Settings className="size-4" />
                  Account settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
}

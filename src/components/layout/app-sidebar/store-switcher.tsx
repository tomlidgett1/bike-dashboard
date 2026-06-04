"use client";

import Link from "next/link";
import Image from "next/image";
import { Bike, ChevronsUpDown, ExternalLink, Settings, Store } from "lucide-react";
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

export function StoreSwitcher() {
  const { isMobile } = useSidebar();
  const { profile } = useUserProfile();
  const name = profile?.business_name || profile?.name || "Your store";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-md bg-primary text-primary-foreground">
                {profile?.logo_url ? (
                  <Image
                    src={profile.logo_url}
                    alt={name}
                    width={32}
                    height={32}
                    className="size-8 object-cover"
                  />
                ) : (
                  <Bike className="size-4" />
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  Bike store
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
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
  );
}

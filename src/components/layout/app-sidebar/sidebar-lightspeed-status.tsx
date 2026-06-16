"use client";

import Image from "next/image";
import Link from "next/link";
import { Bolt, Refresh } from "./sidebar-icons";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function SidebarLightspeedStatus() {
  const { isSyncing: statusSyncing, formattedLastSync } = useSyncStatus();
  const {
    isConnected,
    isLoading,
    isSyncing: connectionSyncing,
    sync,
  } = useLightspeedConnection({ autoFetch: true, pollInterval: 60000 });

  const isSyncing = statusSyncing || connectionSyncing;

  if (isLoading) {
    return (
      <SidebarMenu className="px-0">
        <SidebarMenuItem>
          <SidebarMenuButton
            size="sm"
            disabled
            className="h-8 text-xs text-muted-foreground"
          >
            <Refresh className="size-3.5 animate-spin" />
            <span className="group-data-[collapsible=icon]:hidden">Lightspeed</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!isConnected) {
    return (
      <SidebarMenu className="px-0">
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            size="sm"
            tooltip="Connect Lightspeed POS"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link href="/connect-lightspeed">
              <Bolt className="size-3.5" />
              <span className="group-data-[collapsible=icon]:hidden">Connect POS</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const syncLabel =
    isSyncing
      ? "Syncing…"
      : formattedLastSync && formattedLastSync !== "Never"
        ? `Synced ${formattedLastSync}`
        : "Lightspeed";

  return (
    <SidebarMenu className="px-0">
      <SidebarMenuItem>
        <div className="flex w-full items-center gap-0.5 group-data-[collapsible=icon]:justify-center">
          <SidebarMenuButton
            asChild
            size="sm"
            tooltip={syncLabel}
            className="h-8 min-w-0 flex-1 text-xs text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:flex-none"
          >
            <Link href="/connect-lightspeed" className="min-w-0">
              <span className="flex size-3.5 shrink-0 overflow-hidden rounded-full">
                <Image
                  src="/ls.png"
                  alt="Lightspeed"
                  width={14}
                  height={14}
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="truncate group-data-[collapsible=icon]:hidden">
                {syncLabel}
              </span>
            </Link>
          </SidebarMenuButton>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={isSyncing}
            aria-label="Sync Lightspeed inventory"
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
              "text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              "disabled:pointer-events-none disabled:opacity-50",
              "group-data-[collapsible=icon]:hidden"
            )}
          >
            <Refresh className={cn("size-3.5", isSyncing && "animate-spin")} />
          </button>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

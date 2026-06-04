"use client";

import Link from "next/link";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function SidebarBranding() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip="Powered by Yellow Jersey"
          className="h-auto py-2.5 hover:bg-sidebar-accent/60"
        >
          <Link
            href="/marketplace"
            aria-label="Powered by Yellow Jersey — marketplace"
            className="min-w-0"
          >
            <span className="truncate text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
              Powered by Yellow Jersey
            </span>
            <span className="hidden text-[10px] font-semibold text-muted-foreground group-data-[collapsible=icon]:inline">
              YJ
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

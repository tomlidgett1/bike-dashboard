"use client";

import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { HamburgerMenu } from "@/components/layout/app-sidebar/sidebar-icons";
import { topbarIconButtonClass } from "@/components/layout/topbar-nav-pills";
import { cn } from "@/lib/utils";

export function SidebarCollapseTrigger({
  className,
}: {
  className?: string;
}) {
  const { isMobile } = useSidebar();

  if (isMobile) {
    return null;
  }

  return (
    <SidebarTrigger
      className={cn("shrink-0 text-sidebar-foreground", className)}
    />
  );
}

export function HeaderSidebarTrigger({
  className,
}: {
  className?: string;
}) {
  const { isMobile, toggleSidebar } = useSidebar();

  if (!isMobile) {
    return null;
  }

  return (
    <Button
      type="button"
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(topbarIconButtonClass, className)}
      onClick={toggleSidebar}
      aria-label="Toggle sidebar"
    >
      <HamburgerMenu className="size-4" />
    </Button>
  );
}

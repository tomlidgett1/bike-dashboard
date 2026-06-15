"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
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
  const { isMobile } = useSidebar();

  if (!isMobile) {
    return null;
  }

  return <SidebarTrigger className={cn(topbarIconButtonClass, className)} />;
}

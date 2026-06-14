"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function SidebarCollapseTrigger({
  className,
}: {
  className?: string;
}) {
  const { state, isMobile } = useSidebar();

  if (state !== "expanded" || isMobile) {
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
  const { state, isMobile } = useSidebar();

  if (state === "expanded" && !isMobile) {
    return null;
  }

  return <SidebarTrigger className={cn("-ml-1", className)} />;
}

"use client";

import { cn } from "@/lib/utils";
import type { SidebarIcon } from "./dashboard-icons";

/** Sidebar nav icon with a left tilt on hover. */
export function SidebarNavIcon({
  icon: Icon,
  className,
}: {
  icon: SidebarIcon;
  className?: string;
}) {
  return (
    <Icon
      className={cn(
        "origin-center transition-transform duration-300 ease-out group-hover/menu-button:-rotate-45",
        className,
      )}
      aria-hidden
    />
  );
}

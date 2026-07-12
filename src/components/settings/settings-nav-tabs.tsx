"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function SettingsNavTabs<T extends string>({
  items,
  value,
  onChange,
  size = "lg",
}: {
  items: readonly { id: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "lg";
  /** Pass a stable id when multiple tab bars share a page so indicators do not collide. */
  layoutId?: string;
}) {
  const compact = size === "sm";

  return (
    <div className="flex w-fit items-center rounded-md bg-gray-100 p-0.5">
      {items.map((entry) => {
        const isActive = value === entry.id;

        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChange(entry.id)}
            className={cn(
              "flex items-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
              compact
                ? "gap-1 px-2.5 py-1.5 text-xs"
                : "gap-1.5 px-3 py-1.5 text-sm",
              isActive
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <entry.icon className={compact ? "h-3 w-3" : "size-[15px]"} />
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

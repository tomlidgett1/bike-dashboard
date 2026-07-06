"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function SettingsNavTabs<T extends string>({
  items,
  value,
  onChange,
  size = "lg",
  layoutId,
}: {
  items: readonly { id: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "lg";
  /** Pass a stable id when multiple tab bars share a page so indicators do not collide. */
  layoutId?: string;
}) {
  const compact = size === "sm";
  const indicatorLayoutId = React.useId();
  const motionLayoutId = layoutId ?? `settings-nav-tab-${indicatorLayoutId}`;

  return (
    <div className="flex w-fit items-center rounded-full bg-gray-100 p-0.5">
      {items.map((entry) => {
        const isActive = value === entry.id;

        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChange(entry.id)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full font-medium",
              compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-1.5 text-sm",
              isActive ? "text-gray-800" : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            {isActive && (
              <motion.div
                layoutId={motionLayoutId}
                className="absolute inset-0 rounded-full bg-white shadow-sm"
                transition={{
                  type: "spring",
                  bounce: 0.2,
                  duration: 0.4,
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <entry.icon className={compact ? "h-3 w-3" : "size-[15px]"} />
              {entry.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

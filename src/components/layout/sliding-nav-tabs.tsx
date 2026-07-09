"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type SlidingNavTabItem<T extends string> = {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
};

export function SlidingNavTabs<T extends string>({
  items,
  value,
  onChange,
  size = "lg",
  layoutId,
}: {
  items: readonly SlidingNavTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "lg";
  layoutId?: string;
}) {
  const compact = size === "sm";
  const indicatorLayoutId = React.useId();
  const resolvedLayoutId = layoutId ?? `sliding-nav-tab-${indicatorLayoutId}`;

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
            {isActive ? (
              <motion.div
                layoutId={resolvedLayoutId}
                className="absolute inset-0 rounded-full bg-white shadow-sm"
                transition={{
                  type: "spring",
                  bounce: 0.2,
                  duration: 0.4,
                }}
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-1.5">
              <entry.icon className={compact ? "h-3 w-3" : "size-[15px]"} />
              {entry.label}
              {entry.badge != null && entry.badge !== 0 ? (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-600">
                  {entry.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type EnquiriesNavTabItem<T extends string> = {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
};

/** Sliding pill tabs — same treatment as the outreach (CRM) page nav. */
export function EnquiriesNavTabs<T extends string>({
  items,
  value,
  onChange,
  size = "lg",
  className,
}: {
  items: readonly EnquiriesNavTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "lg";
  className?: string;
}) {
  const compact = size === "sm";
  const indicatorLayoutId = React.useId();

  return (
    <div
      className={cn(
        "flex w-fit max-w-full items-center overflow-x-auto rounded-full bg-gray-100 p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((entry) => {
        const isActive = value === entry.id;

        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChange(entry.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 rounded-full font-medium",
              compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-1.5 text-sm",
              isActive ? "text-gray-800" : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            {isActive && (
              <motion.div
                layoutId={`enquiries-nav-tab-${indicatorLayoutId}`}
                className="absolute inset-0 rounded-full bg-white shadow-sm"
                transition={{
                  type: "spring",
                  bounce: 0.2,
                  duration: 0.4,
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {entry.icon ? (
                <entry.icon className={cn("shrink-0", compact ? "h-3 w-3" : "size-[15px]")} />
              ) : null}
              {entry.label}
              {typeof entry.count === "number" && entry.count > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums",
                    isActive ? "bg-gray-100 text-gray-600" : "bg-gray-200/80 text-gray-500",
                  )}
                >
                  {entry.count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

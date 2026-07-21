"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VisualValueFormat } from "@/lib/genie/visual-format";

export const MEASURE_VALUE_TYPES: Array<{
  value: VisualValueFormat;
  label: string;
  title: string;
  symbol: string;
}> = [
  { value: "currency", label: "Currency ($)", title: "Currency", symbol: "$" },
  { value: "percent", label: "Percent (%)", title: "Percent", symbol: "%" },
  { value: "number", label: "Number (#)", title: "Number", symbol: "#" },
];

/** One-click $, %, # format toggles (no aggregation menu). */
export function MeasureFormatButtons({
  format,
  onFormatChange,
  size = "sm",
}: {
  format?: VisualValueFormat | null;
  onFormatChange: (format: VisualValueFormat) => void;
  size?: "sm" | "md";
}) {
  const active = format ?? "number";

  return (
    <div
      className="flex items-center rounded-md bg-gray-100 p-0.5"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {MEASURE_VALUE_TYPES.map((option) => {
        const isActive = active === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="icon-xs"
            title={option.title}
            aria-label={option.label}
            aria-pressed={isActive}
            onClick={() => onFormatChange(option.value)}
            className={cn(
              "shrink-0 rounded-md font-mono text-[11px] font-medium text-gray-600 hover:bg-gray-200/70 hover:text-gray-800",
              size === "md" ? "h-6 w-6" : "h-5 w-5",
              isActive && "bg-white text-gray-800 shadow-sm hover:bg-white",
            )}
          >
            {option.symbol}
          </Button>
        );
      })}
    </div>
  );
}

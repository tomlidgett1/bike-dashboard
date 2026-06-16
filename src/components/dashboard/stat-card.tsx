// ─────────────────────────────────────────────────────────────────────────────
// StatCard — the one metric tile used across the dashboard and products pages.
// Icon tiles are intentionally neutral/gray (no decorative colour).
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  subMetric,
  trend,
  size = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  subMetric?: { value: string | number; label: string };
  trend?: { value: string; direction: "up" | "down" };
  size?: "default" | "compact";
}) {
  const TrendIcon = trend?.direction === "down" ? ArrowDownRight : ArrowUpRight;
  const compact = size === "compact";

  return (
    <Card className={cn("gap-0 py-0 shadow-none", compact && "rounded-2xl")}>
      <div
        className={cn(
          "flex items-start justify-between",
          compact ? "gap-2 p-3" : "gap-3 p-5",
        )}
      >
        <div className={cn(compact ? "min-w-0 space-y-1" : "space-y-2")}>
          <p
            className={cn(
              "font-medium text-muted-foreground",
              compact ? "text-[11px] leading-tight" : "text-[13px]",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "font-semibold tracking-tight text-foreground tabular-nums",
              compact ? "text-xl" : "text-2xl",
            )}
          >
            {value}
          </p>
          {subMetric ? (
            <p
              className={cn(
                "text-muted-foreground tabular-nums",
                compact ? "text-[11px]" : "text-sm",
              )}
            >
              <span className="font-medium text-foreground">{subMetric.value}</span>{" "}
              {subMetric.label}
            </p>
          ) : null}
          {(hint || trend) && (
            <div
              className={cn(
                "flex items-center gap-1.5",
                compact ? "text-[10px]" : "text-xs",
              )}
            >
              {trend ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium",
                    trend.direction === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  )}
                >
                  <TrendIcon className={compact ? "size-3" : "size-3.5"} />
                  {trend.value}
                </span>
              ) : null}
              {hint ? (
                <span className="text-muted-foreground">{hint}</span>
              ) : null}
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground",
            compact ? "size-7" : "size-9 rounded-lg",
          )}
        >
          <Icon className={compact ? "size-3.5" : "size-[18px]"} />
        </div>
      </div>
    </Card>
  );
}

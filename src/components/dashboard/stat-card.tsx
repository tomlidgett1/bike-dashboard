// ─────────────────────────────────────────────────────────────────────────────
// StatCard — the one metric tile used across the dashboard and products pages.
// Icon tiles are intentionally neutral/gray (no decorative colour).
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  trend?: { value: string; direction: "up" | "down" };
}) {
  const TrendIcon = trend?.direction === "down" ? ArrowDownRight : ArrowUpRight;

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          {(hint || trend) && (
            <div className="flex items-center gap-1.5 text-xs">
              {trend ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium",
                    trend.direction === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  )}
                >
                  <TrendIcon className="size-3.5" />
                  {trend.value}
                </span>
              ) : null}
              {hint ? <span className="text-muted-foreground">{hint}</span> : null}
            </div>
          )}
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
          <Icon className="size-[18px]" />
        </div>
      </div>
    </Card>
  );
}

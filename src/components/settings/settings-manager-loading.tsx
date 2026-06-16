"use client";

import { Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";

interface SettingsManagerLoadingProps {
  className?: string;
}

export function SettingsManagerLoading({ className }: SettingsManagerLoadingProps) {
  return (
    <div
      className={cn(
        "flex min-h-40 items-center justify-center rounded-md border border-border/70 bg-white text-muted-foreground",
        className
      )}
    >
      <Loader2 className="size-4 animate-spin" aria-label="Loading settings" />
    </div>
  );
}

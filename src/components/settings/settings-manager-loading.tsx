"use client";

import { Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";

interface SettingsManagerLoadingProps {
  className?: string;
  fullPage?: boolean;
}

export function SettingsManagerLoading({ className, fullPage }: SettingsManagerLoadingProps) {
  return (
    <div
      className={cn(
        fullPage
          ? "flex min-h-[calc(100svh-3.5rem)] w-full items-center justify-center text-muted-foreground"
          : "flex min-h-40 items-center justify-center rounded-md border border-border/70 bg-white text-muted-foreground",
        className
      )}
    >
      <Loader2
        className={cn("animate-spin", fullPage ? "size-8" : "size-4")}
        aria-label="Loading settings"
      />
    </div>
  );
}

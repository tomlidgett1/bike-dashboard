"use client";

import * as React from "react";
import Image from "next/image";
import { CheckCircle2, RefreshCw } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConnectionStatusHeaderProps {
  accountName: string;
  accountId: string;
  lastSyncTime: Date | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onDisconnect?: () => void;
}

function formatRelative(date: Date | null): string {
  if (!date) return "not yet";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function ConnectionStatusHeader({
  accountName,
  accountId,
  lastSyncTime,
  isRefreshing,
  onRefresh,
  onDisconnect,
}: ConnectionStatusHeaderProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
            <Image src="/ls.png" alt="Lightspeed" width={44} height={44} className="object-contain" unoptimized />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-base font-semibold text-foreground">{accountName}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Connected
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Lightspeed · your in-store till and stock system · ID {accountId}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-md" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
            Check now
          </Button>
          <Button variant="ghost" size="sm" className="rounded-md text-muted-foreground" onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <p>
          Yellow Jersey keeps a live copy of your shop&rsquo;s stock and updates it on its own &mdash; last checked{" "}
          <span className="font-medium text-foreground">{formatRelative(lastSyncTime)}</span>, then automatically every 10 minutes.
        </p>
      </div>
    </section>
  );
}

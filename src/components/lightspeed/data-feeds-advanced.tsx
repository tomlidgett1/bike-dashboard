"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronRight,
  Database,
  Loader2,
  Play,
  RefreshCw,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface DataFeedsAdvancedProps {
  inventory: {
    totalRows: number;
    inStockRows: number;
    lastSyncAt: string | null;
    isComplete: boolean;
    statusLabel: string;
    syncing: boolean;
    loadingStatus: boolean;
    message: string;
    errorText: string;
    onSync: () => void;
    onRefresh: () => void;
  };
  sales: {
    rowCount: number;
    oldestStored: string | null;
    latestStored: string | null;
    oldestSale: string | null;
    isComplete: boolean;
    statusLabel: string;
    running: boolean;
    loadingStatus: boolean;
    message: string;
    error: string;
    primaryLabel: string;
    onRun: () => void;
    onRefresh: () => void;
  };
}

function FeedCard({
  title,
  description,
  badgeLabel,
  badgeComplete,
  stats,
  message,
  errorText,
  primary,
  onRefresh,
  refreshing,
}: {
  title: string;
  description: string;
  badgeLabel: string;
  badgeComplete: boolean;
  stats: Array<{ label: string; value: string }>;
  message: string;
  errorText: string;
  primary: { label: string; loading: boolean; onClick: () => void; disabled: boolean };
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Database className="h-4 w-4 text-foreground" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
                  badgeComplete
                    ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {badgeComplete && <CheckCircle2 className="h-3 w-3" />}
                {badgeLabel}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 pt-0.5 text-xs text-muted-foreground">
              {stats.map((stat) => (
                <span key={stat.label}>
                  {stat.label}: <span className="font-medium tabular-nums text-foreground">{stat.value}</span>
                </span>
              ))}
            </div>
            {(message || errorText) && (
              <p className={cn("text-xs", errorText ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                {errorText || message}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" className="rounded-md" onClick={primary.onClick} disabled={primary.disabled}>
            {primary.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {primary.label}
          </Button>
          <Button size="sm" variant="outline" className="rounded-md" onClick={onRefresh} disabled={refreshing || primary.loading}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DataFeedsAdvanced({ inventory, sales }: DataFeedsAdvancedProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left md:px-5"
      >
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">Advanced · data feeds</div>
          <div className="text-xs text-muted-foreground">
            The full stock copy and your sales history. These run automatically &mdash; open only if you want to force a refresh.
          </div>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4 md:p-5">
          <FeedCard
            title="Stock copy"
            description="A complete, live mirror of every product and stock level in Lightspeed. Refreshes on its own every 10 minutes."
            badgeLabel={inventory.statusLabel}
            badgeComplete={inventory.isComplete}
            stats={[
              { label: "Products", value: inventory.totalRows.toLocaleString() },
              { label: "In stock", value: inventory.inStockRows.toLocaleString() },
              { label: "Last refresh", value: fmtDate(inventory.lastSyncAt) },
            ]}
            message={inventory.message}
            errorText={inventory.errorText}
            primary={{
              label: inventory.syncing ? "Refreshing…" : "Refresh now",
              loading: inventory.syncing,
              onClick: inventory.onSync,
              disabled: inventory.syncing || inventory.loadingStatus,
            }}
            onRefresh={inventory.onRefresh}
            refreshing={inventory.loadingStatus}
          />

          <FeedCard
            title="Sales history"
            description="Past sales pulled from Lightspeed to power your reports and analytics. Tops up automatically; the full history fills in over time."
            badgeLabel={sales.statusLabel}
            badgeComplete={sales.isComplete}
            stats={[
              { label: "Sale lines", value: sales.rowCount.toLocaleString() },
              { label: "Oldest stored", value: fmtDate(sales.oldestStored) },
              { label: "Newest stored", value: fmtDate(sales.latestStored) },
            ]}
            message={sales.message}
            errorText={sales.error}
            primary={{
              label: sales.running ? "Backfilling…" : sales.primaryLabel,
              loading: sales.running,
              onClick: sales.onRun,
              disabled: sales.running || sales.loadingStatus,
            }}
            onRefresh={sales.onRefresh}
            refreshing={sales.loadingStatus}
          />
        </div>
      )}
    </section>
  );
}

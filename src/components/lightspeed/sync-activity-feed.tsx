"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  Package,
  RefreshCw,
  Search,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface InventoryLog {
  id: string;
  product_name: string;
  product_sku: string | null;
  lightspeed_item_id: string;
  old_qoh: number;
  new_qoh: number;
  qoh_change: number;
  old_is_active: boolean | null;
  new_is_active: boolean | null;
  created_at: string;
  metadata?: { batch_id?: string } | null;
}

interface MirrorRun {
  status: string;
  completed_at: string | null;
  started_at: string;
  rows_created: number;
  rows_marked_out_of_stock: number;
  stock_changed: number;
  price_changed: number;
}

type ChangeKind = "sold_out" | "restocked" | "up" | "down";

function classify(log: InventoryLog): ChangeKind {
  if (log.new_qoh === 0 && log.old_qoh > 0) return "sold_out";
  if (log.old_is_active === true && log.new_is_active === false) return "sold_out";
  if (log.old_qoh === 0 && log.new_qoh > 0) return "restocked";
  if (log.old_is_active === false && log.new_is_active === true) return "restocked";
  return log.qoh_change >= 0 ? "up" : "down";
}

interface CheckGroup {
  key: string;
  at: Date;
  logs: InventoryLog[];
  soldOut: number;
  restocked: number;
  stockChanges: number;
}

function groupIntoChecks(logs: InventoryLog[]): CheckGroup[] {
  const map = new Map<string, InventoryLog[]>();
  for (const log of logs) {
    const bucket = log.metadata?.batch_id || new Date(log.created_at).toISOString().slice(0, 16);
    const rows = map.get(bucket) ?? [];
    rows.push(log);
    map.set(bucket, rows);
  }
  return Array.from(map.entries())
    .map(([key, rows]) => {
      let soldOut = 0;
      let restocked = 0;
      let stockChanges = 0;
      for (const log of rows) {
        const kind = classify(log);
        if (kind === "sold_out") soldOut += 1;
        else if (kind === "restocked") restocked += 1;
        else stockChanges += 1;
      }
      return {
        key,
        at: new Date(rows[0].created_at),
        logs: rows,
        soldOut,
        restocked,
        stockChanges,
      };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

function joinPlain(parts: string[]): string {
  if (parts.length === 0) return "nothing changed";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function summarise(soldOut: number, restocked: number, stockChanges: number): string {
  const parts: string[] = [];
  if (soldOut > 0) parts.push(`${soldOut} sold out`);
  if (restocked > 0) parts.push(`${restocked} restocked`);
  if (stockChanges > 0) parts.push(`${stockChanges} stock change${stockChanges === 1 ? "" : "s"}`);
  return joinPlain(parts);
}

function groupHeadline(group: CheckGroup): string {
  if (group.logs.length === 1) {
    const log = group.logs[0];
    const name = log.product_name || "A product";
    switch (classify(log)) {
      case "sold_out":
        return `${name} sold out`;
      case "restocked":
        return `${name} restocked`;
      default:
        return `${name}: ${log.old_qoh} → ${log.new_qoh}`;
    }
  }
  return summarise(group.soldOut, group.restocked, group.stockChanges);
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return format(date, "d MMM");
}

const KIND_META: Record<ChangeKind, { label: string; icon: React.ComponentType<{ className?: string }>; dot: string; text: string }> = {
  sold_out: { label: "Sold out", icon: ArrowDown, dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  restocked: { label: "Restocked", icon: ArrowUp, dot: "bg-green-500", text: "text-green-600 dark:text-green-400" },
  up: { label: "Stock up", icon: ArrowUp, dot: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
  down: { label: "Stock down", icon: ArrowDown, dot: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
};

export function SyncActivityFeed({ latestRun }: { latestRun: MirrorRun | null }) {
  const [logs, setLogs] = React.useState<InventoryLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lightspeed/inventory-logs?limit=200&change_type=all", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setLogs(data.logs as InventoryLog[]);
    } catch (error) {
      console.error("[Activity] Failed to load logs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = React.useMemo(() => {
    if (!search.trim()) return logs;
    const term = search.toLowerCase();
    return logs.filter(
      (log) =>
        log.product_name?.toLowerCase().includes(term) ||
        log.product_sku?.toLowerCase().includes(term) ||
        log.lightspeed_item_id.includes(term),
    );
  }, [logs, search]);

  const groups = React.useMemo(() => groupIntoChecks(filteredLogs), [filteredLogs]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const headline = React.useMemo(() => {
    if (!latestRun) return null;
    const parts: string[] = [];
    if (latestRun.rows_marked_out_of_stock > 0) parts.push(`${latestRun.rows_marked_out_of_stock} product${latestRun.rows_marked_out_of_stock === 1 ? "" : "s"} sold out`);
    if (latestRun.stock_changed > 0) parts.push(`${latestRun.stock_changed} stock level${latestRun.stock_changed === 1 ? "" : "s"} changed`);
    if (latestRun.price_changed > 0) parts.push(`${latestRun.price_changed} price${latestRun.price_changed === 1 ? "" : "s"} changed`);
    if (latestRun.rows_created > 0) parts.push(`${latestRun.rows_created} newly added`);
    const when = latestRun.completed_at || latestRun.started_at;
    return { sentence: joinPlain(parts), when: when ? new Date(when) : null, nothing: parts.length === 0 };
  }, [latestRun]);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-base font-semibold text-foreground">What the sync has been doing</h2>
        <button
          onClick={fetchLogs}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {headline && (
          <div className="border-b border-border bg-blue-50/60 px-4 py-3 dark:bg-blue-950/20 md:px-5">
            <div className="text-xs text-blue-700 dark:text-blue-400">
              Latest check{headline.when ? ` · ${relativeTime(headline.when)}` : ""}
            </div>
            <p className="mt-0.5 text-sm text-foreground">
              {headline.nothing ? (
                <>We checked your shop and nothing changed.</>
              ) : (
                <>We checked your shop and found {headline.sentence}.</>
              )}
            </p>
          </div>
        )}

        <div className="border-b border-border px-4 py-2.5 md:px-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a product in the history"
              className="h-9 rounded-md pl-9 pr-9 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[26rem] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                {search ? "No products match your search" : "No stock changes yet"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {search ? "Try a different name or SKU." : "When stock moves in Lightspeed, you'll see every change here in plain English."}
              </p>
            </div>
          ) : (
            groups.map((group) => {
              const isOpen = expanded.has(group.key);
              const noChange = group.soldOut + group.restocked + group.stockChanges === 0;
              const onlyStockChange = group.soldOut === 0 && group.restocked === 0 && group.stockChanges > 0;
              const netUp = group.logs.reduce((sum, log) => sum + (log.qoh_change ?? 0), 0) >= 0;
              return (
                <div key={group.key} className="border-b border-border last:border-b-0">
                  <button
                    onClick={() => toggle(group.key)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 md:px-5"
                    aria-expanded={isOpen}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        group.soldOut > 0
                          ? "bg-red-50 dark:bg-red-950/40"
                          : group.restocked > 0
                            ? "bg-green-50 dark:bg-green-950/40"
                            : onlyStockChange
                              ? "bg-blue-50 dark:bg-blue-950/40"
                              : "bg-muted",
                      )}
                    >
                      {group.soldOut > 0 ? (
                        <ArrowDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                      ) : group.restocked > 0 ? (
                        <ArrowUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : onlyStockChange ? (
                        netUp ? (
                          <ArrowUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        )
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {noChange ? "Routine check · nothing changed" : groupHeadline(group)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {relativeTime(group.at)} · {format(group.at, "d MMM, h:mm a")}
                      </span>
                    </span>
                    {!noChange && (
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    )}
                  </button>

                  {isOpen && !noChange && (
                    <div className="bg-muted/30 px-4 pb-3 md:px-5">
                      <div className="overflow-hidden rounded-md border border-border bg-card">
                        {group.logs.map((log, idx) => {
                          const kind = classify(log);
                          const meta = KIND_META[kind];
                          return (
                            <div
                              key={log.id}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2",
                                idx !== group.logs.length - 1 && "border-b border-border",
                              )}
                            >
                              <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-foreground">{log.product_name}</div>
                                {log.product_sku && (
                                  <div className="truncate font-mono text-xs text-muted-foreground">{log.product_sku}</div>
                                )}
                              </div>
                              <span className={cn("shrink-0 text-xs font-medium", meta.text)}>{meta.label}</span>
                              <span className="flex shrink-0 items-center gap-1 font-mono text-sm tabular-nums text-muted-foreground">
                                <Package className="h-3 w-3" />
                                {log.old_qoh} → {log.new_qoh}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border bg-muted/40 px-4 py-2.5 md:px-5">
          <span className="text-xs text-muted-foreground">What the words mean:</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Sold out &mdash; was in stock, now zero
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Restocked &mdash; back on the shelf
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Stock change &mdash; count went up or down
          </span>
        </div>
      </div>
    </section>
  );
}

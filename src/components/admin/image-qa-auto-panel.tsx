"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  buildSpeedSearchQuery,
  fetchSerperCandidates,
  runWithConcurrency,
  type SpeedSearchCandidate,
  type SpeedWorkbenchProduct,
} from "@/lib/admin/image-qa-speed";

const PROCESS_CONCURRENCY = 2;
const MAX_SELECTED = 6;

interface ImageQaAutoPanelProps {
  onSessionMessage?: (message: string | null) => void;
}

type AutoStatus =
  | "queued"
  | "searching"
  | "selecting"
  | "ready"
  | "saving"
  | "done"
  | "no_results"
  | "error";

interface AutoItem {
  product: SpeedWorkbenchProduct;
  searchQuery: string;
  status: AutoStatus;
  candidates: SpeedSearchCandidate[];
  selectedCandidates: SpeedSearchCandidate[];
  selectedUrls: string[];
  primaryUrl: string | null;
  reasoning?: string;
  savedCount?: number;
  costUsd?: number;
  error?: string;
  showAdditional?: boolean;
  reloadingCandidates?: boolean;
}

interface AiSelectResponse {
  success: boolean;
  primaryUrl: string;
  selectedCandidates: SpeedSearchCandidate[];
  selectedUrls: string[];
  reasoning: string;
  costUsd?: number;
  error?: string;
}

const STATUS_LABEL: Record<AutoStatus, string> = {
  queued: "Queued",
  searching: "Searching Serper…",
  selecting: "AI selecting…",
  ready: "Ready to approve",
  saving: "Saving…",
  done: "Approved",
  no_results: "No images found",
  error: "Failed",
};

export function ImageQaAutoPanel({ onSessionMessage }: ImageQaAutoPanelProps) {
  const [category, setCategory] = React.useState("all");
  const [categoryOptions, setCategoryOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = React.useState(true);
  const [count, setCount] = React.useState(3);
  const [loadingQueue, setLoadingQueue] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [queue, setQueue] = React.useState<AutoItem[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCategories(true);
      try {
        const response = await fetch("/api/admin/images/lightspeed-categories?filter=no_approved");
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Failed to load categories");
        if (!cancelled) setCategoryOptions(result.categories as { id: string; name: string }[]);
      } catch {
        if (!cancelled) setCategoryOptions([]);
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchItem = React.useCallback((index: number, patch: Partial<AutoItem>) => {
    setQueue((current) => {
      const next = [...current];
      if (next[index]) next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const loadQueue = async () => {
    setLoadingQueue(true);
    onSessionMessage?.(null);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: String(count),
        status: "no_approved",
      });
      if (category !== "all") params.set("ls_category_id", category);

      const response = await fetch(`/api/admin/images/products?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Failed to load products");

      const products = (result.data || []) as SpeedWorkbenchProduct[];
      if (products.length === 0) {
        onSessionMessage?.("No products match these filters. Try a different category.");
        setQueue([]);
        return;
      }

      setQueue(
        products.map((product) => ({
          product,
          searchQuery: buildSpeedSearchQuery(product),
          status: "queued",
          candidates: [],
          selectedCandidates: [],
          selectedUrls: [],
          primaryUrl: null,
        })),
      );
    } catch (error) {
      onSessionMessage?.(error instanceof Error ? error.message : "Failed to load queue");
    } finally {
      setLoadingQueue(false);
    }
  };

  const processItem = React.useCallback(
    async (item: AutoItem, index: number) => {
      const label = item.product.store_product_name || item.product.display_name || item.product.normalized_name;
      try {
        // 1. Serper search (same path as rapid review)
        patchItem(index, { status: "searching" });
        const candidates = await fetchSerperCandidates(item.product, item.searchQuery);
        if (candidates.length === 0) {
          patchItem(index, { status: "no_results", candidates: [], error: "No images found" });
          return;
        }
        patchItem(index, { candidates });

        // 2. AI vision selection — primary + best supporting images
        patchItem(index, { status: "selecting" });
        const selectRes = await fetch("/api/admin/images/ai-select-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: label,
            brand: item.product.manufacturer || undefined,
            upc: item.product.upc || undefined,
            candidates,
            maxImages: MAX_SELECTED,
          }),
        });
        const selectJson = (await selectRes.json()) as AiSelectResponse;
        if (!selectRes.ok || !selectJson.success || !selectJson.primaryUrl) {
          throw new Error(selectJson.error || "AI selection failed");
        }

        // Stop here — the operator reviews and approves manually. Nothing is saved yet.
        patchItem(index, {
          status: "ready",
          selectedCandidates: selectJson.selectedCandidates,
          selectedUrls: selectJson.selectedUrls,
          primaryUrl: selectJson.primaryUrl,
          reasoning: selectJson.reasoning,
          costUsd: selectJson.costUsd,
          error: undefined,
        });
      } catch (error) {
        patchItem(index, {
          status: "error",
          error: error instanceof Error ? error.message : "Processing failed",
        });
      }
    },
    [patchItem],
  );

  // Save a reviewed item's AI selection to the system (same endpoint rapid review uses).
  const approveItem = React.useCallback(
    async (item: AutoItem, index: number) => {
      if (item.status !== "ready" || !item.primaryUrl || item.selectedCandidates.length === 0) return;
      patchItem(index, { status: "saving", error: undefined });
      try {
        const approveRes = await fetch("/api/admin/images/approve-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonicalProductId: item.product.id,
            selectedCandidates: item.selectedCandidates,
            primaryCandidateUrl: item.primaryUrl,
            searchQuery: item.searchQuery,
            rejectPending: true,
            quickMode: true,
          }),
        });
        const approveJson = await approveRes.json();
        if (!approveRes.ok || !approveJson.success) {
          throw new Error(approveJson.error || "Failed to save images");
        }
        patchItem(index, {
          status: "done",
          savedCount: (approveJson.savedImageIds || item.selectedUrls).length,
        });
      } catch (error) {
        patchItem(index, {
          status: "ready",
          error: error instanceof Error ? error.message : "Failed to save images",
        });
      }
    },
    [patchItem],
  );

  // Operator overrides on a reviewed item, before it's saved.
  const setPrimary = React.useCallback((index: number, url: string) => {
    setQueue((current) => {
      const item = current[index];
      if (!item || item.status !== "ready" || !item.selectedUrls.includes(url)) return current;
      const next = [...current];
      next[index] = { ...item, primaryUrl: url };
      return next;
    });
  }, []);

  const removeImage = React.useCallback((index: number, url: string) => {
    setQueue((current) => {
      const item = current[index];
      if (!item || item.status !== "ready" || item.selectedUrls.length <= 1) return current;
      const selectedUrls = item.selectedUrls.filter((u) => u !== url);
      const selectedCandidates = item.selectedCandidates.filter((c) => c.url !== url);
      const primaryUrl = item.primaryUrl === url ? selectedUrls[0] ?? null : item.primaryUrl;
      const next = [...current];
      next[index] = { ...item, selectedUrls, selectedCandidates, primaryUrl };
      return next;
    });
  }, []);

  const addCandidate = React.useCallback((index: number, candidate: SpeedSearchCandidate) => {
    setQueue((current) => {
      const item = current[index];
      if (!item || item.status !== "ready") return current;
      if (item.selectedUrls.includes(candidate.url)) return current;
      const selectedUrls = [...item.selectedUrls, candidate.url];
      const selectedCandidates = [...item.selectedCandidates, candidate];
      const primaryUrl = item.primaryUrl ?? candidate.url;
      const next = [...current];
      next[index] = { ...item, selectedUrls, selectedCandidates, primaryUrl };
      return next;
    });
  }, []);

  const reloadCandidates = React.useCallback(
    async (item: AutoItem, index: number) => {
      if (item.reloadingCandidates) return;
      patchItem(index, { reloadingCandidates: true });
      try {
        const fresh = await fetchSerperCandidates(item.product, item.searchQuery);
        // Merge with existing candidates, de-dupe by url.
        setQueue((current) => {
          const it = current[index];
          if (!it) return current;
          const existingUrls = new Set(it.candidates.map((c) => c.url));
          const merged = [...it.candidates, ...fresh.filter((c) => !existingUrls.has(c.url))];
          const next = [...current];
          next[index] = { ...it, candidates: merged, showAdditional: true, reloadingCandidates: false };
          return next;
        });
      } catch {
        patchItem(index, { reloadingCandidates: false });
      }
    },
    [patchItem],
  );

  const runAutoPilot = async () => {
    setRunning(true);
    onSessionMessage?.(null);

    // Snapshot the items that still need processing.
    const pending = queue
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.status === "queued" || item.status === "error" || item.status === "no_results");

    // Reset any retried items back to queued state.
    setQueue((current) =>
      current.map((item) =>
        item.status === "error" || item.status === "no_results"
          ? { ...item, status: "queued", error: undefined }
          : item,
      ),
    );

    const tasks = pending.map(({ item, index }) => () => processItem(item, index));
    await runWithConcurrency(tasks, PROCESS_CONCURRENCY);

    setRunning(false);
    onSessionMessage?.("AI picked images for each product. Review and click Approve (or Approve all) to save.");
  };

  const approveAll = async () => {
    setRunning(true);
    onSessionMessage?.(null);
    const ready = queue
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.status === "ready");
    const tasks = ready.map(({ item, index }) => () => approveItem(item, index));
    await runWithConcurrency(tasks, PROCESS_CONCURRENCY);
    setRunning(false);
    onSessionMessage?.("Approved all reviewed products.");
  };

  const readyCount = queue.filter((i) => i.status === "ready").length;
  const doneCount = queue.filter((i) => i.status === "done").length;
  const errorCount = queue.filter((i) => i.status === "error" || i.status === "no_results").length;
  const busyCount = queue.filter((i) => ["searching", "selecting", "saving"].includes(i.status)).length;
  const totalCostUsd = queue.reduce((sum, i) => sum + (i.costUsd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-gray-700" />
              <h2 className="text-sm font-medium text-gray-900">Auto-pilot</h2>
            </div>
            <p className="max-w-2xl text-xs text-gray-500">
              Queue 1–5 products and let AI do the rest: it searches Serper, picks the best primary image plus a
              few supporting shots, and approves them straight into the system. Built for quick testing.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem]">
                <label className="mb-1 block text-xs text-gray-500">Category</label>
                <Select value={category} onValueChange={setCategory} disabled={loadingCategories}>
                  <SelectTrigger className="h-9 w-full rounded-md">
                    <SelectValue placeholder={loadingCategories ? "Loading…" : "All categories"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-32">
                <label className="mb-1 block text-xs text-gray-500">Products (1–50)</label>
                <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                  <SelectTrigger className="h-9 w-full rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                disabled={loadingQueue || loadingCategories || running}
                onClick={() => void loadQueue()}
              >
                {loadingQueue ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Package className="mr-2 h-4 w-4" />
                )}
                Add {count} to queue
              </Button>

              <Button
                type="button"
                className="rounded-md"
                disabled={running || queue.length === 0}
                onClick={() => void runAutoPilot()}
              >
                {running ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Run auto-pilot
              </Button>

              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                disabled={running || readyCount === 0}
                onClick={() => void approveAll()}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve all{readyCount > 0 ? ` (${readyCount})` : ""}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              {queue.length} queued
            </span>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              {busyCount} working
            </span>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              {readyCount} ready
            </span>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              {doneCount} approved
            </span>
            {errorCount > 0 && (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
                {errorCount} failed
              </span>
            )}
            {totalCostUsd > 0 && (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-gray-700">
                ${totalCostUsd.toFixed(4)} AI cost
              </span>
            )}
          </div>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center rounded-md border border-dashed border-gray-200 bg-white p-8 text-sm text-gray-500">
          Pick a category and how many products to test, then add them to the queue.
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((item, index) => {
            if (item.status === "done") return null;
            const label =
              item.product.store_product_name || item.product.display_name || item.product.normalized_name;
            const busy = ["searching", "selecting", "saving"].includes(item.status);
            return (
              <div
                key={item.product.id ?? index}
                className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-gray-900">{label}</h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {item.product.manufacturer || "Unknown brand"} · UPC {item.product.upc || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.costUsd !== undefined && (
                      <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-500">
                        ${item.costUsd.toFixed(4)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs",
                        item.status === "error" || item.status === "no_results"
                          ? "border-gray-300 bg-white text-gray-700"
                          : "border-gray-200 bg-white text-gray-600",
                      )}
                    >
                      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                      {(item.status === "error" || item.status === "no_results") && (
                        <AlertCircle className="h-3 w-3" />
                      )}
                      {STATUS_LABEL[item.status]}
                    </span>
                    {item.status === "ready" && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-md"
                        disabled={running}
                        onClick={() => void approveItem(item, index)}
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        Approve{item.selectedUrls.length > 0 ? ` (${item.selectedUrls.length})` : ""}
                      </Button>
                    )}
                  </div>
                </div>

                {item.error && (
                  <p className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    {item.error}
                  </p>
                )}

                {item.reasoning && (
                  <p className="mt-2 text-xs italic text-gray-500">{item.reasoning}</p>
                )}

                {item.selectedUrls.length > 0 && (
                  <>
                    {item.status === "ready" && (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-gray-400">
                          Click the star to set the primary image, or remove any image you don&apos;t want before approving.
                        </p>
                        <button
                          type="button"
                          disabled={item.reloadingCandidates}
                          onClick={() =>
                            item.showAdditional
                              ? patchItem(index, { showAdditional: false })
                              : void reloadCandidates(item, index)
                          }
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                        >
                          {item.reloadingCandidates ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : item.showAdditional ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          {item.reloadingCandidates
                            ? "Loading…"
                            : item.showAdditional
                              ? "Hide additional"
                              : "Reload images"}
                        </button>
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {item.selectedUrls.map((url) => {
                        const candidate = item.candidates.find((c) => c.url === url);
                        const primary = url === item.primaryUrl;
                        const editable = item.status === "ready";
                        return (
                          <div
                            key={url}
                            className={cn(
                              "group relative aspect-square overflow-hidden rounded-md border bg-gray-100",
                              primary ? "border-gray-900 ring-2 ring-gray-900 ring-offset-1" : "border-gray-200",
                            )}
                          >
                            <Image
                              src={candidate?.thumbnailUrl || url}
                              alt=""
                              fill
                              unoptimized
                              className="object-cover"
                            />
                            {primary && (
                              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 shadow-sm">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Primary
                              </span>
                            )}
                            {editable && (
                              <>
                                {item.selectedUrls.length > 1 && (
                                  <button
                                    type="button"
                                    aria-label="Remove image"
                                    title="Remove image"
                                    onClick={() => removeImage(index, url)}
                                    className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-600 shadow-sm transition hover:bg-white hover:text-gray-900"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {!primary && (
                                  <button
                                    type="button"
                                    aria-label="Set as primary"
                                    title="Set as primary"
                                    onClick={() => setPrimary(index, url)}
                                    className="absolute inset-x-1.5 bottom-1.5 inline-flex items-center justify-center gap-1 rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-medium text-gray-700 opacity-0 shadow-sm transition hover:bg-white hover:text-gray-900 group-hover:opacity-100"
                                  >
                                    <Star className="h-2.5 w-2.5" />
                                    Set primary
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Additional candidates ── */}
                    {item.showAdditional && (() => {
                      const extra = item.candidates.filter((c) => !item.selectedUrls.includes(c.url));
                      if (extra.length === 0) return (
                        <p className="mt-3 text-center text-[11px] text-gray-400">
                          No additional candidates — all Serper results are already selected.
                        </p>
                      );
                      return (
                        <>
                          <div className="mt-4 flex items-center gap-2">
                            <div className="h-px flex-1 bg-gray-200" />
                            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                              Additional candidates
                            </span>
                            <div className="h-px flex-1 bg-gray-200" />
                          </div>
                          <p className="mt-1 text-[11px] text-gray-400">
                            These were not auto-selected. Click + to add any to your selection.
                          </p>
                          <div className="mt-2 max-h-96 overflow-y-auto rounded-md">
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {extra.map((candidate) => {
                              const atMax = item.selectedUrls.length >= MAX_SELECTED;
                              return (
                                <div
                                  key={candidate.url}
                                  className="group relative aspect-square overflow-hidden rounded-md border border-dashed border-gray-300 bg-gray-50"
                                >
                                  <Image
                                    src={candidate.thumbnailUrl || candidate.url}
                                    alt=""
                                    fill
                                    unoptimized
                                    className="object-cover opacity-80"
                                  />
                                  {!atMax && (
                                    <button
                                      type="button"
                                      aria-label="Add image"
                                      title="Add to selection"
                                      onClick={() => addCandidate(index, candidate)}
                                      className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"
                                    >
                                      <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-800 shadow-sm">
                                        <Plus className="h-3 w-3" />
                                        Add
                                      </span>
                                    </button>
                                  )}
                                  {atMax && (
                                    <div className="absolute inset-x-0 bottom-0 bg-white/80 px-1.5 py-0.5 text-center text-[10px] text-gray-500">
                                      Max {MAX_SELECTED}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

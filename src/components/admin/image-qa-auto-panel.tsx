"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Wand2,
  X,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  /** URLs currently being background-removed (show spinner overlay). */
  enhancingUrls?: string[];
  /** Maps original URL → enhanced Cloudinary URL (for display + approval). */
  enhancedUrls?: Record<string, string>;
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

interface ExcludedEntry {
  id: string;
  name: string;
  manufacturer: string | null;
  upc: string | null;
}

const EXCLUDED_KEY = "image_qa_autopilot_excluded";

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
  const [productSearch, setProductSearch] = React.useState("");
  const [dropdownResults, setDropdownResults] = React.useState<SpeedWorkbenchProduct[]>([]);
  const [dropdownLoading, setDropdownLoading] = React.useState(false);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  // ── Exclusion list (persisted to localStorage) ────────────────────────────
  const [excluded, setExcluded] = React.useState<ExcludedEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(EXCLUDED_KEY) || "[]"); } catch { return []; }
  });
  const [showExcluded, setShowExcluded] = React.useState(false);
  const excludedIds = React.useMemo(() => new Set(excluded.map((e) => e.id)), [excluded]);

  React.useEffect(() => {
    localStorage.setItem(EXCLUDED_KEY, JSON.stringify(excluded));
  }, [excluded]);

  const excludeItem = React.useCallback((item: AutoItem) => {
    const p = item.product;
    setExcluded((prev) => [
      { id: p.id, name: p.display_name || p.normalized_name, manufacturer: p.manufacturer, upc: p.upc },
      ...prev.filter((e) => e.id !== p.id),
    ]);
    setQueue((prev) => prev.filter((i) => i.product.id !== p.id));
    onSessionMessage?.(`${p.display_name || p.normalized_name} added to exclusion list.`);
  }, [onSessionMessage]);

  const unexcludeEntry = React.useCallback((id: string) => {
    setExcluded((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // ── Lightbox ──────────────────────────────────────────────────────────────
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxUrl(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Product search dropdown ────────────────────────────────────────────────
  // Debounced: fires 300 ms after the user stops typing.
  React.useEffect(() => {
    const term = productSearch.trim();
    if (!term) { setDropdownResults([]); setDropdownOpen(false); return; }
    const timer = setTimeout(async () => {
      setDropdownLoading(true);
      setDropdownOpen(true);
      try {
        const params = new URLSearchParams({ page: "1", limit: "15", live_only: "true", search: term });
        const res = await fetch(`/api/admin/images/products?${params}`);
        const result = await res.json();
        setDropdownResults(
          res.ok && result.success
            ? (result.data as SpeedWorkbenchProduct[]).filter((p) => !excludedIds.has(p.id))
            : [],
        );
      } catch { setDropdownResults([]); }
      finally { setDropdownLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Close dropdown when clicking outside.
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addDropdownProduct = (product: SpeedWorkbenchProduct) => {
    const existingIds = new Set(queue.map((i) => i.product.id));
    if (existingIds.has(product.id)) {
      onSessionMessage?.(`${product.display_name || product.normalized_name} is already in the queue.`);
    } else {
      setQueue((prev) => [...prev, toQueuedItem(product)]);
      onSessionMessage?.(`Added ${product.display_name || product.normalized_name} to the queue.`);
    }
    setProductSearch("");
    setDropdownResults([]);
    setDropdownOpen(false);
  };

  // ── Enhancement queue (serial — gpt-image-2 takes 60–120 s per image) ──────
  // We keep the pending jobs in a ref so the async processor never sees stale
  // state; a separate counter drives the UI badge.
  const enhanceJobsRef = React.useRef<Array<{ itemIndex: number; url: string }>>([]);
  const [enhanceQueueCount, setEnhanceQueueCount] = React.useState(0);
  const enhanceProcessing = React.useRef(false);

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

  // Shared helper: map an API product row into a fresh queued AutoItem.
  const toQueuedItem = (product: SpeedWorkbenchProduct): AutoItem => ({
    product,
    searchQuery: buildSpeedSearchQuery(product),
    status: "queued",
    candidates: [],
    selectedCandidates: [],
    selectedUrls: [],
    primaryUrl: null,
  });

  const loadQueue = async () => {
    setLoadingQueue(true);
    onSessionMessage?.(null);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: String(count),
        status: "no_approved",
        // Only include products that have at least one active listing — i.e. they
        // ARE live on the marketplace but are missing approved photos.
        live_only: "true",
      });
      if (category !== "all") params.set("ls_category_id", category);

      const response = await fetch(`/api/admin/images/products?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Failed to load products");

      const products = ((result.data || []) as SpeedWorkbenchProduct[]).filter(
        (p) => !excludedIds.has(p.id),
      );
      if (products.length === 0) {
        onSessionMessage?.("No live products without photos match these filters. Try a different category.");
        setQueue([]);
        return;
      }

      setQueue(products.map(toQueuedItem));
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

  // Core enhancement logic — called by the queue processor, never directly.
  const doEnhanceImage = React.useCallback(
    async (itemIndex: number, originalUrl: string) => {
      // Mark as actively enhancing
      setQueue((q) => {
        const it = q[itemIndex];
        if (!it) return q;
        const next = [...q];
        next[itemIndex] = { ...it, enhancingUrls: [...(it.enhancingUrls ?? []), originalUrl] };
        return next;
      });

      try {
        // Read product id from current queue state without stale closure
        const productId = await new Promise<string | undefined>((resolve) =>
          setQueue((q) => { resolve(q[itemIndex]?.product?.id); return q; }),
        );

        const res = await fetch('/api/admin/images/enhance-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: originalUrl, canonicalProductId: productId }),
        });
        const json = await res.json();
        if (!res.ok || !json.success || !json.url) throw new Error(json.error || 'Enhancement failed');

        const enhancedUrl: string = json.url;
        const enhancedThumb: string = json.thumbnailUrl ?? json.url;

        setQueue((q) => {
          const it = q[itemIndex];
          if (!it) return q;
          const selectedUrls = it.selectedUrls.map((u) => (u === originalUrl ? enhancedUrl : u));
          const selectedCandidates = it.selectedCandidates.map((c) =>
            c.url === originalUrl ? { ...c, url: enhancedUrl, thumbnailUrl: enhancedThumb } : c,
          );
          const primaryUrl = it.primaryUrl === originalUrl ? enhancedUrl : it.primaryUrl;
          const enhancedUrls = { ...(it.enhancedUrls ?? {}), [originalUrl]: enhancedUrl };
          const enhancingUrls = (it.enhancingUrls ?? []).filter((u) => u !== originalUrl);
          const next = [...q];
          next[itemIndex] = { ...it, selectedUrls, selectedCandidates, primaryUrl, enhancedUrls, enhancingUrls };
          return next;
        });
      } catch {
        setQueue((q) => {
          const it = q[itemIndex];
          if (!it) return q;
          const next = [...q];
          next[itemIndex] = { ...it, enhancingUrls: (it.enhancingUrls ?? []).filter((u) => u !== originalUrl) };
          return next;
        });
      }
    },
    [],
  );

  // Queue processor — runs jobs serially so we don't hammer OpenAI concurrently.
  const processEnhanceQueue = React.useCallback(async () => {
    if (enhanceProcessing.current) return;
    enhanceProcessing.current = true;
    while (enhanceJobsRef.current.length > 0) {
      const job = enhanceJobsRef.current.shift()!;
      setEnhanceQueueCount(enhanceJobsRef.current.length);
      await doEnhanceImage(job.itemIndex, job.url);
    }
    enhanceProcessing.current = false;
    setEnhanceQueueCount(0);
  }, [doEnhanceImage]);

  // Public: enqueue a single image for enhancement (called by per-image wand button).
  const enhanceImage = React.useCallback(
    (item: AutoItem, itemIndex: number, originalUrl: string) => {
      if ((item.enhancingUrls ?? []).includes(originalUrl)) return;
      // Skip if already queued
      if (enhanceJobsRef.current.some((j) => j.itemIndex === itemIndex && j.url === originalUrl)) return;
      enhanceJobsRef.current.push({ itemIndex, url: originalUrl });
      setEnhanceQueueCount(enhanceJobsRef.current.length);
      void processEnhanceQueue();
    },
    [processEnhanceQueue],
  );

  // Public: enqueue ALL un-enhanced selected images across the entire queue.
  const enhanceAll = React.useCallback(() => {
    let added = 0;
    queue.forEach((item, itemIndex) => {
      if (item.status !== 'ready' && item.status !== 'done') return;
      item.selectedUrls.forEach((url) => {
        if (item.enhancedUrls?.[url]) return; // already enhanced
        if ((item.enhancingUrls ?? []).includes(url)) return; // in progress
        if (enhanceJobsRef.current.some((j) => j.itemIndex === itemIndex && j.url === url)) return; // queued
        enhanceJobsRef.current.push({ itemIndex, url });
        added++;
      });
    });
    if (added > 0) {
      setEnhanceQueueCount(enhanceJobsRef.current.length);
      void processEnhanceQueue();
    }
  }, [queue, processEnhanceQueue]);

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
              Only shows <strong>live products with no approved photos</strong>. Queue by category or search for a
              specific product. AI searches Serper, picks the best images, and queues them for your review.
            </p>

            {/* ── Row 1: batch by category ── */}
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
                <label className="mb-1 block text-xs text-gray-500">Count (1–50)</label>
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
            </div>

            {/* ── Row 2: search for a specific product ── */}
            <div ref={searchContainerRef} className="relative max-w-sm">
              <label className="mb-1 block text-xs text-gray-500">Add a specific product</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); }}
                  onFocus={() => { if (dropdownResults.length > 0) setDropdownOpen(true); }}
                  onKeyDown={(e) => { if (e.key === "Escape") { setDropdownOpen(false); setProductSearch(""); } }}
                  placeholder="Product name or UPC…"
                  className="h-9 rounded-md pl-8 text-sm"
                  disabled={running}
                />
                {dropdownLoading && (
                  <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
                )}
              </div>

              {/* Dropdown */}
              {dropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                  {dropdownLoading && dropdownResults.length === 0 ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                    </div>
                  ) : dropdownResults.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-gray-500">No live products without photos found.</div>
                  ) : (
                    dropdownResults.map((product) => {
                      const inQueue = queue.some((i) => i.product.id === product.id);
                      const label = product.display_name || product.normalized_name;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          disabled={inQueue}
                          onClick={() => addDropdownProduct(product)}
                          className={cn(
                            "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                            inQueue
                              ? "cursor-default opacity-40"
                              : "hover:bg-gray-50",
                          )}
                        >
                          {product.primary_image_url ? (
                            <Image
                              src={product.primary_image_url}
                              alt=""
                              width={32}
                              height={32}
                              unoptimized
                              className="h-8 w-8 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100">
                              <Package className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-gray-900">{label}</p>
                            <p className="truncate text-[10px] text-gray-400">
                              {product.manufacturer || "—"}{product.upc ? ` · ${product.upc}` : ""}
                            </p>
                          </div>
                          {inQueue ? (
                            <span className="shrink-0 text-[10px] text-gray-400">In queue</span>
                          ) : (
                            <Plus className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* ── Row 3: run + approve actions ── */}
            <div className="flex flex-wrap items-center gap-3">
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

              {/* Enhance all — queues every un-enhanced selected image serially */}
              {queue.some((it) =>
                (it.status === 'ready' || it.status === 'done') &&
                it.selectedUrls.some((u) => !it.enhancedUrls?.[u])
              ) && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-md"
                  onClick={enhanceAll}
                  disabled={enhanceQueueCount > 0}
                >
                  {enhanceQueueCount > 0 ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enhancing… ({enhanceQueueCount} left)
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Enhance all BGs
                    </>
                  )}
                </Button>
              )}
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
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-md text-gray-500 hover:border-red-200 hover:text-red-600"
                      title="Exclude this product"
                      onClick={() => excludeItem(item)}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
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
                        // Resolve: if this URL was enhanced, show the enhanced image
                        const resolvedUrl = item.enhancedUrls?.[url] ?? url;
                        const candidate = item.candidates.find((c) => c.url === url);
                        const displaySrc = item.enhancedUrls?.[url]
                          ? item.enhancedUrls[url]
                          : candidate?.thumbnailUrl ?? url;
                        const fullSrc = item.enhancedUrls?.[url] ?? url;
                        const primary = url === item.primaryUrl;
                        const editable = item.status === "ready";
                        const isEnhancing = (item.enhancingUrls ?? []).includes(url);
                        const isEnhanced = !!(item.enhancedUrls?.[url]);
                        void resolvedUrl; // used via displaySrc
                        return (
                          // Clicking the container opens the lightbox; inner buttons stop propagation.
                          <div
                            key={url}
                            role="button"
                            tabIndex={0}
                            aria-label="View full image"
                            onClick={() => setLightboxUrl(fullSrc)}
                            onKeyDown={(e) => e.key === "Enter" && setLightboxUrl(fullSrc)}
                            className={cn(
                              "group relative aspect-square cursor-zoom-in overflow-hidden rounded-md border bg-gray-100",
                              primary ? "border-gray-900 ring-2 ring-gray-900 ring-offset-1" : "border-gray-200",
                            )}
                          >
                            <Image
                              src={displaySrc}
                              alt=""
                              fill
                              unoptimized
                              className="object-cover"
                            />
                            {/* Enhanced badge */}
                            {isEnhanced && !primary && (
                              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                                <Wand2 className="h-2.5 w-2.5" />
                                Enhanced
                              </span>
                            )}
                            {primary && (
                              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 shadow-sm">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                {isEnhanced ? "Primary · Enhanced" : "Primary"}
                              </span>
                            )}
                            {/* Enhancing spinner overlay */}
                            {isEnhancing && (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                              </div>
                            )}
                            {editable && !isEnhancing && (
                              <>
                                {item.selectedUrls.length > 1 && (
                                  <button
                                    type="button"
                                    aria-label="Remove image"
                                    title="Remove image"
                                    onClick={(e) => { e.stopPropagation(); removeImage(index, url); }}
                                    className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-600 shadow-sm transition hover:bg-white hover:text-gray-900"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {/* Remove background button */}
                                {!isEnhanced && (
                                  <button
                                    type="button"
                                    aria-label="Remove background"
                                    title="Remove background & add white backdrop"
                                    onClick={(e) => { e.stopPropagation(); void enhanceImage(item, index, url); }}
                                    className="absolute left-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-medium text-gray-700 opacity-0 shadow-sm transition hover:bg-white hover:text-gray-900 group-hover:opacity-100"
                                  >
                                    <Wand2 className="h-2.5 w-2.5" />
                                    Remove BG
                                  </button>
                                )}
                                {!primary && (
                                  <button
                                    type="button"
                                    aria-label="Set as primary"
                                    title="Set as primary"
                                    onClick={(e) => { e.stopPropagation(); setPrimary(index, url); }}
                                    className="absolute bottom-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-700 opacity-0 shadow-sm transition hover:bg-white hover:text-gray-900 group-hover:opacity-100"
                                  >
                                    <Star className="h-3 w-3" />
                                  </button>
                                )}
                              </>
                            )}
                            {/* Zoom hint — always visible on hover when not editing */}
                            {!editable && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100">
                                <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                              </div>
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
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                                      <button
                                        type="button"
                                        aria-label="Add image"
                                        title="Add to selection"
                                        onClick={() => addCandidate(index, candidate)}
                                        className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-800 shadow-sm"
                                      >
                                        <Plus className="h-3 w-3" />
                                        Add
                                      </button>
                                    </div>
                                  )}
                                  {/* Expand button — top-right corner */}
                                  <button
                                    type="button"
                                    aria-label="View full image"
                                    title="View full image"
                                    onClick={() => setLightboxUrl(candidate.url)}
                                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/80 text-gray-600 opacity-0 shadow-sm transition hover:bg-white hover:text-gray-900 group-hover:opacity-100"
                                  >
                                    <ZoomIn className="h-3 w-3" />
                                  </button>
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

      {/* ── Exclusion list ──────────────────────────────────────────────── */}
      {excluded.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowExcluded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Ban className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                Exclusion list
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {excluded.length}
              </span>
            </div>
            {showExcluded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {showExcluded && (
            <div className="border-t border-gray-100 p-4">
              <p className="mb-3 text-xs text-gray-500">
                These products are hidden from auto-pilot batches and searches. Click Include to restore them.
              </p>
              <div className="space-y-1.5">
                {excluded.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-gray-800">{entry.name}</p>
                      <p className="truncate text-[10px] text-gray-500">
                        {entry.manufacturer || "Unknown brand"}{entry.upc ? ` · ${entry.upc}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 rounded-md text-xs"
                      onClick={() => unexcludeEntry(entry.id)}
                    >
                      <RotateCcw className="mr-1.5 h-3 w-3" />
                      Include
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Lightbox ────────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Full-size preview"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-lg transition hover:bg-white hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

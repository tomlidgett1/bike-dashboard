"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Package,
  SkipForward,
  Star,
  ThumbsDown,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  buildSpeedSearchQuery,
  fetchSerperCandidates,
  runWithConcurrency,
  type SpeedQueueItem,
  type SpeedSearchCandidate,
  type SpeedWorkbenchProduct,
} from "@/lib/admin/image-qa-speed";

const BATCH_SIZE = 15;
const PREFETCH_CONCURRENCY = 4;
const IMAGES_PER_PRODUCT = 12;

interface ImageQaSpeedPanelProps {
  onSessionMessage?: (message: string | null) => void;
}

export function ImageQaSpeedPanel({ onSessionMessage }: ImageQaSpeedPanelProps) {
  const [category, setCategory] = React.useState("all");
  const [categoryOptions, setCategoryOptions] = React.useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = React.useState(true);
  const [loadingQueue, setLoadingQueue] = React.useState(false);
  const [queue, setQueue] = React.useState<SpeedQueueItem[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [selectedUrls, setSelectedUrls] = React.useState<Set<string>>(new Set());
  const [primaryUrl, setPrimaryUrl] = React.useState<string | null>(null);
  const [backgroundSaveCount, setBackgroundSaveCount] = React.useState(0);
  const [approvedCount, setApprovedCount] = React.useState(0);
  const [skippedCount, setSkippedCount] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCategories(true);
      try {
        const params = new URLSearchParams({ page: "1", limit: "200", status: "needs_work" });
        const response = await fetch(`/api/admin/images/products?${params.toString()}`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Failed to load categories");
        const values = Array.from(
          new Set(
            ((result.data || []) as SpeedWorkbenchProduct[])
              .map((p) => p.marketplace_category)
              .filter(Boolean),
          ),
        ) as string[];
        values.sort((a, b) => a.localeCompare(b));
        if (!cancelled) setCategoryOptions(values);
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

  const prefetchQueue = React.useCallback(async (items: SpeedQueueItem[]) => {
    const tasks = items.map((item, index) => async () => {
      setQueue((current) => {
        const next = [...current];
        if (next[index]) next[index] = { ...next[index], status: "loading" };
        return next;
      });

      try {
        const candidates = await fetchSerperCandidates(item.product, item.searchQuery);
        const trimmed = candidates.slice(0, IMAGES_PER_PRODUCT);
        setQueue((current) => {
          const next = [...current];
          if (!next[index]) return current;
          next[index] = {
            ...next[index],
            status: trimmed.length > 0 ? "ready" : "no_results",
            candidates: trimmed,
            error: trimmed.length > 0 ? undefined : "No images found",
          };
          return next;
        });
      } catch (error) {
        setQueue((current) => {
          const next = [...current];
          if (!next[index]) return current;
          next[index] = {
            ...next[index],
            status: "error",
            candidates: [],
            error: error instanceof Error ? error.message : "Search failed",
          };
          return next;
        });
      }
    });

    await runWithConcurrency(tasks, PREFETCH_CONCURRENCY);
  }, []);

  const loadQueue = async () => {
    setLoadingQueue(true);
    onSessionMessage?.(null);

    try {
      const params = new URLSearchParams({
        page: "1",
        limit: String(BATCH_SIZE),
        status: "needs_work",
      });
      if (category !== "all") params.set("category", category);

      const response = await fetch(`/api/admin/images/products?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Failed to load products");

      const products = (result.data || []) as SpeedWorkbenchProduct[];
      if (products.length === 0) {
        onSessionMessage?.("No products match this category. Try another filter.");
        setQueue([]);
        return;
      }

      const items: SpeedQueueItem[] = products.map((product) => ({
        product,
        searchQuery: buildSpeedSearchQuery(product),
        status: "queued",
        candidates: [],
        dismissedUrls: [],
      }));

      setQueue(items);
      setActiveIndex(0);
      setSelectedUrls(new Set());
      setPrimaryUrl(null);
      setApprovedCount(0);
      setSkippedCount(0);
      void prefetchQueue(items);
    } catch (error) {
      onSessionMessage?.(error instanceof Error ? error.message : "Failed to load queue");
    } finally {
      setLoadingQueue(false);
    }
  };

  const activeItem = queue[activeIndex] ?? null;
  const visibleCandidates =
    activeItem?.candidates.filter((c) => !activeItem.dismissedUrls.includes(c.url)) ?? [];

  const readyCount = queue.filter((item) => item.status === "ready").length;
  const loadingCount = queue.filter((item) => item.status === "loading" || item.status === "queued").length;

  React.useEffect(() => {
    setSelectedUrls(new Set());
    setPrimaryUrl(null);
  }, [activeIndex, activeItem?.product.id]);

  const goToNextIncomplete = React.useCallback(
    (fromIndex: number) => {
      for (let i = fromIndex + 1; i < queue.length; i += 1) {
        if (queue[i].status === "ready" || queue[i].status === "loading" || queue[i].status === "queued") {
          setActiveIndex(i);
          return;
        }
      }
      for (let i = 0; i < fromIndex; i += 1) {
        if (queue[i].status === "ready" || queue[i].status === "loading" || queue[i].status === "queued") {
          setActiveIndex(i);
          return;
        }
      }
    },
    [queue],
  );

  const toggleCandidate = (candidate: SpeedSearchCandidate) => {
    setSelectedUrls((current) => {
      const next = new Set(current);
      if (next.has(candidate.url)) {
        next.delete(candidate.url);
        if (primaryUrl === candidate.url) {
          setPrimaryUrl(next.values().next().value ?? null);
        }
      } else {
        next.add(candidate.url);
        if (!primaryUrl) setPrimaryUrl(candidate.url);
      }
      return next;
    });
  };

  const setPrimary = (candidate: SpeedSearchCandidate) => {
    setPrimaryUrl(candidate.url);
    setSelectedUrls((current) => new Set(current).add(candidate.url));
  };

  const dismissCandidate = (candidate: SpeedSearchCandidate) => {
    if (!activeItem) return;
    setSelectedUrls((current) => {
      const next = new Set(current);
      next.delete(candidate.url);
      return next;
    });
    if (primaryUrl === candidate.url) {
      setPrimaryUrl(null);
    }
    setQueue((current) => {
      const next = [...current];
      const item = next[activeIndex];
      if (!item) return current;
      next[activeIndex] = {
        ...item,
        dismissedUrls: [...item.dismissedUrls, candidate.url],
      };
      return next;
    });
  };

  const approveSelection = () => {
    if (!activeItem) return;
    if (selectedUrls.size === 0 || !primaryUrl) {
      onSessionMessage?.("Select at least one image and choose a primary before approving.");
      return;
    }

    const selectedCandidates = visibleCandidates.filter((c) => selectedUrls.has(c.url));
    if (selectedCandidates.length === 0) {
      onSessionMessage?.("Selected images are no longer visible. Pick again.");
      return;
    }

    const queueIndex = activeIndex;
    const productLabel = activeItem.product.display_name || activeItem.product.normalized_name;
    const payload = {
      canonicalProductId: activeItem.product.id,
      selectedCandidates,
      primaryCandidateUrl: primaryUrl,
      searchQuery: activeItem.searchQuery,
      rejectPending: true,
      quickMode: true,
    };

    setQueue((current) => {
      const next = [...current];
      if (next[queueIndex]) next[queueIndex] = { ...next[queueIndex], status: "saving" };
      return next;
    });
    setApprovedCount((n) => n + 1);
    setBackgroundSaveCount((n) => n + 1);
    setSelectedUrls(new Set());
    setPrimaryUrl(null);
    onSessionMessage?.(
      `Saving ${selectedCandidates.length} image${selectedCandidates.length === 1 ? "" : "s"} for ${productLabel} in the background. Cloudinary upload continues after that.`,
    );
    goToNextIncomplete(queueIndex);

    void fetch("/api/admin/images/approve-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to approve images");
        }
        setQueue((current) => {
          const next = [...current];
          const item = next[queueIndex];
          if (item) next[queueIndex] = { ...item, status: "approved", error: undefined };
          return next;
        });
      })
      .catch((error) => {
        setQueue((current) => {
          const next = [...current];
          const item = next[queueIndex];
          if (item) {
            next[queueIndex] = {
              ...item,
              status: "error",
              error: error instanceof Error ? error.message : "Failed to approve images",
            };
          }
          return next;
        });
        onSessionMessage?.(
          error instanceof Error ? error.message : `Failed to save images for ${productLabel}`,
        );
      })
      .finally(() => {
        setBackgroundSaveCount((n) => Math.max(0, n - 1));
      });
  };

  const skipProduct = () => {
    if (!activeItem) return;
    const removedIndex = activeIndex;
    const nextQueue = queue.filter((_, idx) => idx !== removedIndex);
    const nextIndex = nextQueue.length === 0 ? 0 : Math.min(removedIndex, nextQueue.length - 1);
    setQueue(nextQueue);
    setActiveIndex(nextIndex);
    setSelectedUrls(new Set());
    setPrimaryUrl(null);
    setSkippedCount((n) => n + 1);
    onSessionMessage?.(null);
  };

  const canApprove = selectedUrls.size > 0 && Boolean(primaryUrl);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeItem) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        skipProduct();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextIncomplete(activeIndex);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      }
      if ((event.key === "Enter" || event.key === "a" || event.key === "A") && canApprove) {
        event.preventDefault();
        approveSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, activeItem, canApprove, goToNextIncomplete, skipProduct]);

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-gray-700" />
              <h2 className="text-sm font-medium text-gray-900">Rapid image review</h2>
            </div>
            <p className="max-w-2xl text-xs text-gray-500">
              Pick a category and preload {BATCH_SIZE} products. Click images to select, star one as primary, then
              approve — searches run in the background so you are not waiting per product.
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[12rem]">
                <label className="mb-1 block text-xs text-gray-500">Category</label>
                <Select value={category} onValueChange={setCategory} disabled={loadingCategories}>
                  <SelectTrigger className="h-9 w-full rounded-md">
                    <SelectValue placeholder={loadingCategories ? "Loading…" : "Category"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryOptions.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  className="rounded-md"
                  disabled={loadingQueue || loadingCategories}
                  onClick={() => void loadQueue()}
                >
                  {loadingQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                  Load {BATCH_SIZE} products
                </Button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              {readyCount} ready
            </span>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              {loadingCount} loading
            </span>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              {approvedCount} approved
            </span>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
              {skippedCount} skipped
            </span>
            {backgroundSaveCount > 0 && (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
                {backgroundSaveCount} saving
              </span>
            )}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-gray-500">
          Click an image to select · star for primary ·{" "}
          <span className="font-medium text-gray-700">Approve</span> saves in the background — keep moving ·{" "}
          <span className="font-medium text-gray-700">N</span> skip ·{" "}
          <span className="font-medium text-gray-700">Enter</span> approve when ready
        </p>
      </div>

      {queue.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center rounded-md border border-dashed border-gray-200 bg-white p-8 text-sm text-gray-500">
          Select a category and load a batch to start rapid review.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="max-h-[70vh] space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-white p-2 shadow-sm">
            {queue.map((item, index) => {
              const showStatusOverlay =
                item.status === "saving" || item.status === "approved" || item.status === "error";
              return (
                <button
                  key={item.product.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full gap-2.5 rounded-md border p-2 text-left text-xs transition-colors",
                    index === activeIndex ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50",
                  )}
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {item.product.primary_image_url ? (
                      <Image
                        src={item.product.primary_image_url}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <Package className="absolute inset-0 m-auto h-5 w-5 text-gray-400" />
                    )}
                    {item.status === "loading" || item.status === "queued" ? (
                      <div className="absolute bottom-0.5 right-0.5 rounded-md bg-white p-0.5 shadow-sm">
                        <Loader2 className="h-3 w-3 animate-spin text-gray-600" />
                      </div>
                    ) : null}
                    {showStatusOverlay ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/85">
                        {item.status === "saving" && (
                          <Loader2 className="h-5 w-5 animate-spin text-gray-800" aria-label="Saving" />
                        )}
                        {item.status === "approved" && (
                          <CheckCircle2 className="h-5 w-5 text-gray-900" aria-label="Approved" />
                        )}
                        {item.status === "error" && (
                          <AlertCircle className="h-5 w-5 text-gray-700" aria-label="Save failed" />
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-medium text-gray-900">
                      {item.product.display_name || item.product.normalized_name}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-gray-500">
                      {item.status === "loading" && "Searching…"}
                      {item.status === "queued" && "Queued"}
                      {item.status === "ready" && `${item.candidates.length} images`}
                      {item.status === "saving" && "Saving…"}
                      {item.status === "approved" && "Approved"}
                      {item.status === "no_results" && "No results"}
                      {item.status === "error" && (item.error || "Save failed")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            {!activeItem ? (
              <p className="text-sm text-gray-500">Select a product from the queue.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-medium text-gray-900">
                      {activeItem.product.display_name || activeItem.product.normalized_name}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {activeItem.product.manufacturer || "Unknown brand"} · UPC {activeItem.product.upc || "—"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-gray-400">{activeItem.searchQuery}</p>
                    {selectedUrls.size > 0 && (
                      <p className="mt-2 text-xs text-gray-600">
                        {selectedUrls.size} selected
                        {primaryUrl ? " · primary set" : " · choose a primary (star)"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      className="rounded-md"
                      disabled={!canApprove}
                      onClick={approveSelection}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve{selectedUrls.size > 0 ? ` (${selectedUrls.size})` : ""}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-md"
                      onClick={skipProduct}
                    >
                      <SkipForward className="mr-2 h-4 w-4" />
                      Skip product
                    </Button>
                  </div>
                </div>

                {(activeItem.status === "loading" || activeItem.status === "queued") && (
                  <div className="mb-4 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading Serper images in the background…
                  </div>
                )}

                {activeItem.status === "error" && (
                  <p className="mb-4 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                    {activeItem.error}
                  </p>
                )}

                {activeItem.status === "no_results" && (
                  <p className="mb-4 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                    No images returned. Skip to the next product or use the workbench for a custom search.
                  </p>
                )}

                {activeItem.status === "approved" && (
                  <p className="mb-4 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                    This product already has approved images from this session.
                  </p>
                )}

                {visibleCandidates.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {visibleCandidates.map((candidate) => {
                      const selected = selectedUrls.has(candidate.url);
                      const primary = primaryUrl === candidate.url;
                      return (
                        <div
                          key={candidate.url}
                          className={cn(
                            "overflow-hidden rounded-md border bg-white shadow-sm",
                            selected ? "border-gray-900" : "border-gray-200",
                            primary && "ring-2 ring-gray-900 ring-offset-1",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleCandidate(candidate)}
                            className="relative block aspect-square w-full bg-gray-100"
                          >
                            <Image
                              src={candidate.thumbnailUrl || candidate.url}
                              alt={candidate.title || "Candidate"}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                            {selected && (
                              <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-md bg-white text-gray-900" />
                            )}
                            {primary && (
                              <span className="absolute left-2 top-2 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 shadow-sm">
                                Primary
                              </span>
                            )}
                          </button>
                          <div className="space-y-2 p-2">
                            <p className="line-clamp-2 text-xs text-gray-600">
                              {candidate.title || candidate.domain || "Image"}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => toggleCandidate(candidate)}
                                className="h-8 flex-1 rounded-md"
                              >
                                {selected ? <X className="mr-1 h-3 w-3" /> : <Check className="mr-1 h-3 w-3" />}
                                {selected ? "Deselect" : "Select"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={primary ? "default" : "outline"}
                                onClick={() => setPrimary(candidate)}
                                className="h-8 rounded-md"
                                aria-label="Set as primary"
                              >
                                <Star className={cn("h-3 w-3", primary && "fill-current")} />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => dismissCandidate(candidate)}
                                className="h-8 rounded-md"
                                aria-label="Dismiss image"
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : activeItem.status === "ready" ? (
                  <p className="text-sm text-gray-500">All images dismissed. Skip this product or load a new batch.</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

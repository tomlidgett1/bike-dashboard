"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Expand,
  Loader2,
  Package,
  RefreshCw,
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

const DEFAULT_BATCH_SIZE = 15;
const PREFETCH_CONCURRENCY = 4;
const IMAGES_PER_PRODUCT = 12;

interface ImageQaSpeedPanelProps {
  onSessionMessage?: (message: string | null) => void;
}

export function ImageQaSpeedPanel({ onSessionMessage }: ImageQaSpeedPanelProps) {
  const [category, setCategory] = React.useState("all");
  const [categoryOptions, setCategoryOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = React.useState(true);
  const [loadingQueue, setLoadingQueue] = React.useState(false);
  // Configurable batch size
  const [batchSize, setBatchSize] = React.useState(DEFAULT_BATCH_SIZE);
  // SOH / price filters
  const [minSoh, setMinSoh] = React.useState("");
  const [minPrice, setMinPrice] = React.useState("");
  const [maxPrice, setMaxPrice] = React.useState("");
  const [queue, setQueue] = React.useState<SpeedQueueItem[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [selectedUrls, setSelectedUrls] = React.useState<Set<string>>(new Set());
  const [primaryUrl, setPrimaryUrl] = React.useState<string | null>(null);
  const [backgroundSaveCount, setBackgroundSaveCount] = React.useState(0);
  const [approvedCount, setApprovedCount] = React.useState(0);
  const [skippedCount, setSkippedCount] = React.useState(0);
  // Editable search query for the active product
  const [queryDraft, setQueryDraft] = React.useState("");
  // Lightbox — URL of the image currently shown full-screen (null = closed)
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCategories(true);
      try {
        // Fetch category names from the dedicated endpoint — resolves real names
        // from the Lightspeed API using the raw category IDs stored on products.
        const response = await fetch("/api/admin/images/lightspeed-categories");
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
        limit: String(batchSize),
        status: "needs_work",
      });
      if (category !== "all") params.set("ls_category_id", category);
      if (minSoh.trim()) params.set("min_qoh", minSoh.trim());
      if (minPrice.trim()) params.set("min_price", minPrice.trim());
      if (maxPrice.trim()) params.set("max_price", maxPrice.trim());

      const response = await fetch(`/api/admin/images/products?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Failed to load products");

      const products = (result.data || []) as SpeedWorkbenchProduct[];
      if (products.length === 0) {
        onSessionMessage?.("No products match these filters. Try adjusting them.");
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
    // Sync editable query with the active item's search query
    if (activeItem) setQueryDraft(activeItem.searchQuery);
  }, [activeIndex, activeItem?.product.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const researchProduct = React.useCallback(async () => {
    if (!activeItem) return;
    const newQuery = queryDraft.trim();
    if (!newQuery) return;

    const idx = activeIndex;
    // Update the stored search query and reset to loading
    setQueue((current) => {
      const next = [...current];
      if (next[idx]) {
        next[idx] = { ...next[idx], searchQuery: newQuery, status: "loading", candidates: [], dismissedUrls: [] };
      }
      return next;
    });
    setSelectedUrls(new Set());
    setPrimaryUrl(null);

    try {
      const candidates = await fetchSerperCandidates(activeItem.product, newQuery);
      const trimmed = candidates.slice(0, IMAGES_PER_PRODUCT);
      setQueue((current) => {
        const next = [...current];
        if (!next[idx]) return current;
        next[idx] = {
          ...next[idx],
          status: trimmed.length > 0 ? "ready" : "no_results",
          candidates: trimmed,
          error: trimmed.length > 0 ? undefined : "No images found",
        };
        return next;
      });
    } catch (error) {
      setQueue((current) => {
        const next = [...current];
        if (!next[idx]) return current;
        next[idx] = {
          ...next[idx],
          status: "error",
          candidates: [],
          error: error instanceof Error ? error.message : "Search failed",
        };
        return next;
      });
    }
  }, [activeItem, activeIndex, queryDraft]);

  // Lightbox navigation helpers
  const lightboxIndex = lightboxUrl
    ? visibleCandidates.findIndex((c) => c.url === lightboxUrl)
    : -1;
  const openLightbox = (url: string) => setLightboxUrl(url);
  const closeLightbox = () => setLightboxUrl(null);
  const lightboxPrev = () => {
    if (lightboxIndex > 0) setLightboxUrl(visibleCandidates[lightboxIndex - 1].url);
  };
  const lightboxNext = () => {
    if (lightboxIndex < visibleCandidates.length - 1)
      setLightboxUrl(visibleCandidates[lightboxIndex + 1].url);
  };

  const canApprove = selectedUrls.size > 0 && Boolean(primaryUrl);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Lightbox takes over arrow keys and Escape when open
      if (lightboxUrl) {
        if (event.key === "Escape") { event.preventDefault(); closeLightbox(); }
        if (event.key === "ArrowLeft") { event.preventDefault(); lightboxPrev(); }
        if (event.key === "ArrowRight") { event.preventDefault(); lightboxNext(); }
        return;
      }

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
  }, [activeIndex, activeItem, canApprove, goToNextIncomplete, lightboxUrl, lightboxNext, lightboxPrev, skipProduct]);

  return (
    <>
    <div className="space-y-6">
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-gray-700" />
              <h2 className="text-sm font-medium text-gray-900">Rapid image review</h2>
            </div>
            <p className="max-w-2xl text-xs text-gray-500">
              Pick filters, set a batch size, and load products. Click images to select, star one as primary, then
              approve — searches run in the background so you are not waiting per product.
            </p>
            <div className="flex flex-wrap gap-3">
              {/* Category */}
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

              {/* Min SOH */}
              <div className="w-28">
                <label className="mb-1 block text-xs text-gray-500">Min SOH</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Any"
                  value={minSoh}
                  onChange={(e) => setMinSoh(e.target.value)}
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                />
              </div>

              {/* Price range */}
              <div className="w-28">
                <label className="mb-1 block text-xs text-gray-500">Min price ($)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Any"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                />
              </div>
              <div className="w-28">
                <label className="mb-1 block text-xs text-gray-500">Max price ($)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Any"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                />
              </div>

              {/* Batch size */}
              <div className="w-28">
                <label className="mb-1 block text-xs text-gray-500">Batch size</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  step="1"
                  value={batchSize}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 1) setBatchSize(Math.min(v, 200));
                  }}
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  className="rounded-md"
                  disabled={loadingQueue || loadingCategories}
                  onClick={() => void loadQueue()}
                >
                  {loadingQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                  Load {batchSize} products
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
          <span className="font-medium text-gray-700">Enter</span> approve (or re-search when query focused)
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
                      {item.product.store_product_name || item.product.display_name || item.product.normalized_name}
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
                      {activeItem.product.store_product_name || activeItem.product.display_name || activeItem.product.normalized_name}
                    </h3>
                    {activeItem.product.store_product_name && (activeItem.product.display_name || activeItem.product.normalized_name) && (
                      <p className="mt-0.5 text-[11px] text-gray-400 italic">
                        {activeItem.product.display_name || activeItem.product.normalized_name}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {activeItem.product.manufacturer || "Unknown brand"} · UPC {activeItem.product.upc || "—"}
                    </p>
                    {/* Editable Serper search query */}
                    <div className="mt-2 flex items-start gap-1.5">
                      <textarea
                        rows={2}
                        value={queryDraft}
                        onChange={(e) => setQueryDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void researchProduct();
                          }
                        }}
                        className="flex-1 resize-none rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-700 focus:border-gray-400 focus:bg-white focus:outline-none"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void researchProduct()}
                        disabled={activeItem.status === "loading" || !queryDraft.trim()}
                        className="h-auto rounded-md px-2 py-1.5 text-xs"
                        title="Re-search with this query (Enter)"
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", activeItem.status === "loading" && "animate-spin")} />
                      </Button>
                    </div>
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
                          <div className="relative aspect-square w-full bg-gray-100">
                            <button
                              type="button"
                              onClick={() => toggleCandidate(candidate)}
                              className="absolute inset-0 block"
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
                            {/* Expand button */}
                            <button
                              type="button"
                              onClick={() => openLightbox(candidate.url)}
                              className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 shadow-sm hover:bg-white"
                              title="Expand image"
                            >
                              <Expand className="h-3.5 w-3.5 text-gray-700" />
                            </button>
                          </div>
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

      {/* ── Lightbox overlay ── */}

      {lightboxUrl && (() => {
        const lbCandidate = visibleCandidates[lightboxIndex];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={closeLightbox}
          >
            {/* Close */}
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Prev */}
            {lightboxIndex > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Next */}
            {lightboxIndex < visibleCandidates.length - 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}

            {/* Image */}
            <div
              className="relative max-h-[85vh] max-w-[85vw] overflow-hidden rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt={lbCandidate?.title || "Preview"}
                className="block max-h-[85vh] max-w-[85vw] object-contain"
              />
            </div>

            {/* Caption + counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-black/50 px-3 py-1.5 text-center text-xs text-white/80">
              {lbCandidate?.title || lbCandidate?.domain || "Image"}{" "}
              <span className="opacity-50">
                · {lightboxIndex + 1} / {visibleCandidates.length}
              </span>
            </div>
          </div>
        );
      })()}
    </>
  );
}

"use client";

/**
 * Hero Background Panel
 *
 * Shows every canonical product's primary image in a grid.  The user selects
 * one or more products, clicks "Enhance selected", and the panel serially
 * calls gpt-image-2 (via /api/admin/images/enhance-preview) to place each
 * product on a consistent soft-grey studio backdrop with a subtle shadow.
 *
 * Each enhanced result is shown as a before/after comparison — the user then
 * approves (saves as new primary via /api/admin/images/hero-approve) or
 * rejects (discards and keeps the original).
 *
 * Queue is serial because gpt-image-2 image edits take ~30 s each.
 */

import * as React from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HeroProduct {
  id: string;
  display_name: string | null;
  normalized_name: string;
  manufacturer: string | null;
  marketplace_category: string | null;
  primary_image_url: string | null;
  primary_image_id: string | null;
}

type ItemStatus =
  | "idle"       // not selected, showing original
  | "selected"   // checkbox ticked, waiting for queue
  | "queued"     // in the enhancement queue, not yet processing
  | "enhancing"  // OpenAI call in-flight
  | "preview"    // enhanced image ready, awaiting approve/reject
  | "approving"  // saving to DB
  | "approved"   // done — showing enhanced image
  | "rejected"   // user rejected — back to original
  | "error";     // enhancement or save failed

interface HeroItem {
  product: HeroProduct;
  status: ItemStatus;
  enhancedUrl?: string;
  enhancedPublicId?: string;
  error?: string;
}

interface HeroBackgroundPanelProps {
  onSessionMessage?: (msg: string | null) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HeroBackgroundPanel({ onSessionMessage }: HeroBackgroundPanelProps) {
  const [items, setItems] = React.useState<HeroItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [categories, setCategories] = React.useState<string[]>([]);

  // ── Serial enhance queue ──────────────────────────────────────────────────
  const enhanceJobsRef = React.useRef<number[]>([]); // indexes into `items`
  const [enhanceQueueCount, setEnhanceQueueCount] = React.useState(0);
  const enhanceProcessing = React.useRef(false);

  // ── Load products ─────────────────────────────────────────────────────────

  const fetchProducts = React.useCallback(
    async (nextPage = 1, nextSearch = search, nextCategory = category) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "48",
          status: "ready", // only products that have primary images
        });
        if (nextSearch.trim()) params.set("search", nextSearch.trim());
        if (nextCategory !== "all") params.set("category", nextCategory);

        const res = await fetch(`/api/admin/images/products?${params}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load");

        const products: HeroProduct[] = (json.data || []).filter(
          (p: HeroProduct) => p.primary_image_url,
        );

        setItems(products.map((p) => ({ product: p, status: "idle" })));
        setPage(json.pagination?.page || nextPage);
        setTotalPages(json.pagination?.total_pages || 1);

        // Collect category options
        const cats = Array.from(
          new Set(
            (json.data || [])
              .map((p: HeroProduct) => p.marketplace_category)
              .filter(Boolean) as string[],
          ),
        );
        if (cats.length > 0) setCategories((prev) => Array.from(new Set([...prev, ...cats])));
      } catch (err) {
        onSessionMessage?.(err instanceof Error ? err.message : "Failed to load products");
      } finally {
        setLoading(false);
      }
    },
    [category, search, onSessionMessage],
  );

  React.useEffect(() => {
    void fetchProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Patch a single item ───────────────────────────────────────────────────

  const patch = React.useCallback(
    (index: number, updates: Partial<HeroItem>) =>
      setItems((prev) => {
        const next = [...prev];
        const it = next[index];
        if (!it) return prev;
        next[index] = { ...it, ...updates };
        return next;
      }),
    [],
  );

  // ── Toggle selection ──────────────────────────────────────────────────────

  const toggleSelect = (index: number) => {
    setItems((prev) => {
      const it = prev[index];
      if (!it || !["idle", "selected", "rejected", "error"].includes(it.status)) return prev;
      const next = [...prev];
      next[index] = {
        ...it,
        status: it.status === "selected" ? "idle" : "selected",
      };
      return next;
    });
  };

  const selectAll = () => {
    setItems((prev) =>
      prev.map((it) =>
        ["idle", "rejected", "error"].includes(it.status)
          ? { ...it, status: "selected" as ItemStatus }
          : it,
      ),
    );
  };

  const clearSelection = () => {
    setItems((prev) =>
      prev.map((it) =>
        it.status === "selected" ? { ...it, status: "idle" as ItemStatus } : it,
      ),
    );
  };

  // ── Core enhancement for one item ─────────────────────────────────────────

  const doEnhance = React.useCallback(
    async (index: number) => {
      // Read the current item's data without stale closure
      const imageUrl = await new Promise<string | null>((resolve) =>
        setItems((prev) => {
          resolve(prev[index]?.product.primary_image_url ?? null);
          return prev;
        }),
      );
      const productId = await new Promise<string | undefined>((resolve) =>
        setItems((prev) => {
          resolve(prev[index]?.product.id);
          return prev;
        }),
      );

      if (!imageUrl) {
        patch(index, { status: "error", error: "No primary image URL" });
        return;
      }

      patch(index, { status: "enhancing", error: undefined });

      try {
        const res = await fetch("/api/admin/images/enhance-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl, canonicalProductId: productId }),
        });
        const json = await res.json();
        if (!res.ok || !json.success || !json.url) {
          throw new Error(json.error || "Enhancement failed");
        }
        patch(index, {
          status: "preview",
          enhancedUrl: json.url as string,
          enhancedPublicId: (json.publicId as string) || undefined,
        });
      } catch (err) {
        patch(index, {
          status: "error",
          error: err instanceof Error ? err.message : "Enhancement failed",
        });
      }
    },
    [patch],
  );

  // ── Queue processor (serial) ──────────────────────────────────────────────

  const processQueue = React.useCallback(async () => {
    if (enhanceProcessing.current) return;
    enhanceProcessing.current = true;
    while (enhanceJobsRef.current.length > 0) {
      const idx = enhanceJobsRef.current.shift()!;
      setEnhanceQueueCount(enhanceJobsRef.current.length);
      await doEnhance(idx);
    }
    enhanceProcessing.current = false;
    setEnhanceQueueCount(0);
  }, [doEnhance]);

  // Enqueue all selected items
  const enqueueSelected = React.useCallback(() => {
    let added = 0;
    setItems((prev) => {
      prev.forEach((it, i) => {
        if (it.status === "selected") {
          if (!enhanceJobsRef.current.includes(i)) {
            enhanceJobsRef.current.push(i);
            added++;
          }
        }
      });
      // Mark queued
      return prev.map((it, i) =>
        it.status === "selected" && enhanceJobsRef.current.includes(i)
          ? { ...it, status: "queued" as ItemStatus }
          : it,
      );
    });
    if (added > 0) {
      setEnhanceQueueCount(enhanceJobsRef.current.length);
      void processQueue();
    }
  }, [processQueue]);

  // ── Approve ───────────────────────────────────────────────────────────────

  const approve = React.useCallback(
    async (index: number) => {
      const item = await new Promise<HeroItem | undefined>((resolve) =>
        setItems((prev) => {
          resolve(prev[index]);
          return prev;
        }),
      );
      if (!item || !item.enhancedUrl) return;

      patch(index, { status: "approving" });

      try {
        const res = await fetch("/api/admin/images/hero-approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonicalProductId: item.product.id,
            enhancedUrl: item.enhancedUrl,
            enhancedPublicId: item.enhancedPublicId,
            sourceImageUrl: item.product.primary_image_url,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
        patch(index, { status: "approved" });
        onSessionMessage?.("Hero image approved and saved as primary.");
      } catch (err) {
        patch(index, {
          status: "error",
          error: err instanceof Error ? err.message : "Save failed",
        });
      }
    },
    [patch, onSessionMessage],
  );

  // ── Reject ────────────────────────────────────────────────────────────────

  const reject = React.useCallback(
    (index: number) => {
      patch(index, { status: "rejected", enhancedUrl: undefined, enhancedPublicId: undefined });
    },
    [patch],
  );

  // ── Retry ─────────────────────────────────────────────────────────────────

  const retry = React.useCallback(
    (index: number) => {
      patch(index, { status: "selected", error: undefined });
    },
    [patch],
  );

  // ── Derived counts ────────────────────────────────────────────────────────

  const selectedCount = items.filter((it) => it.status === "selected").length;
  const previewCount = items.filter((it) => it.status === "preview").length;
  const approvedCount = items.filter((it) => it.status === "approved").length;
  const activeCount = enhanceQueueCount + (enhanceProcessing.current ? 1 : 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="flex gap-1.5">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearch(searchInput);
                void fetchProducts(1, searchInput, category);
              }
            }}
            placeholder="Search products…"
            className="h-8 w-44 rounded-md text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-md px-2"
            onClick={() => {
              setSearch(searchInput);
              void fetchProducts(1, searchInput, category);
            }}
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Category */}
        {categories.length > 0 && (
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              void fetchProducts(1, search, v);
            }}
          >
            <SelectTrigger className="h-8 w-40 rounded-md text-sm">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Select / clear all */}
          {selectedCount > 0 ? (
            <Button size="sm" variant="outline" className="h-8 rounded-md text-sm" onClick={clearSelection}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear ({selectedCount})
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-8 rounded-md text-sm" onClick={selectAll}
              disabled={loading || items.filter(it => ["idle","rejected","error"].includes(it.status)).length === 0}
            >
              Select all
            </Button>
          )}

          {/* Enhance selected */}
          <Button
            size="sm"
            className="h-8 rounded-md text-sm"
            disabled={selectedCount === 0 && activeCount === 0}
            onClick={enqueueSelected}
          >
            {activeCount > 0 ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Enhancing… {activeCount > 0 ? `(${activeCount} left)` : ""}
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Enhance selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </>
            )}
          </Button>

          {/* Approve all in preview */}
          {previewCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-md text-sm"
              onClick={() => {
                items.forEach((it, i) => {
                  if (it.status === "preview") void approve(i);
                });
              }}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Approve all ({previewCount})
            </Button>
          )}
        </div>
      </div>

      {/* ── Stats bar ── */}
      {(approvedCount > 0 || previewCount > 0) && (
        <div className="flex gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
          {approvedCount > 0 && <span>✓ {approvedCount} approved this session</span>}
          {previewCount > 0 && <span>⏳ {previewCount} awaiting review</span>}
        </div>
      )}

      {/* ── Grid ── */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading products…
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center rounded-md border border-dashed border-gray-200 bg-white text-sm text-gray-500">
          No products with primary images found.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((item, index) => (
            <HeroCard
              key={item.product.id}
              item={item}
              index={index}
              onToggleSelect={toggleSelect}
              onApprove={approve}
              onReject={reject}
              onRetry={retry}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-md"
            disabled={page <= 1 || loading}
            onClick={() => void fetchProducts(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-gray-500">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-md"
            disabled={page >= totalPages || loading}
            onClick={() => void fetchProducts(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── HeroCard ──────────────────────────────────────────────────────────────────

interface HeroCardProps {
  item: HeroItem;
  index: number;
  onToggleSelect: (i: number) => void;
  onApprove: (i: number) => Promise<void>;
  onReject: (i: number) => void;
  onRetry: (i: number) => void;
}

function HeroCard({ item, index, onToggleSelect, onApprove, onReject, onRetry }: HeroCardProps) {
  const { product, status, enhancedUrl, error } = item;
  const originalUrl = product.primary_image_url;
  const name = product.display_name || product.normalized_name;

  const isSelectable = ["idle", "selected", "rejected", "error"].includes(status);
  const isSelected = status === "selected";
  const isPreview = status === "preview";
  const isEnhancing = status === "enhancing" || status === "queued";
  const isApproved = status === "approved";
  const isRejected = status === "rejected";
  const isApproving = status === "approving";
  const isError = status === "error";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-white shadow-sm transition-shadow",
        isSelected && "border-gray-900 ring-1 ring-gray-900",
        isApproved && "border-emerald-500",
        isRejected && "border-gray-200 opacity-60",
        isError && "border-red-300",
        !isSelected && !isApproved && !isRejected && !isError && "border-gray-200",
      )}
    >
      {/* ── Image area ── */}
      {isPreview ? (
        /* Before / after split */
        <div className="flex aspect-[2/1] w-full overflow-hidden">
          {/* Before */}
          <div className="relative w-1/2 bg-gray-100">
            {originalUrl ? (
              <Image src={originalUrl} alt="Original" fill unoptimized className="object-cover" />
            ) : (
              <Package className="absolute inset-0 m-auto h-6 w-6 text-gray-300" />
            )}
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
              Before
            </span>
          </div>
          {/* After */}
          <div className="relative w-1/2 bg-gray-50">
            {enhancedUrl ? (
              <Image src={enhancedUrl} alt="Enhanced" fill unoptimized className="object-cover" />
            ) : (
              <Package className="absolute inset-0 m-auto h-6 w-6 text-gray-300" />
            )}
            <span className="absolute bottom-1 right-1 rounded bg-emerald-600/80 px-1 py-0.5 text-[9px] font-medium text-white">
              After
            </span>
          </div>
        </div>
      ) : (
        /* Single image */
        <button
          type="button"
          className="relative block aspect-square w-full bg-gray-100"
          onClick={() => isSelectable && onToggleSelect(index)}
          disabled={!isSelectable}
        >
          {isApproved && enhancedUrl ? (
            <Image src={enhancedUrl} alt={name} fill unoptimized className="object-cover" />
          ) : originalUrl ? (
            <Image src={originalUrl} alt={name} fill unoptimized className="object-cover" />
          ) : (
            <Package className="absolute inset-0 m-auto h-8 w-8 text-gray-300" />
          )}

          {/* Overlay badges */}
          {isEnhancing && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
              <span className="ml-2 text-xs text-gray-600">
                {status === "queued" ? "In queue…" : "Enhancing…"}
              </span>
            </div>
          )}
          {isApproved && (
            <div className="absolute inset-0 flex items-end justify-start p-1.5">
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                ✓ Applied
              </span>
            </div>
          )}
          {isRejected && (
            <div className="absolute inset-0 flex items-end justify-start p-1.5">
              <span className="rounded bg-gray-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                ✗ Rejected
              </span>
            </div>
          )}
          {isSelected && (
            <div className="absolute right-1.5 top-1.5">
              <CheckCircle2 className="h-5 w-5 rounded-full bg-white text-gray-900" />
            </div>
          )}
          {isError && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-50/80">
              <span className="px-2 text-center text-[10px] text-red-600">{error || "Failed"}</span>
            </div>
          )}
          {isApproving && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            </div>
          )}
        </button>
      )}

      {/* ── Footer ── */}
      <div className="px-2 pb-2 pt-1.5">
        <p className="mb-1.5 line-clamp-1 text-[11px] font-medium text-gray-800" title={name}>
          {name}
        </p>
        {product.manufacturer && (
          <p className="mb-1.5 line-clamp-1 text-[10px] text-gray-500">{product.manufacturer}</p>
        )}

        {/* Action buttons per state */}
        {isPreview && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 flex-1 rounded-md bg-emerald-600 text-xs hover:bg-emerald-700 text-white"
              onClick={() => void onApprove(index)}
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-md px-2 text-xs"
              onClick={() => onReject(index)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {isError && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full rounded-md text-xs"
            onClick={() => onRetry(index)}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        )}

        {isRejected && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full rounded-md text-xs text-gray-600"
            onClick={() => onRetry(index)}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Re-enhance
          </Button>
        )}

        {isApproved && (
          <p className="text-[10px] text-emerald-600">Hero image updated ✓</p>
        )}

        {(isEnhancing) && (
          <p className="text-[10px] text-gray-500">
            {status === "queued" ? "Waiting in queue…" : "Running gpt-image-2…"}
          </p>
        )}

        {isSelectable && (
          <button
            type="button"
            className={cn(
              "mt-0.5 w-full rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              isSelected
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            )}
            onClick={() => onToggleSelect(index)}
          >
            {isSelected ? "✓ Selected" : "Select"}
          </button>
        )}
      </div>
    </div>
  );
}

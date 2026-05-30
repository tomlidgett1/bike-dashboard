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
  ArrowLeftRight,
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
import { buildNormalizedHeroUrl } from "@/lib/utils/cloudinary-transforms";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HeroProduct {
  id: string;
  display_name: string | null;
  normalized_name: string;
  manufacturer: string | null;
  marketplace_category: string | null;
  primary_image_url: string | null;
  /** Uncropped full-res URL (zoom slot) — used for background removal so the
   *  AI sees the whole product, not just the square centre-crop. */
  primary_image_zoom_url?: string | null;
  primary_image_id: string | null;
  bg_removed?: boolean; // true when the current primary is a studio hero
}

type BgFilter = "all" | "removed" | "original";

interface CategoryOption {
  id: string;
  name: string;
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
  const [category, setCategory] = React.useState("all"); // ls_category_id or "all"
  const [categoryOptions, setCategoryOptions] = React.useState<CategoryOption[]>([]);
  const [bgFilter, setBgFilter] = React.useState<BgFilter>("all");

  // ── Ref mirror so async queue callbacks can read current item data ────────
  // React may bail out of a setState updater that returns `prev` unchanged
  // (same reference), so the Promise-in-setState trick is unreliable.
  // Instead we keep a ref that is always in sync with the `items` state.
  const itemsRef = React.useRef<HeroItem[]>([]);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ── Serial enhance queue ──────────────────────────────────────────────────
  const enhanceJobsRef = React.useRef<number[]>([]); // indexes into `items`
  const [enhanceQueueCount, setEnhanceQueueCount] = React.useState(0);
  const enhanceProcessing = React.useRef(false);

  // ── Load products ─────────────────────────────────────────────────────────

  const fetchProducts = React.useCallback(
    async (
      nextPage = 1,
      nextSearch = search,
      nextCategory = category,
      nextBg = bgFilter,
    ) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "48",
          status: "ready",    // only products that have a primary image
          live_only: "true",  // only products live on the marketplace for this user
          bg_filter: nextBg,  // tag/filter by background-removed status
        });
        if (nextSearch.trim()) params.set("search", nextSearch.trim());
        if (nextCategory !== "all") params.set("ls_category_id", nextCategory);

        const res = await fetch(`/api/admin/images/products?${params}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load");

        const products: HeroProduct[] = (json.data || []).filter(
          (p: HeroProduct) => p.primary_image_url,
        );

        setItems(products.map((p) => ({ product: p, status: "idle" })));
        setPage(json.pagination?.page || nextPage);
        setTotalPages(json.pagination?.total_pages || 1);
      } catch (err) {
        onSessionMessage?.(err instanceof Error ? err.message : "Failed to load products");
      } finally {
        setLoading(false);
      }
    },
    [category, search, bgFilter, onSessionMessage],
  );

  React.useEffect(() => {
    void fetchProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the full Lightspeed category list (names resolved server-side) so the
  // category filter is complete, not just whatever happened to be on this page.
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/images/lightspeed-categories");
        const json = await res.json();
        if (json?.success && Array.isArray(json.categories)) {
          setCategoryOptions(
            json.categories.filter((c: CategoryOption) => c?.id && c?.name),
          );
        }
      } catch {
        /* categories are an optional convenience — ignore failures */
      }
    })();
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
      // Read directly from the ref — safe even inside an async queue callback.
      const item = itemsRef.current[index];
      // Prefer the full-resolution uncropped zoom URL so gpt-image-2 sees the
      // entire product. Fall back to the card URL only if zoom isn't available.
      const imageUrl = item?.product.primary_image_zoom_url || item?.product.primary_image_url || null;
      const productId = item?.product.id;

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
    // Read selected indexes synchronously from the ref mirror.
    // Do NOT rely on a variable mutated inside setItems — React calls updaters
    // lazily during the render phase, so `added` would always be 0 here.
    const newJobs: number[] = [];
    itemsRef.current.forEach((it, i) => {
      if (it.status === "selected" && !enhanceJobsRef.current.includes(i)) {
        newJobs.push(i);
        enhanceJobsRef.current.push(i); // populate ref NOW, before setItems
      }
    });

    if (newJobs.length === 0) return;

    setEnhanceQueueCount(enhanceJobsRef.current.length);

    // Update UI to show queued status (async — purely cosmetic)
    setItems((prev) =>
      prev.map((it, i) =>
        newJobs.includes(i) ? { ...it, status: "queued" as ItemStatus } : it,
      ),
    );

    // Start the processor — queue ref is already populated so this will run
    void processQueue();
  }, [processQueue]);

  // ── Approve ───────────────────────────────────────────────────────────────

  const approve = React.useCallback(
    async (index: number) => {
      const item = itemsRef.current[index];
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
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            void fetchProducts(1, search, v, bgFilter);
          }}
        >
          <SelectTrigger className="h-8 w-44 rounded-md text-sm">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Background-removed filter */}
        <Select
          value={bgFilter}
          onValueChange={(v) => {
            const next = v as BgFilter;
            setBgFilter(next);
            void fetchProducts(1, search, category, next);
          }}
        >
          <SelectTrigger className="h-8 w-44 rounded-md text-sm">
            <SelectValue placeholder="All images" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All images</SelectItem>
            <SelectItem value="removed">Background removed</SelectItem>
            <SelectItem value="original">Original only</SelectItem>
          </SelectContent>
        </Select>

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
          No live marketplace products with primary images found.
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

  // Preview the deterministic 95%-height hero (trim → fit → pad) — this is the
  // exact framing that hero-approve bakes into the saved asset, so what the user
  // sees here is what lands on the marketplace. Falls back to the raw model
  // output if the URL isn't a Cloudinary asset.
  const displayEnhancedUrl = React.useMemo(
    () => buildNormalizedHeroUrl(enhancedUrl) ?? enhancedUrl,
    [enhancedUrl],
  );

  // In preview, default to showing the new (enhanced) image; let the user flip
  // to the original with the toggle button.
  const [showOriginal, setShowOriginal] = React.useState(false);

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
        /* Full-frame single image with a toggle to flip between new ↔ old.
           The whole hero is always visible (object-contain, never cropped). */
        <div className="relative aspect-square w-full overflow-hidden bg-gray-50">
          {showOriginal ? (
            originalUrl ? (
              <Image src={originalUrl} alt="Original" fill unoptimized className="object-contain" />
            ) : (
              <Package className="absolute inset-0 m-auto h-6 w-6 text-gray-300" />
            )
          ) : enhancedUrl ? (
            <Image src={displayEnhancedUrl ?? enhancedUrl} alt="Enhanced" fill unoptimized className="object-contain" />
          ) : (
            <Package className="absolute inset-0 m-auto h-6 w-6 text-gray-300" />
          )}

          {/* New ↔ Old toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowOriginal((v) => !v);
            }}
            className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white backdrop-blur transition-colors hover:bg-black/85"
          >
            <ArrowLeftRight className="h-3 w-3" />
            {showOriginal ? "View new" : "View old"}
          </button>

          {/* Label of what's currently shown */}
          <span
            className={cn(
              "absolute bottom-1 left-1 z-10 rounded px-1.5 py-0.5 text-[9px] font-medium text-white",
              showOriginal ? "bg-black/60" : "bg-emerald-600/80",
            )}
          >
            {showOriginal ? "Before (original)" : "After (new hero)"}
          </span>
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
            <Image src={displayEnhancedUrl ?? enhancedUrl} alt={name} fill unoptimized className="object-contain" />
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
          {product.bg_removed && !isApproved && !isRejected && (
            <div className="absolute left-1.5 top-1.5">
              <span className="rounded bg-indigo-600/85 px-1.5 py-0.5 text-[9px] font-medium text-white shadow-sm">
                BG removed
              </span>
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

"use client";

import * as React from "react";
import Image from "next/image";
import {
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  StopCircle,
  Star,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  OptimiseBulkBar,
  OptimiseCenteredState,
  OptimiseList,
  OptimiseLoadingState,
  OptimiseSearchInput,
  OptimiseSegmentedControl,
  OptimiseToolbar,
} from "@/components/optimize/optimize-layout";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard";
import { OptimizerImageReview } from "@/components/optimize/optimizer-image-review";
import {
  buildSpeedSearchQuery,
  CategoryPicker,
  DEFAULT_OPTIMIZER_PRODUCT_LIMIT,
  EmptyCategoryPrompt,
  formatOptimizerProductCount,
  hasSerperImage,
  IMAGE_CONCURRENCY,
  type ImageRun,
  type OptimizerProduct,
  type OptimizerProductLimit,
  type OptimizerProductScope,
  LightboxOverlay,
  OptimizerScopeTabs,
  ProductLimitPicker,
  productLabel,
  toSpeedProduct,
  useLightbox,
  useOptimizerCategories,
  useOptimizerProducts,
  useRejectedProducts,
  emptyImageRun,
  IMG_BUSY,
} from "@/components/optimize/optimizer-shared";
import {
  fetchSerperCandidates,
  runWithConcurrency,
  type SpeedSearchCandidate,
} from "@/lib/admin/image-qa-speed";

type PhotoFilter = "in_progress" | "review" | "done";

function photoStatus(
  p: OptimizerProduct,
  run: ImageRun | undefined,
): "needs" | "review" | "working" | "done" | "error" {
  const img = run ?? emptyImageRun();
  if (IMG_BUSY.includes(img.phase)) return "working";
  if (img.phase === "ready") return "review";
  if (img.phase === "error" || img.phase === "no_results") return "error";
  if (img.phase === "done" || hasSerperImage(p)) return "done";
  return "needs";
}

export function PhotoQueue({ fixedScope }: { fixedScope?: OptimizerProductScope }) {
  const { categories, loadingCats } = useOptimizerCategories();
  const [scope, setScope] = React.useState<OptimizerProductScope>(fixedScope ?? "catalogue");
  const [category, setCategory] = React.useState("");
  const [productLimit, setProductLimit] = React.useState<OptimizerProductLimit>(
    DEFAULT_OPTIMIZER_PRODUCT_LIMIT,
  );
  const { products, setProducts, loading, loadProducts, totalInCategory } =
    useOptimizerProducts(category, productLimit, scope);
  const { rejectedIds, rejectProduct } = useRejectedProducts();
  const { lightbox, setLightbox } = useLightbox();

  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<PhotoFilter>("in_progress");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [runs, setRuns] = React.useState<Record<string, ImageRun>>({});
  const [running, setRunning] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const cancelledRef = React.useRef(false);
  const runsRef = React.useRef(runs);
  const productsRef = React.useRef(products);
  React.useEffect(() => {
    runsRef.current = runs;
  }, [runs]);
  React.useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const onScopeChange = (next: OptimizerProductScope) => {
    setScope(next);
    setCategory("");
    setSelected(new Set());
    setExpanded(new Set());
    setRuns({});
  };

  const onCategoryChange = (cat: string) => {
    setCategory(cat);
    setSelected(new Set());
    setExpanded(new Set());
    setRuns({});
  };

  const onProductLimitChange = (limit: OptimizerProductLimit) => {
    setProductLimit(limit);
    setSelected(new Set());
    setExpanded(new Set());
    setRuns({});
  };

  const patchImg = React.useCallback(
    (id: string, patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) =>
      setRuns((prev) => {
        const cur = prev[id] ?? emptyImageRun();
        const next = typeof patch === "function" ? patch(cur) : patch;
        const updated = { ...prev, [id]: { ...cur, ...next } };
        runsRef.current = updated;
        return updated;
      }),
    [],
  );

  const runImageForProduct = React.useCallback(
    async (product: OptimizerProduct) => {
      const id = product.id;
      if (cancelledRef.current) return;
      if (!product.canonical_product_id) {
        patchImg(id, { phase: "error", error: "No canonical product — sync from Lightspeed first" });
        return;
      }
      const sp = toSpeedProduct(product);
      const label = sp.store_product_name || sp.normalized_name;
      try {
        patchImg(id, { phase: "searching" });
        const searchQuery = buildSpeedSearchQuery(sp);
        const candidates = await fetchSerperCandidates(sp, searchQuery);
        if (cancelledRef.current) return;
        if (candidates.length === 0) {
          patchImg(id, { phase: "no_results", error: "No images found" });
          return;
        }
        patchImg(id, { phase: "selecting", candidates });
        const selRes = await fetch("/api/admin/images/ai-select-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: label,
            brand: sp.manufacturer || undefined,
            upc: sp.upc || undefined,
            candidates,
            maxImages: 6,
          }),
          signal: abortRef.current?.signal,
        });
        const selJson = await selRes.json();
        if (!selRes.ok || !selJson.success || !selJson.primaryUrl) {
          throw new Error(selJson.error || "AI selection failed");
        }
        if (cancelledRef.current) return;
        patchImg(id, {
          phase: "ready",
          selectedCandidates: selJson.selectedCandidates,
          selectedUrls: selJson.selectedUrls,
          primaryUrl: selJson.primaryUrl,
          reasoning: selJson.reasoning,
          error: undefined,
        });
        setExpanded((prev) => new Set([...prev, id]));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        patchImg(id, {
          phase: "error",
          error: err instanceof Error ? err.message : "Image step failed",
        });
      }
    },
    [patchImg],
  );

  const approveImages = React.useCallback(
    async (id: string) => {
      const product = productsRef.current.find((p) => p.id === id);
      const run = runsRef.current[id];
      if (!product || !run) return;
      const img = run;
      if (img.phase !== "ready" || !img.primaryUrl || img.selectedCandidates.length === 0) return;
      if (!product.canonical_product_id) {
        patchImg(id, { phase: "error", error: "No canonical product — sync from Lightspeed first" });
        return;
      }
      patchImg(id, { phase: "saving", error: undefined });
      try {
        const res = await fetch("/api/admin/images/approve-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonicalProductId: product.canonical_product_id,
            selectedCandidates: img.selectedCandidates,
            primaryCandidateUrl: img.primaryUrl,
            searchQuery: buildSpeedSearchQuery(toSpeedProduct(product)),
            rejectPending: true,
            quickMode: true,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to save images");
        const primaryUrl = img.primaryUrl;
        patchImg(id, { phase: "done", savedCount: (json.savedImageIds || img.selectedUrls).length });
        setProducts((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  resolved_image_url: primaryUrl,
                  canonical_images: img.selectedCandidates.map((c, i) => ({
                    id: `new-${i}`,
                    cloudinary_public_id: null,
                    cloudinary_url: null,
                    external_url: c.url,
                    is_primary: c.url === primaryUrl,
                    approval_status: "approved",
                    sort_order: i,
                    source: "serper_workbench",
                  })),
                }
              : p,
          ),
        );
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (err) {
        patchImg(id, {
          phase: "ready",
          error: err instanceof Error ? err.message : "Failed to save images",
        });
      }
    },
    [patchImg, setProducts],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (rejectedIds.has(p.id)) return false;
      if (q) {
        const match =
          productLabel(p).toLowerCase().includes(q) ||
          (p.brand || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      const status = photoStatus(p, runs[p.id]);
      if (filter === "in_progress") return status !== "done";
      if (filter === "review") return status === "review";
      if (filter === "done") return status === "done";
      return true;
    });
  }, [products, search, rejectedIds, runs, filter]);

  const visible = filtered;

  const counts = React.useMemo(() => {
    const active = products.filter((p) => !rejectedIds.has(p.id));
    return {
      inProgress: active.filter((p) => photoStatus(p, runs[p.id]) !== "done").length,
      review: active.filter((p) => photoStatus(p, runs[p.id]) === "review").length,
      done: active.filter((p) => photoStatus(p, runs[p.id]) === "done").length,
    };
  }, [products, rejectedIds, runs]);

  const readyCount = Object.values(runs).filter((r) => r.phase === "ready").length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = visible.filter((p) => {
      const s = photoStatus(p, runs[p.id]);
      return s === "needs" || s === "error";
    });
    if (selectable.every((p) => selected.has(p.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((p) => p.id)));
    }
  };

  const handleFindPhotos = async () => {
    const targets = visible.filter((p) => selected.has(p.id) && photoStatus(p, runs[p.id]) === "needs");
    if (targets.length === 0) return;
    setRunning(true);
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    for (const p of targets) patchImg(p.id, { ...emptyImageRun(), phase: "queued" });
    const tasks = targets.map((p) => () => runImageForProduct(p));
    await runWithConcurrency(tasks, IMAGE_CONCURRENCY);
    setRunning(false);
    abortRef.current = null;

    const readyIds = Object.entries(runsRef.current)
      .filter(([, r]) => r.phase === "ready")
      .map(([id]) => id);
    if (readyIds.length > 0) {
      setFilter("review");
      setExpanded((prev) => new Set([...prev, ...readyIds]));
    }
  };

  const handleApproveReady = async () => {
    const ids = Object.entries(runs)
      .filter(([, r]) => r.phase === "ready")
      .map(([id]) => id);
    const tasks = ids.map((id) => () => approveImages(id));
    await runWithConcurrency(tasks, IMAGE_CONCURRENCY);
  };

  const handleStop = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setRunning(false);
  };

  const runSingleImage = async (p: OptimizerProduct) => {
    setRunning(true);
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    try {
      await runImageForProduct(p);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const setPrimary = (id: string, url: string) =>
    patchImg(id, (prev) =>
      prev.phase === "ready" && prev.selectedUrls.includes(url) ? { primaryUrl: url } : {},
    );

  const removeImage = (id: string, url: string) =>
    patchImg(id, (prev) => {
      if (prev.phase !== "ready" || prev.selectedUrls.length <= 1) return {};
      const selectedUrls = prev.selectedUrls.filter((u) => u !== url);
      const selectedCandidates = prev.selectedCandidates.filter((c) => c.url !== url);
      const primaryUrl = prev.primaryUrl === url ? selectedUrls[0] ?? null : prev.primaryUrl;
      return { selectedUrls, selectedCandidates, primaryUrl };
    });

  const addCandidate = (id: string, candidate: SpeedSearchCandidate) =>
    patchImg(id, (prev) => {
      if (prev.phase !== "ready" || prev.selectedUrls.includes(candidate.url)) return {};
      if (prev.selectedUrls.length >= 6) return {};
      return {
        selectedUrls: [...prev.selectedUrls, candidate.url],
        selectedCandidates: [...prev.selectedCandidates, candidate],
        primaryUrl: prev.primaryUrl ?? candidate.url,
      };
    });

  const reloadCandidates = async (id: string) => {
    const product = productsRef.current.find((p) => p.id === id);
    if (!product) return;
    patchImg(id, { reloading: true });
    try {
      const sp = toSpeedProduct(product);
      const fresh = await fetchSerperCandidates(sp, buildSpeedSearchQuery(sp));
      patchImg(id, (prev) => {
        const existing = new Set(prev.candidates.map((c) => c.url));
        return {
          candidates: [...prev.candidates, ...fresh.filter((c) => !existing.has(c.url))],
          showAdditional: true,
          reloading: false,
        };
      });
    } catch {
      patchImg(id, { reloading: false });
    }
  };

  const toggleAdditional = (id: string) =>
    patchImg(id, (prev) => {
      if (prev.showAdditional) return { showAdditional: false };
      if (prev.candidates.length <= prev.selectedUrls.length) {
        void reloadCandidates(id);
        return {};
      }
      return { showAdditional: true };
    });

  const enhanceImage = async (id: string, url: string) => {
    const product = productsRef.current.find((p) => p.id === id);
    if (!product?.canonical_product_id) return;
    patchImg(id, (prev) => ({ enhancingUrls: [...(prev.enhancingUrls ?? []), url] }));
    try {
      const res = await fetch("/api/admin/images/enhance-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, canonicalProductId: product.canonical_product_id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.url) throw new Error();
      const enhancedUrl: string = json.url;
      patchImg(id, (prev) => ({
        selectedUrls: prev.selectedUrls.map((u) => (u === url ? enhancedUrl : u)),
        selectedCandidates: prev.selectedCandidates.map((c) =>
          c.url === url ? { ...c, url: enhancedUrl, thumbnailUrl: json.thumbnailUrl ?? enhancedUrl } : c,
        ),
        primaryUrl: prev.primaryUrl === url ? enhancedUrl : prev.primaryUrl,
        enhancedUrls: { ...(prev.enhancedUrls ?? {}), [url]: enhancedUrl },
        enhancingUrls: (prev.enhancingUrls ?? []).filter((u) => u !== url),
      }));
    } catch {
      patchImg(id, (prev) => ({
        enhancingUrls: (prev.enhancingUrls ?? []).filter((u) => u !== url),
      }));
    }
  };

  const showScopeTabs = !fixedScope;

  if (scope === "catalogue" && !category) {
    if (loadingCats) {
      return (
        <div className="space-y-6">
          {showScopeTabs && <OptimizerScopeTabs scope={scope} onChange={onScopeChange} />}
          <OptimiseLoadingState label="Loading categories…" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {showScopeTabs && <OptimizerScopeTabs scope={scope} onChange={onScopeChange} />}
        <EmptyCategoryPrompt
          loadingCats={loadingCats}
          category={category}
          categories={categories}
          onChange={onCategoryChange}
          title="Photos for your catalogue"
          description="Choose a category to find products that need photos, review AI picks, and approve them for your store."
        />
      </div>
    );
  }

  const categoryMeta = categories.find((c) => c.id === category);
  const showCataloguePicker = scope === "catalogue";

  return (
    <div>
      <OptimiseToolbar>
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          {showScopeTabs && (
            <OptimizerScopeTabs scope={scope} disabled={running} onChange={onScopeChange} />
          )}
          {showCataloguePicker ? (
            <CategoryPicker
              category={category}
              categories={categories}
              loadingCats={loadingCats}
              disabled={running}
              onChange={onCategoryChange}
              className="h-9 w-full rounded-md sm:w-[min(100%,280px)]"
            />
          ) : (
            <span className="text-sm text-muted-foreground shrink-0">
              {scope === "private_listing"
                ? "Private listings"
                : "Manual / CSV·image imports"}
            </span>
          )}
          <ProductLimitPicker
            limit={productLimit}
            disabled={running || loading}
            onChange={onProductLimitChange}
          />
          {!loading && products.length > 0 ? (
            <span className="text-sm text-muted-foreground tabular-nums shrink-0">
              {formatOptimizerProductCount(products.length, totalInCategory)}
            </span>
          ) : (scope === "csv_image" || scope === "private_listing") && totalInCategory != null ? (
            <span className="text-sm text-muted-foreground tabular-nums shrink-0">
              {totalInCategory}{" "}
              {scope === "private_listing" ? "private" : "manual"} listing
              {totalInCategory === 1 ? "" : "s"}
            </span>
          ) : categoryMeta && category !== "all" ? (
            <span className="text-sm text-muted-foreground tabular-nums shrink-0">
              {categoryMeta.count} in category
            </span>
          ) : null}
          <OptimiseSegmentedControl
            value={filter}
            onChange={setFilter}
            items={[
              { id: "in_progress" as const, label: "In progress", count: counts.inProgress },
              { id: "review" as const, label: "Review", count: counts.review },
              { id: "done" as const, label: "On store", count: counts.done },
            ]}
          />
        </div>
        <OptimiseSearchInput value={search} onChange={setSearch} />
      </OptimiseToolbar>

      {(scope === "csv_image" || scope === "private_listing" || category) && !loading && (
        <OptimiseBulkBar>
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox
              checked={
                visible.length > 0 &&
                visible
                  .filter((p) => photoStatus(p, runs[p.id]) === "needs")
                  .every((p) => selected.has(p.id))
              }
              onCheckedChange={toggleSelectAll}
              disabled={running || visible.length === 0}
              aria-label="Select all needing photos"
            />
            <span className="text-sm text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : "Select products to find photos"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || running}
              onClick={() => void loadProducts(category, productLimit, scope)}
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </Button>
            {readyCount > 0 && !running && (
              <Button variant="outline" size="sm" onClick={() => void handleApproveReady()}>
                <CheckCircle2 className="size-4" />
                Approve {readyCount} ready
              </Button>
            )}
            {running ? (
              <Button variant="outline" size="sm" onClick={handleStop}>
                <StopCircle className="size-4" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={selected.size === 0}
                onClick={() => void handleFindPhotos()}
              >
                <Sparkles className="size-4" />
                Find photos
                {selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
            )}
          </div>
        </OptimiseBulkBar>
      )}

      {loading ? (
        <OptimiseLoadingState />
      ) : products.length === 0 && (scope === "csv_image" || scope === "private_listing") ? (
        <OptimiseCenteredState>
          <StatusBadge
            label={
              scope === "private_listing"
                ? "No private listings yet"
                : "No CSV/Image products yet"
            }
            tone="neutral"
          />
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            {scope === "private_listing"
              ? "Create private listings in Products first, then return here to add photos."
              : "Import a CSV and create listings first. They will appear here as manual products ready for photos."}
          </p>
        </OptimiseCenteredState>
      ) : visible.length === 0 ? (
        <OptimiseCenteredState>
          <StatusBadge
            label={filter === "done" ? "No products on store yet" : "All caught up"}
            tone="success"
          />
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            {filter === "in_progress"
              ? scope === "csv_image"
                ? "Every CSV/Image import in this batch has a store photo, or check the Review tab."
                : scope === "private_listing"
                  ? "Every private listing in this batch has a store photo, or check the Review tab."
                  : "Every product in this category has a store photo, or check the Review tab."
              : filter === "review"
                ? "Run Find photos first — products ready for approval appear here."
                : "Nothing in this view."}
          </p>
        </OptimiseCenteredState>
      ) : (
        <OptimiseList>
          {visible.map((p) => {
            const run = runs[p.id] ?? emptyImageRun();
            const status = photoStatus(p, run);
            const name = productLabel(p);
            const isOpen = expanded.has(p.id);
            const thumb = run.primaryUrl || p.resolved_image_url || p.primary_image_url;
            const showReviewPanel =
              status === "review" ||
              (isOpen && (status === "working" || status === "error" || run.phase === "done"));

            return (
              <div key={p.id}>
                <div className="flex items-start gap-3 py-3">
                  {status === "needs" || status === "error" ? (
                    <Checkbox
                      className="mt-2"
                      checked={selected.has(p.id)}
                      disabled={running}
                      onCheckedChange={() => toggleSelect(p.id)}
                      aria-label={`Select ${name}`}
                    />
                  ) : (
                    <div className="mt-2 w-4" />
                  )}

                  <div
                    className="relative size-16 shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-muted"
                    onClick={() => thumb && setLightbox(thumb)}
                  >
                    {thumb ? (
                      <Image src={thumb} alt="" fill unoptimized className="object-cover" sizes="64px" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Package className="size-6 text-muted-foreground/30" />
                      </div>
                    )}
                    {status === "done" && (
                      <div className="absolute bottom-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-500">
                        <Check className="size-3 text-white" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={cn(
                          "text-sm font-semibold truncate max-w-full",
                          status === "working"
                            ? "text-optimise-finding-shimmer"
                            : "text-foreground",
                        )}
                      >
                        {name}
                      </p>
                      {status === "needs" && <StatusBadge label="Needs photo" tone="danger" />}
                      {status === "review" && <StatusBadge label="Review" tone="warning" />}
                      {status === "done" && <StatusBadge label="On store" tone="success" />}
                      {status === "error" && <StatusBadge label="Failed" tone="danger" />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.brand || "—"} · ${Number(p.price).toFixed(2)}
                    </p>
                    {status === "needs" && !running && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={() => void runSingleImage(p)}
                      >
                        <ImageIcon className="size-3.5" />
                        Find photos
                      </Button>
                    )}
                  </div>

                  <button
                    type="button"
                    title="Exclude from queue"
                    disabled={running}
                    onClick={() => void rejectProduct(p.id)}
                    className="rounded-md p-1 text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Ban className="size-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  >
                    {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                </div>

                {showReviewPanel && (
                  <div className="border-t border-border/60 bg-muted/20 py-4">
                    <OptimizerImageReview
                      img={run}
                      hasCanonical={!!p.canonical_product_id}
                      saving={run.phase === "saving"}
                      onSetPrimary={(url) => setPrimary(p.id, url)}
                      onRemove={(url) => removeImage(p.id, url)}
                      onAdd={(c) => addCandidate(p.id, c)}
                      onEnhance={(url) => void enhanceImage(p.id, url)}
                      onToggleAdditional={() => toggleAdditional(p.id)}
                      onApprove={() => void approveImages(p.id)}
                      onLightbox={setLightbox}
                    />
                  </div>
                )}

                {isOpen && status === "done" && p.canonical_images.length > 0 && (
                  <div className="border-t border-border/60 bg-muted/20 py-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {p.canonical_images.length} approved photo{p.canonical_images.length === 1 ? "" : "s"}
                    </p>
                    <div className="grid grid-cols-6 gap-2">
                      {p.canonical_images.map((ci) => {
                        const url = ci.cloudinary_url || ci.external_url;
                        if (!url) return null;
                        return (
                          <div
                            key={ci.id}
                            className={cn(
                              "relative aspect-square overflow-hidden rounded-md border bg-muted",
                              ci.is_primary && "ring-2 ring-primary",
                            )}
                          >
                            <Image src={url} alt="" fill unoptimized className="object-cover" />
                            {ci.is_primary && (
                              <Star className="absolute left-1 top-1 size-3 fill-primary text-primary" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 text-xs"
                      disabled={running}
                      onClick={() => void runSingleImage(p)}
                    >
                      <Search className="size-3.5" />
                      Replace photos
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </OptimiseList>
      )}

      <LightboxOverlay url={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

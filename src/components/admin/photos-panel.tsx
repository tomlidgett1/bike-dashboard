"use client";

/**
 * Photos Panel
 *
 * Standalone tab for managing every image attached to a canonical product.
 * The user searches for a product, selects it, then can:
 *   - View all on-file images (approved + pending)
 *   - Set any approved image as the primary
 *   - Delete any approved image
 *   - Find more images via Serper and approve them
 */

import * as React from "react";
import Image from "next/image";
import {
  CheckCircle2,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhotosProduct {
  id: string;
  normalized_name: string;
  display_name: string | null;
  upc: string | null;
  manufacturer: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  primary_image_url: string | null;
  primary_image_id: string | null;
  approved_images: number;
  pending_images: number;
  linked_products: number;
}

interface ImageRow {
  id: string;
  is_primary: boolean | null;
  source: string | null;
  approval_status: string;
  display_url: string | null;
  cloudinary_url: string | null;
  external_url: string | null;
  sort_order: number | null;
}

interface SearchCandidate {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  source?: string;
  domain?: string;
  width?: number;
  height?: number;
}

interface Props {
  onSessionMessage: (message: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PhotosPanel({ onSessionMessage }: Props) {
  // ── Product list ──────────────────────────────────────────────────────────
  const [products, setProducts] = React.useState<PhotosProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = React.useState(false);
  const [productSearch, setProductSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);

  // ── Selected product ──────────────────────────────────────────────────────
  const [selected, setSelected] = React.useState<PhotosProduct | null>(null);

  // ── On-file images ────────────────────────────────────────────────────────
  const [images, setImages] = React.useState<ImageRow[]>([]);
  const [loadingImages, setLoadingImages] = React.useState(false);

  // ── Serper search ─────────────────────────────────────────────────────────
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [candidates, setCandidates] = React.useState<SearchCandidate[]>([]);
  const [selectedUrls, setSelectedUrls] = React.useState<Set<string>>(new Set());
  const [primaryUrl, setPrimaryUrl] = React.useState<string | null>(null);

  // ── Saving / mutating ─────────────────────────────────────────────────────
  const [saving, setSaving] = React.useState(false);

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchProducts = React.useCallback(async (nextPage = 1, searchOverride?: string) => {
    setLoadingProducts(true);
    const search = searchOverride !== undefined ? searchOverride : productSearch;
    const params = new URLSearchParams({ page: String(nextPage), limit: "50", status: "needs_work" });
    if (search.trim()) params.set("search", search.trim());
    // Show all statuses so the user can manage any product
    params.delete("status");

    try {
      const res = await fetch(`/api/admin/images/products?${params}`);
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Failed to fetch products");
      setProducts(result.data || []);
      setPage(result.pagination?.page || nextPage);
      setTotalPages(result.pagination?.total_pages || 1);
    } catch (err) {
      onSessionMessage(err instanceof Error ? err.message : "Failed to fetch products");
    } finally {
      setLoadingProducts(false);
    }
  }, [productSearch, onSessionMessage]);

  const fetchImages = React.useCallback(async (canonicalId: string) => {
    setLoadingImages(true);
    setImages([]);
    try {
      const res = await fetch(`/api/admin/images/workbench-assets?canonicalProductId=${encodeURIComponent(canonicalId)}`);
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Failed to load images");
      setImages(result.data || []);
    } catch (err) {
      onSessionMessage(err instanceof Error ? err.message : "Failed to load images");
    } finally {
      setLoadingImages(false);
    }
  }, [onSessionMessage]);

  // ── Initial load ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    void fetchProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load images when a product is selected ────────────────────────────────
  React.useEffect(() => {
    if (selected) {
      void fetchImages(selected.id);
      setCandidates([]);
      setSelectedUrls(new Set());
      setPrimaryUrl(null);
      setQuery(
        [selected.manufacturer, selected.display_name || selected.normalized_name, selected.marketplace_subcategory, "cycling product image"]
          .filter(Boolean)
          .join(" ")
      );
    } else {
      setImages([]);
    }
  }, [fetchImages, selected]);

  // ── Mutation handlers ─────────────────────────────────────────────────────

  const handleSetPrimary = async (imageId: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/images/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: selected.id, imageId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Failed to set primary");
      onSessionMessage("Primary image updated.");
      await fetchImages(selected.id);
    } catch (err) {
      onSessionMessage(err instanceof Error ? err.message : "Failed to set primary");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/images/remove-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: selected.id, imageId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Failed to remove image");
      onSessionMessage(result.remainingCount === 0 ? "All approved images removed." : "Image removed.");
      await fetchImages(selected.id);
      // Refresh the product list so counts stay current
      void fetchProducts(page);
    } catch (err) {
      onSessionMessage(err instanceof Error ? err.message : "Failed to remove image");
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = async () => {
    if (!selected || !query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch("/api/admin/ecommerce-hero/search-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchQuery: query.trim(), productName: selected.normalized_name, brand: selected.manufacturer }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Search failed");
      const results: SearchCandidate[] = result.results || [];
      setCandidates(results);
      setSelectedUrls(new Set(results.slice(0, 1).map((c) => c.url)));
      setPrimaryUrl(results[0]?.url ?? null);
    } catch (err) {
      onSessionMessage(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const toggleCandidate = (candidate: SearchCandidate) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(candidate.url)) {
        next.delete(candidate.url);
        if (primaryUrl === candidate.url) setPrimaryUrl(next.values().next().value ?? null);
      } else {
        next.add(candidate.url);
        if (!primaryUrl) setPrimaryUrl(candidate.url);
      }
      return next;
    });
  };

  const handleApprove = async () => {
    if (!selected || selectedUrls.size === 0) return;
    setSaving(true);
    const selectedCandidates = candidates.filter((c) => selectedUrls.has(c.url));
    const effectivePrimary = primaryUrl ?? selectedCandidates[0]?.url ?? null;
    try {
      const res = await fetch("/api/admin/images/approve-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalProductId: selected.id,
          selectedCandidates,
          primaryCandidateUrl: effectivePrimary,
          searchQuery: query,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Failed to approve images");
      onSessionMessage(`Approved ${selectedCandidates.length} image${selectedCandidates.length === 1 ? "" : "s"}.`);
      setCandidates([]);
      setSelectedUrls(new Set());
      setPrimaryUrl(null);
      await fetchImages(selected.id);
      void fetchProducts(page);
    } catch (err) {
      onSessionMessage(err instanceof Error ? err.message : "Failed to approve images");
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const approvedImages = images.filter((i) => i.approval_status === "approved");
  const pendingImages = images.filter((i) => i.approval_status === "pending");

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-[70vh] gap-0 rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* ── Left: product list ─────────────────────────────────────────── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-gray-200 xl:w-72">
        {/* Search bar */}
        <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2.5">
          <Input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void fetchProducts(1);
            }}
            placeholder="Search products…"
            className="h-8 flex-1 rounded-md text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-md px-2"
            onClick={() => void fetchProducts(1)}
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-md px-2"
            onClick={() => void fetchProducts(page)}
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto">
          {loadingProducts ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading
            </div>
          ) : products.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No products found.</p>
          ) : (
            <div className="space-y-0 divide-y divide-gray-100">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelected(product)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                    selected?.id === product.id
                      ? "bg-gray-50"
                      : "hover:bg-gray-50",
                  )}
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {product.primary_image_url ? (
                      <Image src={product.primary_image_url} alt="" fill unoptimized className="object-cover" />
                    ) : (
                      <Package className="m-2.5 h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "truncate text-xs font-medium",
                      selected?.id === product.id ? "text-gray-900" : "text-gray-700",
                    )}>
                      {product.display_name || product.normalized_name}
                    </p>
                    <p className="truncate text-[10px] text-gray-400">{product.manufacturer || "—"}</p>
                    <div className="mt-0.5 flex gap-1">
                      <span className="text-[10px] text-gray-500">{product.approved_images}✓</span>
                      {product.pending_images > 0 && (
                        <span className="text-[10px] text-gray-400">{product.pending_images} pend</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            disabled={page <= 1 || loadingProducts}
            onClick={() => fetchProducts(page - 1)}
          >
            Prev
          </Button>
          <span className="text-[10px] text-gray-500">{page} / {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            disabled={page >= totalPages || loadingProducts}
            onClick={() => fetchProducts(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* ── Right: photo editor ────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
        {!selected ? (
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-400">
            Select a product on the left to manage its photos.
          </div>
        ) : (
          <div className="space-y-7">
            {/* Header */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {selected.display_name || selected.normalized_name}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {selected.upc ? `UPC ${selected.upc} · ` : ""}
                  {selected.manufacturer || "Unknown brand"}
                  {selected.linked_products ? ` · ${selected.linked_products} listing${selected.linked_products === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <span className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  selected.primary_image_id ? "border-gray-200 text-gray-600" : "border-amber-200 bg-amber-50 text-amber-700",
                )}>
                  {selected.primary_image_id ? "Has primary" : "Needs primary"}
                </span>
              </div>
            </div>

            {/* ── On-file images ──────────────────────────────────────── */}
            <section>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-800">On-file images</h3>
                  <p className="mt-0.5 text-xs text-gray-500">Approved and pending images for this product.</p>
                </div>
                {loadingImages ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                ) : (
                  <span className="text-xs text-gray-400">{images.length} total</span>
                )}
              </div>

              {loadingImages && (
                <div className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading images…
                </div>
              )}

              {!loadingImages && images.length === 0 && (
                <div className="rounded-md border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  No images yet. Use Serper below to find and add images.
                </div>
              )}

              {!loadingImages && approvedImages.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-gray-600">Approved</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {approvedImages.map((image) => {
                      const src = image.display_url || image.cloudinary_url || image.external_url || "";
                      const isPrimary = Boolean(image.is_primary);
                      return (
                        <div
                          key={image.id}
                          className={cn(
                            "overflow-hidden rounded-md border bg-white shadow-sm",
                            isPrimary ? "border-gray-900" : "border-gray-200",
                          )}
                        >
                          <div className="relative aspect-square w-full bg-gray-100">
                            {src ? (
                              <Image src={src} alt="" fill unoptimized className="object-contain p-1" />
                            ) : (
                              <Package className="absolute inset-0 m-auto h-8 w-8 text-gray-300" />
                            )}
                            {isPrimary && (
                              <span className="absolute left-1.5 top-1.5 rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1.5 p-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={saving || isPrimary}
                              onClick={() => void handleSetPrimary(image.id)}
                              className="h-7 flex-1 rounded-md px-1 text-[11px]"
                              title={isPrimary ? "Already primary" : "Set as primary"}
                            >
                              <Star className={cn("mr-1 h-3 w-3", isPrimary && "fill-gray-900")} />
                              {isPrimary ? "Primary" : "Set primary"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={saving}
                              onClick={() => void handleDelete(image.id)}
                              className="h-7 w-7 rounded-md p-0 text-gray-500 hover:text-red-600"
                              aria-label="Delete image"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!loadingImages && pendingImages.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">Pending (not yet approved)</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 opacity-60">
                    {pendingImages.map((image) => {
                      const src = image.display_url || image.cloudinary_url || image.external_url || "";
                      return (
                        <div key={image.id} className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
                          <div className="relative aspect-square w-full bg-gray-100">
                            {src ? (
                              <Image src={src} alt="" fill unoptimized className="object-contain p-1" />
                            ) : (
                              <Package className="absolute inset-0 m-auto h-8 w-8 text-gray-300" />
                            )}
                          </div>
                          <div className="p-1.5">
                            <span className="text-[10px] text-gray-400">Pending</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* ── Serper search ────────────────────────────────────────── */}
            <section>
              <h3 className="mb-2 text-sm font-medium text-gray-800">Find more images</h3>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
                    placeholder="Search query"
                    className="h-9 flex-1 rounded-md bg-white text-sm"
                  />
                  <Button
                    onClick={() => void handleSearch()}
                    disabled={searching || !query.trim()}
                    className="h-9 shrink-0 rounded-md"
                  >
                    {searching ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="mr-2 h-4 w-4" />
                    )}
                    Search
                  </Button>
                </div>
              </div>
            </section>

            {/* ── Serper results ───────────────────────────────────────── */}
            {candidates.length > 0 && (
              <section>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-800">Search results</h3>
                    <p className="text-xs text-gray-500">
                      {selectedUrls.size === 0
                        ? "Click images to select, then approve."
                        : `${selectedUrls.size} selected${primaryUrl ? " · 1 set as primary" : " · tap ★ to set primary"}`}
                    </p>
                  </div>
                  <Button
                    onClick={() => void handleApprove()}
                    disabled={saving || selectedUrls.size === 0}
                    className="h-9 shrink-0 rounded-md"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Approve {selectedUrls.size > 0 ? selectedUrls.size : ""} selected
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {candidates.map((candidate) => {
                    const isSelected = selectedUrls.has(candidate.url);
                    const isPrimary = primaryUrl === candidate.url;
                    return (
                      <div
                        key={candidate.url}
                        className={cn(
                          "overflow-hidden rounded-md border bg-white shadow-sm transition-all",
                          isSelected ? "border-gray-900" : "border-gray-200",
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
                          {isSelected && (
                            <CheckCircle2 className="absolute right-1.5 top-1.5 h-5 w-5 rounded-full bg-white text-gray-900 shadow" />
                          )}
                          {isPrimary && (
                            <span className="absolute left-1.5 top-1.5 rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              Primary
                            </span>
                          )}
                        </button>
                        <div className="space-y-1.5 p-2">
                          {candidate.title && (
                            <p className="line-clamp-1 text-[10px] text-gray-500">{candidate.title}</p>
                          )}
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant={isSelected ? "default" : "outline"}
                              onClick={() => toggleCandidate(candidate)}
                              className="h-7 flex-1 rounded-md px-1 text-[11px]"
                            >
                              {isSelected ? (
                                <><X className="mr-1 h-3 w-3" /> Deselect</>
                              ) : (
                                <><CheckCircle2 className="mr-1 h-3 w-3" /> Select</>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant={isPrimary ? "default" : "outline"}
                              onClick={() => {
                                setPrimaryUrl(candidate.url);
                                setSelectedUrls((prev) => new Set(prev).add(candidate.url));
                              }}
                              className="h-7 w-7 shrink-0 rounded-md p-0"
                              title="Set as primary"
                            >
                              <Star className={cn("h-3 w-3", isPrimary && "fill-current")} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import Image from "next/image";
import {
  Search,
  Loader2,
  CheckCircle2,
  Star,
  RefreshCw,
  Package,
  X,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ImageQaSpeedPanel } from "@/components/admin/image-qa-speed-panel";

type WorkbenchStatus = "needs_work" | "missing" | "pending" | "needs_primary" | "ready" | "failed";

interface WorkbenchProduct {
  id: string;
  normalized_name: string;
  display_name: string | null;
  upc: string | null;
  category: string | null;
  manufacturer: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  marketplace_level_3_category: string | null;
  image_review_status: string | null;
  image_review_search_query: string | null;
  total_images: number;
  pending_images: number;
  approved_images: number;
  rejected_images: number;
  primary_image_id: string | null;
  primary_image_url: string | null;
  linked_products: number;
  ready_products: number;
  readiness_status: string;
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

interface WorkbenchImageRow {
  id: string;
  is_primary: boolean | null;
  source: string | null;
  approval_status: string;
  display_url: string | null;
  cloudinary_url: string | null;
  external_url: string | null;
  sort_order: number | null;
}

const statusOptions: Array<{ value: WorkbenchStatus; label: string }> = [
  { value: "needs_work", label: "Needs work" },
  { value: "missing", label: "Missing images" },
  { value: "pending", label: "Pending candidates" },
  { value: "needs_primary", label: "Needs primary" },
  { value: "ready", label: "Complete" },
  { value: "failed", label: "Failed" },
];

function buildDefaultQuery(product: WorkbenchProduct) {
  return [
    product.upc,
    product.manufacturer,
    product.display_name || product.normalized_name,
    product.marketplace_subcategory || product.category,
    "cycling product image",
  ]
    .filter(Boolean)
    .join(" ");
}

type WorkbenchMode = "workbench" | "rapid";

export default function ImageQAPage() {
  const [mode, setMode] = React.useState<WorkbenchMode>("rapid");
  const [products, setProducts] = React.useState<WorkbenchProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = React.useState<WorkbenchProduct | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [status, setStatus] = React.useState<WorkbenchStatus>("needs_work");
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [subcategory, setSubcategory] = React.useState("all");
  const [manufacturer, setManufacturer] = React.useState("all");
  const [candidates, setCandidates] = React.useState<SearchCandidate[]>([]);
  const [selectedUrls, setSelectedUrls] = React.useState<Set<string>>(new Set());
  const [primaryUrl, setPrimaryUrl] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [workbenchImages, setWorkbenchImages] = React.useState<WorkbenchImageRow[]>([]);
  const [loadingWorkbench, setLoadingWorkbench] = React.useState(false);
  const [enhancingImageId, setEnhancingImageId] = React.useState<string | null>(null);

  const categories = React.useMemo(() => Array.from(new Set(products.map((p) => p.marketplace_category).filter(Boolean))) as string[], [products]);
  const subcategories = React.useMemo(() => Array.from(new Set(products.map((p) => p.marketplace_subcategory).filter(Boolean))) as string[], [products]);
  const manufacturers = React.useMemo(() => Array.from(new Set(products.map((p) => p.manufacturer).filter(Boolean))) as string[], [products]);

  const defaultStudioHeroImageId = React.useMemo(() => {
    const usableUrl = (i: WorkbenchImageRow) =>
      Boolean(i.display_url || i.cloudinary_url || i.external_url);
    const primary = workbenchImages.find((i) => i.is_primary && usableUrl(i));
    if (primary) return primary.id;
    const approved = workbenchImages.find((i) => i.approval_status === "approved" && usableUrl(i));
    if (approved) return approved.id;
    const pending = workbenchImages.find((i) => i.approval_status === "pending" && usableUrl(i));
    return pending?.id ?? null;
  }, [workbenchImages]);

  const fetchProducts = React.useCallback(async (nextPage = page) => {
    setLoading(true);

    const params = new URLSearchParams({
      page: String(nextPage),
      limit: "24",
      status,
    });

    if (search.trim()) params.set("search", search.trim());
    if (category !== "all") params.set("category", category);
    if (subcategory !== "all") params.set("subcategory", subcategory);
    if (manufacturer !== "all") params.set("manufacturer", manufacturer);

    try {
      const response = await fetch(`/api/admin/images/products?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Failed to fetch products");

      setProducts(result.data || []);
      setPage(result.pagination?.page || nextPage);
      setTotalPages(result.pagination?.total_pages || 1);
      setSelectedProduct((current) => {
        if (!current) return result.data?.[0] || null;
        return result.data?.find((product: WorkbenchProduct) => product.id === current.id) || result.data?.[0] || null;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to fetch products");
    } finally {
      setLoading(false);
    }
  }, [category, manufacturer, page, search, status, subcategory]);

  const fetchWorkbenchImages = React.useCallback(async (canonicalId: string) => {
    setLoadingWorkbench(true);
    try {
      const response = await fetch(
        `/api/admin/images/workbench-assets?canonicalProductId=${encodeURIComponent(canonicalId)}`,
      );
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Failed to load product images");
      setWorkbenchImages(result.data || []);
    } catch {
      setWorkbenchImages([]);
    } finally {
      setLoadingWorkbench(false);
    }
  }, []);

  React.useEffect(() => {
    setMessage(null);
    fetchProducts(1);
    // The batch filters above intentionally drive this refresh; fetchProducts also
    // carries pagination/search state for manual searches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, subcategory, manufacturer]);

  React.useEffect(() => {
    if (selectedProduct) {
      setQuery(selectedProduct.image_review_search_query || buildDefaultQuery(selectedProduct));
      setCandidates([]);
      setSelectedUrls(new Set());
      setPrimaryUrl(null);
      void fetchWorkbenchImages(selectedProduct.id);
    } else {
      setWorkbenchImages([]);
    }
  }, [fetchWorkbenchImages, selectedProduct]);

  const removeApprovedImage = async (imageId: string) => {
    if (!selectedProduct) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/images/remove-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: selectedProduct.id, imageId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Failed to remove image");
      setMessage(result.remainingCount === 0 ? "All approved images removed; product is back to pending." : "Image removed.");
      await fetchWorkbenchImages(selectedProduct.id);
      await fetchProducts(page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to remove image");
    } finally {
      setSaving(false);
    }
  };

  const runStudioHero = async (imageId: string) => {
    if (!selectedProduct) return;
    setEnhancingImageId(imageId);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/images/studio-hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalProductId: selectedProduct.id,
          imageId,
          makePrimary: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Background treatment failed");
      }
      setMessage("Studio hero image created and set as primary.");
      await fetchWorkbenchImages(selectedProduct.id);
      await fetchProducts(page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Background treatment failed");
    } finally {
      setEnhancingImageId(null);
    }
  };

  const setApprovedPrimary = async (imageId: string) => {
    if (!selectedProduct) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/images/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: selectedProduct.id, imageId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Failed to set primary");
      setMessage("Primary image updated.");
      await fetchWorkbenchImages(selectedProduct.id);
      await fetchProducts(page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to set primary");
    } finally {
      setSaving(false);
    }
  };

  const runSearch = async () => {
    if (!selectedProduct || !query.trim()) return;
    setSearching(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/ecommerce-hero/search-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchQuery: query.trim(), productName: selectedProduct.normalized_name, brand: selectedProduct.manufacturer }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Serper search failed");

      const results = result.results || [];
      setCandidates(results);
      setSelectedUrls(new Set(results.slice(0, 1).map((candidate: SearchCandidate) => candidate.url)));
      setPrimaryUrl(results[0]?.url || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Serper search failed");
    } finally {
      setSearching(false);
    }
  };

  const toggleCandidate = (candidate: SearchCandidate) => {
    setSelectedUrls((current) => {
      const next = new Set(current);
      if (next.has(candidate.url)) {
        next.delete(candidate.url);
        if (primaryUrl === candidate.url) setPrimaryUrl(next.values().next().value || null);
      } else {
        next.add(candidate.url);
        if (!primaryUrl) setPrimaryUrl(candidate.url);
      }
      return next;
    });
  };

  const approveSelection = async () => {
    if (!selectedProduct || selectedUrls.size === 0 || !primaryUrl) {
      setMessage("Select at least one image and choose a primary image before approving.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const selectedCandidates = candidates.filter((candidate) => selectedUrls.has(candidate.url));

    try {
      const response = await fetch("/api/admin/images/approve-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalProductId: selectedProduct.id,
          selectedCandidates,
          primaryCandidateUrl: primaryUrl,
          searchQuery: query,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Failed to approve images");

      setMessage(`Approved ${selectedCandidates.length} image${selectedCandidates.length === 1 ? "" : "s"}.`);
      await fetchWorkbenchImages(selectedProduct.id);
      await fetchProducts(page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to approve images");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-[1680px] flex-col-reverse lg:flex-row">
        {/* Main workspace — left on desktop */}
        <div className="min-w-0 flex-1 border-gray-200 px-4 py-5 sm:px-6 lg:border-r lg:py-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">Image QA · canonical workbench</p>
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  mode === "rapid"
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
                onClick={() => setMode("rapid")}
              >
                Rapid review
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  mode === "workbench"
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
                onClick={() => setMode("workbench")}
              >
                Workbench
              </button>
            </div>
          </div>

          {message && (
            <div className="mb-4 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-sm">
              {message}
            </div>
          )}

          {mode === "rapid" ? (
            <ImageQaSpeedPanel onSessionMessage={setMessage} />
          ) : !selectedProduct ? (
            <div className="flex min-h-[50vh] items-center justify-center rounded-md border border-dashed border-gray-200 bg-white p-8 text-sm text-gray-500">
              Select a product from the list on the right.
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div>
                  <h1 className="text-lg font-medium text-gray-900">
                    {selectedProduct.display_name || selectedProduct.normalized_name}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    UPC {selectedProduct.upc || "—"} · {selectedProduct.manufacturer || "Unknown brand"} ·{" "}
                    {selectedProduct.linked_products} linked listings
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md"
                    disabled={!defaultStudioHeroImageId || Boolean(enhancingImageId)}
                    onClick={() => defaultStudioHeroImageId && void runStudioHero(defaultStudioHeroImageId)}
                  >
                    {enhancingImageId && defaultStudioHeroImageId === enhancingImageId ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Remove background
                  </Button>
                  <p className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    {selectedProduct.primary_image_id ? "Has primary" : "Needs primary"}
                  </p>
                </div>
              </div>

              {!defaultStudioHeroImageId && !loadingWorkbench && (
                <p className="text-xs text-gray-500">
                  Add an on-file image (pending or approved) before running background removal — use Serper or sync.
                </p>
              )}

              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-medium text-gray-800">On-file images</h2>
                    <p className="mt-0.5 max-w-2xl text-xs text-gray-500">
                      Pending and approved. Remove background adds a grey studio hero via OpenAI and sets it primary.
                    </p>
                  </div>
                  {loadingWorkbench ? (
                    <span className="flex items-center text-xs text-gray-500">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Loading
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">{workbenchImages.length} total</span>
                  )}
                </div>
                {!loadingWorkbench && workbenchImages.length === 0 && (
                  <p className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
                    No images yet. Run a Serper search below or import from your stores.
                  </p>
                )}
                {workbenchImages.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                    {workbenchImages.map((image) => {
                      const src = image.display_url || image.cloudinary_url || image.external_url || "";
                      const primary = Boolean(image.is_primary);
                      const isPending = image.approval_status === "pending";
                      const isApproved = image.approval_status === "approved";
                      return (
                        <div
                          key={image.id}
                          className={cn(
                            "overflow-hidden rounded-md border bg-white shadow-sm",
                            primary ? "border-gray-900" : "border-gray-200",
                          )}
                        >
                          <div className="relative aspect-square w-full bg-gray-100">
                            {src ? (
                              <Image src={src} alt="" fill unoptimized className="object-cover" />
                            ) : (
                              <Package className="absolute inset-0 m-auto h-8 w-8 text-gray-400" />
                            )}
                            <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                              {primary && (
                                <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-gray-800 shadow-sm">
                                  Primary
                                </span>
                              )}
                              <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-gray-700 shadow-sm">
                                {isPending ? "Pending" : "Approved"}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 p-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={saving || Boolean(enhancingImageId) || !src}
                              onClick={() => void runStudioHero(image.id)}
                              className="h-8 w-full rounded-md"
                            >
                              {enhancingImageId === image.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="mr-1 h-3 w-3" />
                              )}
                              Remove background
                            </Button>
                            {isApproved && (
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={saving || primary}
                                  onClick={() => void setApprovedPrimary(image.id)}
                                  className="h-8 flex-1 rounded-md"
                                >
                                  <Star className="mr-1 h-3 w-3" />
                                  {primary ? "Primary" : "Make primary"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={saving}
                                  onClick={() => void removeApprovedImage(image.id)}
                                  className="h-8 rounded-md text-gray-700"
                                  aria-label="Remove image"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <h2 className="mb-2 text-sm font-medium text-gray-800">Find images (Serper)</h2>
                <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                  <label className="sr-only" htmlFor="image-qa-serper-query">
                    Search query
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="image-qa-serper-query"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="rounded-md"
                      placeholder="Search query"
                    />
                    <Button onClick={runSearch} disabled={searching} className="rounded-md sm:shrink-0">
                      {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Search
                    </Button>
                  </div>
                </div>
              </section>

              {candidates.length > 0 && (
                <section>
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-sm font-medium text-gray-800">Search results</h2>
                    <Button
                      onClick={approveSelection}
                      disabled={saving || selectedUrls.size === 0 || !primaryUrl}
                      className="rounded-md sm:w-auto"
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Approve selected
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {candidates.map((candidate) => {
                      const selected = selectedUrls.has(candidate.url);
                      const primary = primaryUrl === candidate.url;
                      return (
                        <div
                          key={candidate.url}
                          className={cn(
                            "overflow-hidden rounded-md border bg-white shadow-sm",
                            selected ? "border-gray-900" : "border-gray-200",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleCandidate(candidate)}
                            className="relative block aspect-square w-full bg-gray-100"
                          >
                            <Image
                              src={candidate.thumbnailUrl || candidate.url}
                              alt={candidate.title || "Candidate image"}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                            {selected && (
                              <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-md bg-white text-gray-900" />
                            )}
                          </button>
                          <div className="space-y-2 p-2">
                            <p className="line-clamp-2 text-xs text-gray-600">
                              {candidate.title || candidate.domain || "Image"}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleCandidate(candidate)}
                                className="h-8 flex-1 rounded-md"
                              >
                                {selected ? <X className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                                {selected ? "Deselect" : "Select"}
                              </Button>
                              <Button
                                size="sm"
                                variant={primary ? "default" : "outline"}
                                onClick={() => {
                                  setPrimaryUrl(candidate.url);
                                  setSelectedUrls((current) => new Set(current).add(candidate.url));
                                }}
                                className="h-8 rounded-md"
                              >
                                <Star className="h-3 w-3" />
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

        {/* Right rail — batch, filters, product list */}
        <aside
          className={cn(
            "w-full shrink-0 border-gray-200 bg-white px-4 py-4 sm:px-5 lg:sticky lg:top-0 lg:h-screen lg:w-[min(100%,20rem)] lg:max-w-[20rem] lg:overflow-y-auto lg:border-l xl:w-[22rem] xl:max-w-[22rem]",
            mode === "rapid" && "hidden lg:hidden",
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-600">Batch &amp; products</span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-md px-2"
              onClick={() => {
                setMessage(null);
                fetchProducts(page);
              }}
              aria-label="Refresh list"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Status filter</label>
              <Select value={status} onValueChange={(value) => setStatus(value as WorkbenchStatus)}>
                <SelectTrigger className="h-9 w-full rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">Search</label>
              <div className="flex gap-2">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && fetchProducts(1)}
                  placeholder="Name or UPC"
                  className="h-9 flex-1 rounded-md"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 rounded-md px-3"
                  onClick={() => {
                    setMessage(null);
                    fetchProducts(1);
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 w-full rounded-md">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">Subcategory</label>
              <Select value={subcategory} onValueChange={setSubcategory}>
                <SelectTrigger className="h-9 w-full rounded-md">
                  <SelectValue placeholder="Subcategory" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subcategories</SelectItem>
                  {subcategories.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">Manufacturer</label>
              <Select value={manufacturer} onValueChange={setManufacturer}>
                <SelectTrigger className="h-9 w-full rounded-md">
                  <SelectValue placeholder="Manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All manufacturers</SelectItem>
                  {manufacturers.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="mb-2 text-xs text-gray-500">
              {loading ? "Loading…" : `${products.length} in this batch`}
            </p>
            <div className="max-h-[min(55vh,28rem)] space-y-1.5 overflow-y-auto lg:max-h-[calc(100vh-20rem)]">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading
                </div>
              ) : products.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">Nothing matches this batch.</p>
              ) : (
                products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setSelectedProduct(product)}
                    className={cn(
                      "flex w-full gap-2.5 rounded-md border p-2 text-left transition-colors",
                      selectedProduct?.id === product.id
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 bg-white hover:bg-gray-50",
                    )}
                  >
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-gray-100">
                      {product.primary_image_url ? (
                        <Image src={product.primary_image_url} alt="" fill unoptimized className="object-cover" />
                      ) : (
                        <Package className="m-3 h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-gray-900">
                        {product.display_name || product.normalized_name}
                      </p>
                      <p className="truncate text-[11px] text-gray-500">{product.upc || "No UPC"}</p>
                      <div className="mt-1 flex gap-1">
                        <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-600">
                          {product.approved_images} ok
                        </span>
                        <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-600">
                          {product.pending_images} pend
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-md"
                disabled={page <= 1}
                onClick={() => fetchProducts(page - 1)}
              >
                Prev
              </Button>
              <span className="text-[11px] text-gray-500">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-md"
                disabled={page >= totalPages}
                onClick={() => fetchProducts(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

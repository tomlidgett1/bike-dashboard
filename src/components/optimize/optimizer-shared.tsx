"use client";

import * as React from "react";
import { FileSpreadsheet, Layers, ListFilter, X } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildSpeedSearchQuery,
  type SpeedWorkbenchProduct,
} from "@/lib/admin/image-qa-speed";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CanonicalImage {
  id: string;
  cloudinary_public_id: string | null;
  cloudinary_url: string | null;
  external_url: string | null;
  is_primary: boolean | null;
  approval_status: string | null;
  sort_order: number | null;
  source?: string | null;
}

export interface OptimizerProduct {
  id: string;
  canonical_product_id: string | null;
  description: string;
  display_name: string | null;
  product_description: string | null;
  product_specs: string | null;
  is_bicycle?: boolean | null;
  bike_specs?: unknown;
  brand: string | null;
  upc: string | null;
  category_name: string | null;
  marketplace_category?: string | null;
  marketplace_subcategory?: string | null;
  listing_source: string | null;
  price: number;
  qoh: number;
  resolved_image_url: string | null;
  primary_image_url: string | null;
  canonical_images: CanonicalImage[];
  product_images?: Array<{
    source?: string | null;
    approval_status?: string | null;
    cloudinary_public_id?: string | null;
    cloudinary_url?: string | null;
    external_url?: string | null;
  }>;
  canonical_products?: {
    id: string;
    manufacturer?: string | null;
    upc: string | null;
    normalized_name: string | null;
    image_review_search_query?: string | null;
    product_images?: CanonicalImage[] | null;
  } | null;
}

type ProductApiRow = Omit<OptimizerProduct, "canonical_images" | "canonical_products"> & {
  canonical_images?: CanonicalImage[];
  canonical_products?: (NonNullable<OptimizerProduct["canonical_products"]> & {
    product_images?: CanonicalImage[] | null;
  }) | null;
};

export interface CategoryOption {
  id: string;
  name: string;
  count: number;
  missingImages: number;
  missingSerperImages: number;
  missingCopy: number;
}

export type ImagePhase =
  | "idle"
  | "queued"
  | "searching"
  | "selecting"
  | "ready"
  | "saving"
  | "done"
  | "no_results"
  | "error";

export interface ImageRun {
  phase: ImagePhase;
  candidates: import("@/lib/admin/image-qa-speed").SpeedSearchCandidate[];
  selectedCandidates: import("@/lib/admin/image-qa-speed").SpeedSearchCandidate[];
  selectedUrls: string[];
  primaryUrl: string | null;
  photoSystem?: "smart_product_photos";
  smartPhotoPayloadKey?: string;
  reasoning?: string;
  error?: string;
  enhancedUrls?: Record<string, string>;
  enhancingUrls?: string[];
  showAdditional?: boolean;
  reloading?: boolean;
  savedCount?: number;
}

export type TextStatus = "idle" | "queued" | "running" | "done" | "error";

export interface TextStep {
  status: TextStatus;
  detail?: string;
}

export type CopyField = "title" | "description" | "specs";

export const IMAGE_CONCURRENCY = 2;
export const MAX_SELECTED_IMAGES = 6;
export const IMG_BUSY: ImagePhase[] = ["queued", "searching", "selecting", "saving"];

export const emptyImageRun = (): ImageRun => ({
  phase: "idle",
  candidates: [],
  selectedCandidates: [],
  selectedUrls: [],
  primaryUrl: null,
});

/** Map selected URLs/candidates through enhancedUrls for approval saves. */
export function imageRunWithEnhancedUrls(run: ImageRun) {
  const mapUrl = (url: string) => run.enhancedUrls?.[url] ?? url;
  return {
    selectedUrls: run.selectedUrls.map(mapUrl),
    selectedCandidates: run.selectedCandidates.map((candidate) => {
      const enhanced = run.enhancedUrls?.[candidate.url];
      if (!enhanced) return candidate;
      return { ...candidate, url: enhanced, thumbnailUrl: enhanced };
    }),
    primaryCandidateUrl: run.primaryUrl ? mapUrl(run.primaryUrl) : null,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function productLabel(p: OptimizerProduct) {
  return p.display_name || p.description;
}

export function hasImage(p: OptimizerProduct) {
  return !!(p.resolved_image_url || p.primary_image_url);
}

export function isLightspeedListing(p: OptimizerProduct) {
  const source = p.listing_source;
  if (source === "manual" || source === "online_catalog") return false;
  return true;
}

export function hasSerperImage(p: OptimizerProduct) {
  const allImages = [...(p.canonical_images ?? []), ...(p.product_images ?? [])];
  const hasApprovedImage = allImages.some(
    (img) =>
      (img.approval_status === "approved" || img.approval_status === null) &&
      (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
  );

  if (!isLightspeedListing(p)) {
    return hasApprovedImage || hasImage(p);
  }

  return allImages.some(
    (img) =>
      img.source === "serper_workbench" &&
      (img.approval_status === "approved" || img.approval_status === null) &&
      (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
  );
}

export function isManualCatalogListing(p: OptimizerProduct) {
  return p.listing_source === "manual" || p.listing_source === "online_catalog";
}

export function hasTitle(p: OptimizerProduct) {
  const display = p.display_name?.trim();
  if (!display) return false;
  // CSV / manual listings set description to the source row label; display_name is the optimised title.
  if (isManualCatalogListing(p)) return true;
  return display.toLowerCase() !== (p.description ?? "").trim().toLowerCase();
}

export function hasDesc(p: OptimizerProduct) {
  const marketing = p.product_description?.trim();
  if (marketing) return true;
  // Legacy CSV rows may only have copy on description before product_description was populated.
  if (isManualCatalogListing(p)) {
    const fallback = p.description?.trim();
    const title = (p.display_name ?? "").trim().toLowerCase();
    if (fallback && fallback.toLowerCase() !== title && fallback.length >= 24) {
      return true;
    }
  }
  return false;
}

export function hasSpecs(p: OptimizerProduct) {
  return !!p.product_specs;
}

export function toSpeedProduct(p: OptimizerProduct): SpeedWorkbenchProduct {
  return {
    id: p.canonical_product_id as string,
    normalized_name: p.canonical_products?.normalized_name || p.description,
    display_name: p.display_name,
    upc: p.upc || p.canonical_products?.upc || null,
    category: p.category_name || p.marketplace_category || null,
    manufacturer: p.brand || p.canonical_products?.manufacturer || null,
    marketplace_category: p.marketplace_category ?? null,
    marketplace_subcategory: p.marketplace_subcategory ?? null,
    image_review_search_query: p.canonical_products?.image_review_search_query ?? null,
    store_product_name: p.display_name || p.description,
  };
}

export async function readSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        /* skip malformed */
      }
    }
  }
}

function mapProductRows(rows: ProductApiRow[]): OptimizerProduct[] {
  return rows.map((p) => ({
    ...p,
    canonical_images: (p.canonical_products?.product_images ?? []).filter(
      (img) => img.approval_status === "approved" || img.approval_status === null,
    ),
  }));
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export async function fetchLiveProductSoh(
  productIds: string[],
  options?: { signal?: AbortSignal },
): Promise<Record<string, number>> {
  if (productIds.length === 0) return {};

  const params = new URLSearchParams({
    page: "1",
    pageSize: String(productIds.length),
    status: "active",
    ids: productIds.join(","),
  });
  let res: Response;
  try {
    res = await fetch(`/api/products?${params}`, { signal: options?.signal });
  } catch (error) {
    if (isAbortError(error)) return {};
    throw error;
  }
  if (!res.ok) return {};

  const data = await res.json();
  const sohById: Record<string, number> = {};
  for (const row of (data.products ?? []) as Array<{ id: string; qoh?: number | null }>) {
    sohById[row.id] = Math.max(0, Number(row.qoh) || 0);
  }
  return sohById;
}

export async function fetchOptimizerProductsBySearch(
  search: string,
  options?: { signal?: AbortSignal; pageSize?: number },
): Promise<OptimizerProduct[]> {
  const params = new URLSearchParams({
    page: "1",
    pageSize: String(options?.pageSize ?? 15),
    status: "active",
    search,
    includeOptimizeCanonical: "true",
  });
  try {
    const res = await fetch(`/api/products?${params}`, { signal: options?.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return mapProductRows((data.products ?? []) as ProductApiRow[]);
  } catch (error) {
    if (isAbortError(error)) return [];
    throw error;
  }
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useOptimizerCategories() {
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [scanRes, imageSummaryRes, copySummaryRes] = await Promise.all([
          fetch("/api/lightspeed/categories/scan"),
          fetch("/api/store/image-summary"),
          fetch("/api/store/copy-summary"),
        ]);
        const scanData = await scanRes.json();
        const imageSummaryData = await imageSummaryRes.json();
        const copySummaryData = await copySummaryRes.json();
        const raw: Array<{ id?: string; name?: string; product_count?: number }> =
          scanData.categories ?? [];
        const missingMap = new Map<string, { missing: number; missing_serper: number }>(
          (imageSummaryData.summary ?? []).map(
            (s: {
              ls_category_id: string;
              missing_images: number;
              missing_serper_images: number;
            }) =>
              [
                s.ls_category_id,
                { missing: s.missing_images, missing_serper: s.missing_serper_images ?? 0 },
              ] as [string, { missing: number; missing_serper: number }],
          ),
        );
        const copyMap = new Map<string, number>(
          (copySummaryData.summary ?? []).map(
            (s: { ls_category_id: string; missing_copy: number }) =>
              [s.ls_category_id, s.missing_copy ?? 0] as [string, number],
          ),
        );
        const opts: CategoryOption[] = raw
          .filter((c) => c.id)
          .map((c) => ({
            id: c.id!,
            name: c.name || c.id!,
            count: c.product_count ?? 0,
            missingImages: missingMap.get(c.id!)?.missing ?? 0,
            missingSerperImages: missingMap.get(c.id!)?.missing_serper ?? 0,
            missingCopy: copyMap.get(c.id!) ?? 0,
          }));
        if (!cancelled) setCategories(opts);
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, loadingCats: loading };
}

export const OPTIMIZER_PRODUCT_LIMIT_OPTIONS = [
  { value: "10", label: "10 products" },
  { value: "20", label: "20 products" },
  { value: "50", label: "50 products" },
  { value: "100", label: "100 products" },
  { value: "200", label: "200 products" },
  { value: "500", label: "500 products" },
  { value: "all", label: "All products" },
] as const;

export type OptimizerProductLimit =
  (typeof OPTIMIZER_PRODUCT_LIMIT_OPTIONS)[number]["value"];

export const DEFAULT_OPTIMIZER_PRODUCT_LIMIT: OptimizerProductLimit = "20";

export type OptimizerProductScope = "catalogue" | "csv_image" | "private_listing";

export function optimizerLimitToPageSize(limit: OptimizerProductLimit): number {
  return limit === "all" ? 1000 : Number.parseInt(limit, 10);
}

export function formatOptimizerProductCount(
  loaded: number,
  total: number | null,
): string {
  if (total != null && total > loaded) {
    return `Showing ${loaded} of ${total}`;
  }
  return `Showing ${loaded}`;
}

export function useOptimizerProducts(
  category: string,
  limit: OptimizerProductLimit = DEFAULT_OPTIMIZER_PRODUCT_LIMIT,
  scope: OptimizerProductScope = "catalogue",
) {
  const [products, setProducts] = React.useState<OptimizerProduct[]>([]);
  const [totalInCategory, setTotalInCategory] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);

  const loadProducts = React.useCallback(
    async (
      cat: string,
      productLimit: OptimizerProductLimit,
      productScope: OptimizerProductScope = "catalogue",
    ) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: String(optimizerLimitToPageSize(productLimit)),
          status: "active",
        });
        if (productScope === "csv_image") {
          params.set("source", "manual");
        } else if (productScope === "private_listing") {
          params.set("listing_type", "private_listing");
        } else if (cat && cat !== "all") {
          params.set("ls_category_id", cat);
        }
        const res = await fetch(`/api/products?${params.toString()}`);
        const data = await res.json();
        const rows = (data.products ?? []) as ProductApiRow[];
        setProducts(mapProductRows(rows));
        setTotalInCategory(
          typeof data.pagination?.total === "number" ? data.pagination.total : null,
        );
      } catch {
        setProducts([]);
        setTotalInCategory(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (scope === "csv_image" || scope === "private_listing") {
      void loadProducts("", limit, scope);
      return;
    }
    if (category) void loadProducts(category, limit, scope);
  }, [category, limit, scope, loadProducts]);

  return { products, setProducts, loading, loadProducts, totalInCategory };
}

export function OptimizerScopeTabs({
  scope,
  disabled,
  onChange,
}: {
  scope: OptimizerProductScope;
  disabled?: boolean;
  onChange: (scope: OptimizerProductScope) => void;
}) {
  return (
    <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("catalogue")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
          scope === "catalogue"
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <Layers size={15} />
        Catalogue
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("csv_image")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
          scope === "csv_image"
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <FileSpreadsheet size={15} />
        CSV/Image
      </button>
    </div>
  );
}

export function useLightbox() {
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return { lightbox, setLightbox };
}

export function useRejectedProducts() {
  const [rejectedIds, setRejectedIds] = React.useState<Set<string>>(new Set());

  const loadRejected = React.useCallback(async () => {
    try {
      const res = await fetch("/api/products/reject");
      const data = await res.json();
      const list: Array<{ product_id: string }> = data.rejected ?? [];
      setRejectedIds(new Set(list.map((r) => r.product_id)));
    } catch {
      /* non-fatal */
    }
  }, []);

  React.useEffect(() => {
    void loadRejected();
  }, [loadRejected]);

  const rejectProduct = React.useCallback(async (productId: string) => {
    try {
      await fetch("/api/products/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      setRejectedIds((prev) => new Set([...prev, productId]));
    } catch {
      /* ignore */
    }
  }, []);

  return { rejectedIds, rejectProduct };
}

// ── UI ──────────────────────────────────────────────────────────────────────

export function CategoryPicker({
  category,
  categories,
  loadingCats,
  disabled,
  onChange,
  className,
}: {
  category: string;
  categories: CategoryOption[];
  loadingCats: boolean;
  disabled?: boolean;
  onChange: (cat: string) => void;
  className?: string;
}) {
  return (
    <Select value={category} onValueChange={onChange} disabled={loadingCats || disabled}>
      <SelectTrigger className={className ?? "h-10 w-full rounded-md sm:max-w-xs"}>
        <SelectValue placeholder={loadingCats ? "Loading categories…" : "Select a category"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          <span className="flex items-center gap-2">
            <Layers className="size-3.5" />
            All products
          </span>
        </SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-2">
              {c.name}
              {c.missingSerperImages > 0 ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {c.missingSerperImages} need photos
                </span>
              ) : c.missingImages > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {c.missingImages} missing photos
                </span>
              ) : (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {c.count} products
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProductLimitPicker({
  limit,
  disabled,
  onChange,
  className,
}: {
  limit: OptimizerProductLimit;
  disabled?: boolean;
  onChange: (limit: OptimizerProductLimit) => void;
  className?: string;
}) {
  return (
    <Select
      value={limit}
      onValueChange={(value) => onChange(value as OptimizerProductLimit)}
      disabled={disabled}
    >
      <SelectTrigger className={className ?? "h-9 w-[9.5rem] rounded-md"}>
        <SelectValue placeholder="Limit" />
      </SelectTrigger>
      <SelectContent>
        {OPTIMIZER_PRODUCT_LIMIT_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className="flex items-center gap-2 tabular-nums">
              <ListFilter className="size-3.5 text-muted-foreground" />
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LightboxOverlay({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!url) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/85 p-6 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Full-size preview"
        className="max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg transition hover:bg-background"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function EmptyCategoryPrompt({
  loadingCats,
  category,
  categories,
  onChange,
  title,
  description,
}: {
  loadingCats: boolean;
  category: string;
  categories: CategoryOption[];
  onChange: (cat: string) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="py-16 text-center">
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <div className="mx-auto mt-6 max-w-xs">
        <CategoryPicker
          category={category}
          categories={categories}
          loadingCats={loadingCats}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

export { buildSpeedSearchQuery };

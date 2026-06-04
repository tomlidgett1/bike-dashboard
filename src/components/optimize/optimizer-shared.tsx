"use client";

import * as React from "react";
import { Layers, Loader2, X } from "lucide-react";
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
  brand: string | null;
  upc: string | null;
  category_name: string | null;
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
    upc: string | null;
    normalized_name: string | null;
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

// ── Helpers ─────────────────────────────────────────────────────────────────

export function productLabel(p: OptimizerProduct) {
  return p.display_name || p.description;
}

export function hasImage(p: OptimizerProduct) {
  return !!(p.resolved_image_url || p.primary_image_url);
}

export function hasSerperImage(p: OptimizerProduct) {
  const isLightspeed = !p.listing_source || p.listing_source === "lightspeed";
  if (!isLightspeed) return true;
  const allImages = [...(p.canonical_images ?? []), ...(p.product_images ?? [])];
  return allImages.some(
    (img) =>
      img.source === "serper_workbench" &&
      (img.approval_status === "approved" || img.approval_status === null) &&
      (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
  );
}

export function hasTitle(p: OptimizerProduct) {
  if (!p.display_name) return false;
  return (
    p.display_name.trim().toLowerCase() !== (p.description ?? "").trim().toLowerCase()
  );
}

export function hasDesc(p: OptimizerProduct) {
  return !!p.product_description;
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
    category: p.category_name,
    manufacturer: p.brand,
    marketplace_category: null,
    marketplace_subcategory: null,
    image_review_search_query: null,
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

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useOptimizerCategories() {
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [scanRes, summaryRes] = await Promise.all([
          fetch("/api/lightspeed/categories/scan"),
          fetch("/api/store/image-summary"),
        ]);
        const scanData = await scanRes.json();
        const summaryData = await summaryRes.json();
        const raw: Array<{ id?: string; name?: string; product_count?: number }> =
          scanData.categories ?? [];
        const missingMap = new Map<string, { missing: number; missing_serper: number }>(
          (summaryData.summary ?? []).map(
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
        const opts: CategoryOption[] = raw
          .filter((c) => c.id)
          .map((c) => ({
            id: c.id!,
            name: c.name || c.id!,
            count: c.product_count ?? 0,
            missingImages: missingMap.get(c.id!)?.missing ?? 0,
            missingSerperImages: missingMap.get(c.id!)?.missing_serper ?? 0,
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

export function useOptimizerProducts(category: string) {
  const [products, setProducts] = React.useState<OptimizerProduct[]>([]);
  const [loading, setLoading] = React.useState(false);

  const loadProducts = React.useCallback(async (cat: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "1000", status: "active" });
      if (cat && cat !== "all") params.set("ls_category_id", cat);
      const res = await fetch(`/api/products?${params.toString()}`);
      const data = await res.json();
      const rows = (data.products ?? []) as ProductApiRow[];
      setProducts(mapProductRows(rows));
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (category) void loadProducts(category);
  }, [category, loadProducts]);

  return { products, setProducts, loading, loadProducts };
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

export function LightboxOverlay({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/85 p-6 backdrop-blur-sm animate-in fade-in duration-200"
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
    <div className="rounded-md border bg-white p-8 text-center">
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

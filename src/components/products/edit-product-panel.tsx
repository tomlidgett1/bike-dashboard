"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Eye,
  FileText,
  ImageIcon,
  ListChecks,
  Loader2,
  Pencil,
  RotateCw,
  Save,
  Search,
  Sparkles,
  Star,
  Type,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  StoreHeaderDropdownEmpty,
  StoreHeaderDropdownHeader,
  StoreHeaderDropdownItem,
} from "@/components/layout/store-header-dropdown-panel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BikeSpecsEditor } from "@/components/products/bike-specs-editor";
import { ImageUploader } from "@/components/marketplace/image-uploader";
import { StatusBadge, type StatusTone } from "@/components/dashboard";
import { cn } from "@/lib/utils";
import {
  buildSpeedSearchQuery,
  fetchSerperCandidates,
  type SpeedSearchCandidate,
  type SpeedWorkbenchProduct,
} from "@/lib/admin/image-qa-speed";
import {
  applyCloudinaryRotation,
  getCloudinaryRotation,
  normaliseRotationDegrees,
  rotateCloudinaryUrlClockwise,
} from "@/lib/utils/cloudinary-rotation";
import {
  buildCloudinaryImageUrl,
  extractCloudinaryPublicId,
  rotateCloudinaryPublicIdClockwise,
} from "@/lib/utils/cloudinary-transforms";
import { parseBikeSpecs, type BikeSpecsData } from "@/lib/types/bike-specs";
import type { MarketplaceReadiness } from "@/lib/marketplace/product-readiness";
import {
  resolveProductImage,
  type ResolvableProductImage,
} from "@/lib/services/image-resolver";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditProductData {
  id: string;
  description: string;
  display_name: string | null;
  product_description: string | null;
  product_specs: string | null;
  canonical_product_id: string | null;
  manufacturer_name: string | null;
  custom_sku: string | null;
  system_sku: string | null;
  price: number;
  qoh: number;
  reorder_point: number;
  is_active: boolean;
  immersive_page: boolean;
  is_bicycle: boolean;
  bike_specs: unknown;
  resolved_image_url: string | null;
  primary_image_url: string | null;
  marketplace_readiness?: MarketplaceReadiness;
}

interface CanonicalImage {
  id: string;
  cloudinary_public_id?: string | null;
  cloudinary_url: string | null;
  external_url: string | null;
  is_primary: boolean | null;
  display_url?: string | null;
  approval_status?: string | null;
  sort_order?: number | null;
}

type ProductImageRow = ResolvableProductImage & {
  id: string;
  sort_order?: number | null;
};

type TabId = "content" | "photos" | "settings";
type TextStatus = "idle" | "running" | "done" | "error";
type ImagePhase =
  | "idle"
  | "searching"
  | "selecting"
  | "ready"
  | "saving"
  | "done"
  | "no_results"
  | "error";

interface ImageState {
  phase: ImagePhase;
  candidates: SpeedSearchCandidate[];
  selected: SpeedSearchCandidate[];
  selectedUrls: string[];
  primaryUrl: string | null;
  reasoning?: string;
  error?: string;
  savedCount?: number;
}

const MAX_IMAGES = 6;
const IMG_BUSY: ImagePhase[] = ["searching", "selecting", "saving"];
const GENIE_SECTION = "border-t border-gray-100 px-5 py-4";
const THUMB =
  "relative aspect-square w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100";
const PHOTO_GALLERY = "rounded-2xl border border-gray-100 bg-gray-50 p-4";
const PHOTO_GRID = "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5";

const emptyImage = (): ImageState => ({
  phase: "idle",
  candidates: [],
  selected: [],
  selectedUrls: [],
  primaryUrl: null,
});

export interface EditProductPanelProps {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface SearchProduct {
  id: string;
  description: string;
  display_name?: string | null;
  custom_sku?: string | null;
  system_sku?: string | null;
  manufacturer_name?: string | null;
  resolved_image_url?: string | null;
  primary_image_url?: string | null;
}

function searchProductLabel(product: SearchProduct) {
  return product.display_name || product.description || "Untitled product";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void
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
        /* skip */
      }
    }
  }
}

function toSpeedProduct(p: EditProductData): SpeedWorkbenchProduct {
  return {
    id: p.canonical_product_id as string,
    normalized_name: p.display_name || p.description,
    display_name: p.display_name,
    upc: null,
    category: null,
    manufacturer: p.manufacturer_name,
    marketplace_category: null,
    marketplace_subcategory: null,
    image_review_search_query: null,
    store_product_name: p.display_name || p.description,
  };
}

function deriveStatus(p: EditProductData): { label: string; tone: StatusTone } {
  if (p.marketplace_readiness) {
    if (p.marketplace_readiness.isLive) return { label: "Live", tone: "success" };
    const primary = p.marketplace_readiness.blockers[0];
    if (primary?.id === "no_approved_image") return { label: "Needs images", tone: "warning" };
    if (primary?.id === "inactive") return { label: "Hidden", tone: "neutral" };
    if (primary?.id === "out_of_stock") return { label: "Out of stock", tone: "warning" };
    return { label: "Not live", tone: "warning" };
  }
  if (!p.is_active) return { label: "Hidden", tone: "neutral" };
  if (!p.resolved_image_url && !p.primary_image_url) return { label: "Needs images", tone: "warning" };
  return { label: "Live", tone: "success" };
}

function isExternal(url: string | null | undefined) {
  if (!url) return false;
  return !url.includes("res.cloudinary.com") && !url.includes("supabase.co");
}

function resolveImageUrl(
  image: Pick<CanonicalImage, "display_url" | "cloudinary_url" | "external_url"> | null | undefined
) {
  if (!image) return null;
  return image.display_url || image.cloudinary_url || image.external_url || null;
}

function isGalleryImage(row: ResolvableProductImage & { id?: string | null }): row is ProductImageRow {
  if (!row?.id) return false;
  const status = row.approval_status;
  return status == null || status === "approved" || status === "pending";
}

function mapRowToCanonicalImage(row: ProductImageRow): CanonicalImage | null {
  const resolved = resolveProductImage(row);
  const display_url =
    resolved?.card_url ||
    resolved?.thumbnail_url ||
    resolved?.original_url ||
    row.cloudinary_url ||
    row.external_url ||
    null;
  if (!display_url) return null;
  return {
    id: row.id,
    cloudinary_public_id: row.cloudinary_public_id ?? null,
    cloudinary_url: row.cloudinary_url ?? null,
    external_url: row.external_url ?? null,
    is_primary: row.is_primary ?? null,
    display_url,
    approval_status: row.approval_status ?? null,
    sort_order: row.sort_order ?? null,
  };
}

function cacheBustUrl(url: string | null | undefined) {
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}_cb=${Date.now()}`;
}

function withRotatedDisplay(image: CanonicalImage, updates: Partial<CanonicalImage>): CanonicalImage {
  const next = { ...image, ...updates };
  const resolved = resolveProductImage(next);
  const displayUrl =
    resolved?.card_url ||
    resolved?.thumbnail_url ||
    resolved?.original_url ||
    next.cloudinary_url ||
    next.external_url ||
    null;
  return {
    ...next,
    display_url: cacheBustUrl(displayUrl),
  };
}

function extractImagesFromProductPayload(product: Record<string, unknown>): CanonicalImage[] {
  const storeImages = (product.product_images as ProductImageRow[] | undefined) ?? [];
  const canonical = product.canonical_products as { product_images?: ProductImageRow[] } | null | undefined;
  const canonicalImages = canonical?.product_images ?? [];
  return mergeCanonicalImages(
    storeImages.filter(isGalleryImage).map(mapRowToCanonicalImage).filter(Boolean) as CanonicalImage[],
    canonicalImages.filter(isGalleryImage).map(mapRowToCanonicalImage).filter(Boolean) as CanonicalImage[]
  );
}

function mergeCanonicalImages(...lists: CanonicalImage[][]): CanonicalImage[] {
  const map = new Map<string, CanonicalImage>();
  for (const list of lists) {
    for (const image of list) {
      const existing = map.get(image.id);
      map.set(image.id, existing ? { ...existing, ...image } : image);
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

// ── Compact thumbnail with actions ────────────────────────────────────────────

function PhotoThumb({
  url,
  primary,
  busy,
  onView,
  onRotate,
  onEnhance,
  onSetPrimary,
  onRemove,
  showActions = true,
  canRemove = true,
}: {
  url: string;
  primary?: boolean;
  busy?: boolean;
  onView: () => void;
  onRotate?: () => void;
  onEnhance?: () => void;
  onSetPrimary?: () => void;
  onRemove?: () => void;
  showActions?: boolean;
  canRemove?: boolean;
}) {
  return (
    <div
      className={cn(
        THUMB,
        "group",
        primary && "border-primary ring-1 ring-primary ring-offset-1 ring-offset-background",
        busy && "opacity-50"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="size-full object-cover" />
      {primary && (
        <span className="absolute left-1.5 top-1.5 z-20 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
          Primary
        </span>
      )}
      {busy && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/70">
          <Loader2 className="size-4 animate-spin" />
        </div>
      )}
      {showActions && !busy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-1 bg-black/40 p-1 opacity-100 transition sm:bg-black/0 sm:opacity-0 sm:pointer-events-none sm:group-hover:pointer-events-auto sm:group-hover:bg-black/40 sm:group-hover:opacity-100">
          <div className="flex flex-wrap justify-center gap-1">
            <button
              type="button"
              title="View"
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
              className="inline-flex size-7 items-center justify-center rounded-md bg-white text-foreground shadow"
            >
              <Eye className="size-3.5" />
            </button>
            {onRotate && (
              <button
                type="button"
                title="Rotate"
                onClick={(e) => {
                  e.stopPropagation();
                  onRotate();
                }}
                className="inline-flex size-7 items-center justify-center rounded-md bg-white text-foreground shadow"
              >
                <RotateCw className="size-3.5" />
              </button>
            )}
            {onEnhance && (
              <button
                type="button"
                title="Remove background"
                onClick={(e) => {
                  e.stopPropagation();
                  onEnhance();
                }}
                className="inline-flex size-7 items-center justify-center rounded-md bg-white text-foreground shadow"
              >
                <Wand2 className="size-3.5" />
              </button>
            )}
            {!primary && onSetPrimary && (
              <button
                type="button"
                title="Set primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetPrimary();
                }}
                className="inline-flex size-7 items-center justify-center rounded-md bg-white text-foreground shadow"
              >
                <Star className="size-3.5" />
              </button>
            )}
            {canRemove && onRemove && (
              <button
                type="button"
                title="Remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="inline-flex size-7 items-center justify-center rounded-md bg-white text-muted-foreground shadow hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Text field block ──────────────────────────────────────────────────────────

function TextFieldBlock({
  label,
  icon: Icon,
  current,
  status,
  onRun,
  onSave,
  running,
  multiline = false,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  current: string | null | undefined;
  status: TextStatus;
  onRun: () => void;
  onSave: (value: string) => Promise<void>;
  running: boolean;
  multiline?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(current ?? "");
  const [saving, setSaving] = React.useState(false);
  const hasCurrent = !!current;
  const isDone = status === "done" || (hasCurrent && status === "idle");

  React.useEffect(() => {
    if (!editing) setEditValue(current ?? "");
  }, [current, editing]);

  const saveEdit = async () => {
    setSaving(true);
    try {
      await onSave(editValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={GENIE_SECTION}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
          {status === "running" ? (
            <Loader2 className="size-3.5 animate-spin text-gray-500" />
          ) : status === "error" ? (
            <AlertCircle className="size-3.5 text-gray-500" />
          ) : (
            <Icon className="size-3.5 text-gray-400" />
          )}
          {label}
        </div>
        <div className="flex items-center gap-1">
          {hasCurrent && !editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={running}
              onClick={() => {
                setEditValue(current ?? "");
                setEditing(true);
              }}
            >
              <Pencil className="mr-1 size-3" />
              Edit
            </Button>
          )}
          <Button
            variant={isDone ? "outline" : "default"}
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={running || editing}
            onClick={onRun}
          >
            {status === "running" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <>
                <Sparkles className="mr-1 size-3" />
                {isDone ? "Regenerate" : "Generate"}
              </>
            )}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          {multiline ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={5}
              className="w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
              autoFocus
            />
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
              autoFocus
            />
          )}
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Save className="mr-1 size-3" />}
              Save
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : hasCurrent ? (
        <div className="rounded-2xl bg-gray-100 px-2.5 py-2 text-sm text-gray-600">
          <p className={cn("whitespace-pre-wrap text-xs", !expanded && "line-clamp-3")}>{current}</p>
          {(current?.length ?? 0) > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 flex items-center gap-0.5 text-[11px] text-foreground hover:underline"
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" /> Show more
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Not yet written.</p>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function EditProductPanel({
  productId,
  open,
  onOpenChange,
  onSaved,
}: EditProductPanelProps) {
  const [activeProductId, setActiveProductId] = React.useState<string | null>(null);
  const [productSearch, setProductSearch] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchProduct[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [product, setProduct] = React.useState<EditProductData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabId>("content");
  const [running, setRunning] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [lightboxMounted, setLightboxMounted] = React.useState(false);
  const [showUpload, setShowUpload] = React.useState(false);
  const [bikeSpecsExpanded, setBikeSpecsExpanded] = React.useState(false);

  const [titleStatus, setTitleStatus] = React.useState<TextStatus>("idle");
  const [descStatus, setDescStatus] = React.useState<TextStatus>("idle");
  const [specsStatus, setSpecsStatus] = React.useState<TextStatus>("idle");

  const [canonicalImages, setCanonicalImages] = React.useState<CanonicalImage[]>([]);
  const [loadingImages, setLoadingImages] = React.useState(false);
  const [busyImageIds, setBusyImageIds] = React.useState<string[]>([]);

  const [img, setImg] = React.useState<ImageState>(emptyImage());
  const patchImg = (patch: Partial<ImageState> | ((prev: ImageState) => Partial<ImageState>)) =>
    setImg((prev) => {
      const next = typeof patch === "function" ? patch(prev) : patch;
      return { ...prev, ...next };
    });

  const abortRef = React.useRef<AbortController | null>(null);
  const searchAbortRef = React.useRef<AbortController | null>(null);

  const patchProduct = (updates: Partial<EditProductData>) => {
    setProduct((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const fetchGalleryImages = React.useCallback(
    async (canonicalId: string | null, productPayload?: Record<string, unknown> | null) => {
      setLoadingImages(true);
      try {
        let workbenchImages: CanonicalImage[] = [];
        if (canonicalId) {
          const res = await fetch(`/api/admin/images/workbench-assets?canonicalProductId=${canonicalId}`);
          const json = await res.json();
          if (json.success) {
            workbenchImages = (json.data ?? []) as CanonicalImage[];
          }
        }
        const fromProduct = productPayload ? extractImagesFromProductPayload(productPayload) : [];
        setCanonicalImages(mergeCanonicalImages(workbenchImages, fromProduct));
      } catch {
        setCanonicalImages(productPayload ? extractImagesFromProductPayload(productPayload) : []);
      } finally {
        setLoadingImages(false);
      }
    },
    []
  );

  const refreshGallery = React.useCallback(() => {
    if (!product) return;
    void fetchGalleryImages(product.canonical_product_id, product as unknown as Record<string, unknown>);
  }, [product, fetchGalleryImages]);

  const fetchProduct = React.useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        setProduct(json.product);
        await fetchGalleryImages(
          json.product?.canonical_product_id ?? null,
          json.product as Record<string, unknown>
        );
      } catch {
        setProduct(null);
        setCanonicalImages([]);
      } finally {
        setLoading(false);
      }
    },
    [fetchGalleryImages]
  );

  React.useEffect(() => {
    if (!open) {
      searchAbortRef.current?.abort();
      setActiveProductId(null);
      setProductSearch("");
      setSearchResults([]);
      setSearchLoading(false);
      setProduct(null);
      setImg(emptyImage());
      setActiveTab("content");
      setShowUpload(false);
      setTitleStatus("idle");
      setDescStatus("idle");
      setSpecsStatus("idle");
      setCanonicalImages([]);
      return;
    }
    if (productId) {
      setActiveProductId(productId);
    }
  }, [open, productId]);

  React.useEffect(() => {
    if (!open || !activeProductId) return;
    void fetchProduct(activeProductId);
  }, [open, activeProductId, fetchProduct]);

  React.useEffect(() => {
    const query = productSearch.trim();
    if (!open || !query) {
      searchAbortRef.current?.abort();
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchLoading(true);

      const params = new URLSearchParams({
        page: "1",
        pageSize: "15",
        search: query,
      });

      void fetch(`/api/products?${params}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((json) => {
          if (!controller.signal.aborted) {
            setSearchResults((json.products ?? []) as SearchProduct[]);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [productSearch, open]);

  React.useEffect(() => {
    if (product?.is_bicycle) setBikeSpecsExpanded(true);
  }, [product?.is_bicycle, activeProductId]);

  React.useEffect(() => {
    setLightboxMounted(true);
  }, []);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const notifySaved = () => {
    onSaved?.();
  };

  const saveField = async (
    field: "display_name" | "product_description" | "product_specs",
    value: string
  ) => {
    const id = product?.id ?? activeProductId;
    if (!id) return;
    const res = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error("Failed to save");
    patchProduct({ [field]: value });
    notifySaved();
  };

  const patchSettings = async (updates: Partial<EditProductData>) => {
    const id = product?.id ?? activeProductId;
    if (!id) return;
    const res = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to save");
    patchProduct(updates);
    notifySaved();
  };

  const handleSearchSelect = (item: SearchProduct) => {
    setActiveProductId(item.id);
    setProductSearch("");
    setSearchResults([]);
    setActiveTab("content");
    setImg(emptyImage());
    setShowUpload(false);
    setTitleStatus("idle");
    setDescStatus("idle");
    setSpecsStatus("idle");
  };

  const runTitle = async () => {
    if (!product) return;
    setRunning(true);
    abortRef.current = new AbortController();
    setTitleStatus("running");
    try {
      const res = await fetch("/api/products/generate-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [product.id] }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("Failed");
      await readSSE(res.body, (event) => {
        if (event.productId !== product.id || event.event !== "product_complete") return;
        if (event.success && event.title) {
          patchProduct({ display_name: event.title as string });
          setTitleStatus("done");
          notifySaved();
        } else {
          setTitleStatus("error");
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") setTitleStatus("error");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const runDescriptions = async (mode: "both" | "description" | "specs") => {
    if (!product) return;
    setRunning(true);
    abortRef.current = new AbortController();
    const doDesc = mode === "both" || mode === "description";
    const doSpecs = mode === "both" || mode === "specs";
    if (doDesc) setDescStatus("running");
    if (doSpecs) setSpecsStatus("running");
    try {
      const res = await fetch("/api/products/generate-product-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [product.id], mode }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("Failed");
      await readSSE(res.body, (event) => {
        if (event.productId !== product.id) return;
        if (event.event === "product_complete") {
          if (event.success) {
            const updates: Partial<EditProductData> = {};
            if (doDesc && event.description) updates.product_description = event.description as string;
            if (doSpecs && event.specs) updates.product_specs = event.specs as string;
            patchProduct(updates);
            if (doDesc) setDescStatus("done");
            if (doSpecs) setSpecsStatus("done");
            notifySaved();
          } else {
            if (doDesc) setDescStatus("error");
            if (doSpecs) setSpecsStatus("error");
          }
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        if (doDesc) setDescStatus("error");
        if (doSpecs) setSpecsStatus("error");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const markImageBusy = (id: string, busy: boolean) => {
    setBusyImageIds((prev) => (busy ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const enhanceImage = async (imageId: string, url: string) => {
    if (!product?.canonical_product_id) return;
    markImageBusy(imageId, true);
    try {
      const res = await fetch("/api/admin/images/enhance-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, canonicalProductId: product.canonical_product_id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.url) throw new Error();
      await fetch("/api/admin/images/update-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          canonicalProductId: product.canonical_product_id,
          cloudinaryUrl: json.url,
          cloudinaryPublicId: json.publicId ?? null,
        }),
      });
      setCanonicalImages((prev) =>
        prev.map((ci) =>
          ci.id === imageId ? { ...ci, cloudinary_url: json.url, display_url: json.url, external_url: null } : ci
        )
      );
      void fetchProduct(product.id);
      notifySaved();
    } catch {
      /* unchanged */
    } finally {
      markImageBusy(imageId, false);
    }
  };

  const rotateImage = async (imageId: string) => {
    if (!product?.canonical_product_id) return;
    const image = canonicalImages.find((ci) => ci.id === imageId);
    if (!image) return;

    const sourcePublicId =
      image.cloudinary_public_id || extractCloudinaryPublicId(image.cloudinary_url ?? undefined);
    let rotatedPublicId: string | null = null;
    let rotatedUrl: string | null = null;

    if (sourcePublicId) {
      rotatedPublicId = rotateCloudinaryPublicIdClockwise(sourcePublicId);
      if (!rotatedPublicId || rotatedPublicId === sourcePublicId) return;
      rotatedUrl =
        buildCloudinaryImageUrl(rotatedPublicId, "zoom") ||
        applyCloudinaryRotation(image.cloudinary_url ?? undefined, normaliseRotationDegrees(getCloudinaryRotation(image.cloudinary_url ?? undefined) + 90)) ||
        null;
    } else if (image.cloudinary_url?.includes("res.cloudinary.com")) {
      rotatedUrl = rotateCloudinaryUrlClockwise(image.cloudinary_url) ?? null;
      if (!rotatedUrl || rotatedUrl === image.cloudinary_url) return;
      rotatedPublicId = extractCloudinaryPublicId(rotatedUrl);
    } else {
      return;
    }

    if (!rotatedUrl) return;

    markImageBusy(imageId, true);
    try {
      const res = await fetch("/api/admin/images/update-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          canonicalProductId: product.canonical_product_id,
          cloudinaryUrl: rotatedUrl,
          ...(rotatedPublicId ? { cloudinaryPublicId: rotatedPublicId } : {}),
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          cloudinary_public_id?: string | null;
          cloudinary_url?: string | null;
        };
      };
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to rotate");

      const savedPublicId = json.data?.cloudinary_public_id ?? rotatedPublicId;
      const savedUrl = json.data?.cloudinary_url ?? rotatedUrl;

      setCanonicalImages((prev) =>
        prev.map((ci) =>
          ci.id === imageId
            ? withRotatedDisplay(ci, {
                cloudinary_public_id: savedPublicId ?? ci.cloudinary_public_id,
                cloudinary_url: savedUrl,
                external_url: null,
              })
            : ci
        )
      );
      notifySaved();
    } catch {
      /* unchanged */
    } finally {
      markImageBusy(imageId, false);
    }
  };

  const removeImage = async (imageId: string) => {
    if (!product?.canonical_product_id) return;
    markImageBusy(imageId, true);
    setCanonicalImages((prev) => prev.filter((ci) => ci.id !== imageId));
    try {
      await fetch("/api/admin/images/remove-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: product.canonical_product_id, imageId }),
      });
      void fetchProduct(product.id);
      notifySaved();
    } catch {
      void refreshGallery();
    } finally {
      markImageBusy(imageId, false);
    }
  };

  const setPrimaryImage = async (imageId: string) => {
    if (!product?.canonical_product_id) return;
    setCanonicalImages((prev) => prev.map((ci) => ({ ...ci, is_primary: ci.id === imageId })));
    try {
      await fetch("/api/admin/images/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: product.canonical_product_id, imageId }),
      });
      void fetchProduct(product.id);
      notifySaved();
    } catch {
      void refreshGallery();
    }
  };

  const startImageSearch = async () => {
    if (!product?.canonical_product_id) return;
    abortRef.current = new AbortController();
    const sp = toSpeedProduct(product);
    try {
      patchImg({ phase: "searching" });
      const candidates = await fetchSerperCandidates(sp, buildSpeedSearchQuery(sp));
      if (candidates.length === 0) {
        patchImg({ phase: "no_results", error: "No images found" });
        return;
      }
      patchImg({ phase: "selecting", candidates });
      const selRes = await fetch("/api/admin/images/ai-select-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: sp.store_product_name || sp.normalized_name,
          brand: sp.manufacturer ?? undefined,
          candidates,
          maxImages: MAX_IMAGES,
        }),
        signal: abortRef.current.signal,
      });
      const selJson = await selRes.json();
      if (!selRes.ok || !selJson.success || !selJson.primaryUrl) {
        throw new Error(selJson.error || "AI selection failed");
      }
      patchImg({
        phase: "ready",
        selected: selJson.selectedCandidates,
        selectedUrls: selJson.selectedUrls,
        primaryUrl: selJson.primaryUrl,
        reasoning: selJson.reasoning,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      patchImg({ phase: "error", error: (err as Error).message });
    } finally {
      abortRef.current = null;
    }
  };

  const approveImages = async () => {
    if (!product?.canonical_product_id || img.phase !== "ready" || !img.primaryUrl) return;
    const sp = toSpeedProduct(product);
    patchImg({ phase: "saving" });
    try {
      const res = await fetch("/api/admin/images/approve-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalProductId: product.canonical_product_id,
          selectedCandidates: img.selected,
          primaryCandidateUrl: img.primaryUrl,
          searchQuery: buildSpeedSearchQuery(sp),
          rejectPending: true,
          quickMode: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
      patchImg({ phase: "done", savedCount: (json.savedImageIds ?? img.selectedUrls).length });
      void fetchProduct(product.id);
      notifySaved();
    } catch (err) {
      patchImg({ phase: "ready", error: (err as Error).message });
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "content", label: "Content", icon: FileText },
    { id: "photos", label: "Photos", icon: ImageIcon },
    { id: "settings", label: "Settings", icon: Eye },
  ];

  const productName = product?.display_name || product?.description || "Product";
  const sku = product?.custom_sku || product?.system_sku || "—";
  const heroImage = product?.resolved_image_url || product?.primary_image_url;
  const status = product ? deriveStatus(product) : null;
  const showProductResults = productSearch.trim().length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/15 duration-200 data-open:animate-in data-open:fade-in-0"
          className={cn(
            "grid h-[min(820px,calc(100vh-1.5rem))] max-w-[calc(100vw-1.5rem)] grid-rows-[auto_1fr] gap-0 overflow-hidden rounded-[28px] border border-gray-200 bg-white p-0 text-gray-800 shadow-xl ring-0 sm:max-w-5xl",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-open:zoom-in-95 data-open:duration-300 data-open:ease-out",
          )}
          onEscapeKeyDown={(event) => {
            if (lightbox) {
              event.preventDefault();
              setLightbox(null);
            }
          }}
        >
          <DialogTitle className="sr-only">Edit product</DialogTitle>

          <div className="relative shrink-0">
            <StoreHeaderDropdownHeader
              title="Edit product"
              actions={
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              }
              subtitle={
                <div className="relative mt-3">
                  <div className="flex h-10 items-center gap-2.5 rounded-full border border-gray-200 bg-gray-50 px-3.5">
                    <Search className="size-4 shrink-0 text-gray-400" />
                    <input
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder="Search products to edit…"
                      autoFocus
                      className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
              }
            />

            {!showProductResults && loading ? (
              <div className={cn(GENIE_SECTION, "flex items-center gap-3 pt-2")}>
                <Loader2 className="size-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">Loading product…</span>
              </div>
            ) : null}

            {!showProductResults && !loading && product ? (
              <div className={GENIE_SECTION}>
                <div className="flex items-center gap-3">
                  <div className="relative size-11 shrink-0 overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-gray-200">
                    {heroImage ? (
                      <Image
                        src={heroImage}
                        alt=""
                        width={44}
                        height={44}
                        unoptimized={isExternal(heroImage)}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <ImageIcon className="size-4 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-gray-800">{productName}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        {running && (
                          <button
                            type="button"
                            onClick={() => abortRef.current?.abort()}
                            className="text-xs font-medium text-gray-500 transition hover:text-gray-800"
                          >
                            Stop AI
                          </button>
                        )}
                        {status && <StatusBadge label={status.label} tone={status.tone} />}
                        <Link
                          href={`/marketplace/product/${product.id}`}
                          target="_blank"
                          className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                          aria-label="View live"
                        >
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </div>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {sku}
                      {product.manufacturer_name ? ` · ${product.manufacturer_name}` : ""}
                      {` · $${product.price.toFixed(2)} · ${product.qoh} in stock`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        activeTab === tab.id
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70",
                      )}
                    >
                      <tab.icon className="size-[15px]" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 overflow-y-auto border-t border-gray-100 bg-white">
            {showProductResults ? (
              <div>
                {searchLoading ? (
                  <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-gray-500">
                    <Loader2 className="size-4 animate-spin" />
                    Searching…
                  </div>
                ) : searchResults.length === 0 ? (
                  <StoreHeaderDropdownEmpty icon={Search} message="No products found" />
                ) : (
                  searchResults.map((item) => {
                    const thumb = item.resolved_image_url || item.primary_image_url;
                    return (
                      <StoreHeaderDropdownItem
                        key={item.id}
                        onClick={() => handleSearchSelect(item)}
                        className={cn(item.id === activeProductId && "bg-gray-50")}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative size-9 shrink-0 overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-gray-200">
                            {thumb ? (
                              <Image
                                src={thumb}
                                alt=""
                                width={36}
                                height={36}
                                unoptimized={isExternal(thumb)}
                                className="size-full object-cover"
                              />
                            ) : (
                              <div className="flex size-full items-center justify-center">
                                <ImageIcon className="size-4 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">
                              {searchProductLabel(item)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-gray-500">
                              {item.manufacturer_name || "No brand"}
                              {item.custom_sku || item.system_sku
                                ? ` · ${item.custom_sku || item.system_sku}`
                                : ""}
                            </p>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-gray-400" />
                        </div>
                      </StoreHeaderDropdownItem>
                    );
                  })
                )}
              </div>
            ) : !loading && !product ? (
              <StoreHeaderDropdownEmpty
                icon={Search}
                message="Search for a product by name, SKU, or description"
              />
            ) : !loading && product && activeTab === "content" ? (
              <>
                <div className={GENIE_SECTION}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">AI content</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Same engine as Product Optimise — web search for titles, descriptions, and specs.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 text-xs"
                      disabled={running}
                      onClick={() => {
                        void runTitle();
                        void runDescriptions("both");
                      }}
                    >
                      <Sparkles className="mr-1 size-3" />
                      Generate all
                    </Button>
                  </div>
                </div>

                <TextFieldBlock
                  label="Title"
                  icon={Type}
                  current={product.display_name}
                  status={titleStatus}
                  onRun={() => void runTitle()}
                  onSave={(v) => saveField("display_name", v)}
                  running={running}
                />
                <TextFieldBlock
                  label="Description"
                  icon={FileText}
                  current={product.product_description}
                  status={descStatus}
                  onRun={() => void runDescriptions("description")}
                  onSave={(v) => saveField("product_description", v)}
                  running={running}
                  multiline
                />
                <TextFieldBlock
                  label="Specs"
                  icon={ListChecks}
                  current={product.product_specs}
                  status={specsStatus}
                  onRun={() => void runDescriptions("specs")}
                  onSave={(v) => saveField("product_specs", v)}
                  running={running}
                  multiline
                />
              </>
            ) : !loading && product && activeTab === "photos" ? (
              <>
                <div className={GENIE_SECTION}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Your photos</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {canonicalImages.length > 0
                          ? `${canonicalImages.length} photo${canonicalImages.length === 1 ? "" : "s"} · hover for actions, eye icon to preview`
                          : "Upload or search below to add photos."}
                      </p>
                    </div>
                    {product.canonical_product_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => setShowUpload((v) => !v)}
                      >
                        <Upload className="mr-1 size-3" />
                        Upload
                      </Button>
                    )}
                  </div>

                  <AnimatePresence>
                    {showUpload && product.canonical_product_id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                        className="mb-3 overflow-hidden"
                      >
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-3">
                          <ImageUploader
                            canonicalProductId={product.canonical_product_id}
                            onUploadComplete={() => {
                              void fetchProduct(product.id);
                              setShowUpload(false);
                              notifySaved();
                            }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!product.canonical_product_id ? (
                    <p className="text-xs text-gray-500">Sync from Lightspeed to manage photos.</p>
                  ) : loadingImages ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading…
                    </div>
                  ) : canonicalImages.length === 0 ? (
                    <p className="text-xs text-gray-500">No photos yet — search with AI below.</p>
                  ) : (
                    <div className={PHOTO_GALLERY}>
                      <div className={PHOTO_GRID}>
                        {canonicalImages.map((ci) => {
                          const url = resolveImageUrl(ci);
                          if (!url) return null;
                          return (
                            <PhotoThumb
                              key={ci.id}
                              url={url}
                              primary={!!ci.is_primary}
                              busy={busyImageIds.includes(ci.id)}
                              onView={() => setLightbox(url)}
                              onRotate={() => void rotateImage(ci.id)}
                              onEnhance={() => void enhanceImage(ci.id, url)}
                              onSetPrimary={ci.is_primary ? undefined : () => void setPrimaryImage(ci.id)}
                              onRemove={() => void removeImage(ci.id)}
                              canRemove={canonicalImages.length > 1}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {product.canonical_product_id && (
                  <div className={GENIE_SECTION}>
                    <div className="mb-2 flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-gray-400" />
                      <p className="text-sm font-medium text-gray-800">Find photos with AI</p>
                    </div>

                    {img.phase === "idle" && (
                      <Button size="sm" className="h-7 text-xs" onClick={() => void startImageSearch()}>
                        <ImageIcon className="mr-1 size-3" />
                        Search for photos
                      </Button>
                    )}

                    {IMG_BUSY.includes(img.phase) && img.selectedUrls.length === 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 className="size-3.5 animate-spin" />
                        {img.phase === "searching" ? "Searching…" : "AI selecting…"}
                      </div>
                    )}

                    {(img.phase === "error" || img.phase === "no_results") && (
                      <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
                        <AlertCircle className="size-3.5 shrink-0" />
                        {img.error || "Search failed"}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 px-2 text-xs"
                          onClick={() => patchImg(emptyImage())}
                        >
                          Retry
                        </Button>
                      </div>
                    )}

                    {img.selectedUrls.length > 0 && (
                      <div className="space-y-2">
                        {img.reasoning && img.phase === "ready" && (
                          <p className="text-[11px] italic text-gray-500">{img.reasoning}</p>
                        )}
                        <div className={PHOTO_GALLERY}>
                          <div className={PHOTO_GRID}>
                            {img.selectedUrls.map((url) => {
                              const cand = img.selected.find((c) => c.url === url);
                              const displaySrc = cand?.thumbnailUrl ?? url;
                              const primary = url === img.primaryUrl;
                              return (
                                <div key={url} className="relative">
                                  <PhotoThumb
                                    url={displaySrc}
                                    primary={primary}
                                    showActions={img.phase === "ready"}
                                    onView={() => setLightbox(displaySrc)}
                                    onSetPrimary={
                                      primary || img.phase !== "ready"
                                        ? undefined
                                        : () => patchImg({ primaryUrl: url })
                                    }
                                    onRemove={
                                      img.phase !== "ready" || img.selectedUrls.length <= 1
                                        ? undefined
                                        : () =>
                                            patchImg((prev) => ({
                                              selectedUrls: prev.selectedUrls.filter((u) => u !== url),
                                              selected: prev.selected.filter((c) => c.url !== url),
                                              primaryUrl:
                                                prev.primaryUrl === url
                                                  ? prev.selectedUrls.filter((u) => u !== url)[0] ?? null
                                                  : prev.primaryUrl,
                                            }))
                                    }
                                    canRemove={img.selectedUrls.length > 1}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {img.phase === "ready" && (
                          <Button size="sm" className="h-7 text-xs" onClick={() => void approveImages()}>
                            Approve {img.selectedUrls.length} photo
                            {img.selectedUrls.length === 1 ? "" : "s"}
                          </Button>
                        )}
                        {img.phase === "done" && (
                          <p className="text-xs text-gray-500">
                            Saved {img.savedCount ?? img.selectedUrls.length} photo
                            {(img.savedCount ?? img.selectedUrls.length) === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : !loading && product && activeTab === "settings" ? (
              <>
                <div className={GENIE_SECTION}>
                  <p className="mb-3 text-sm font-medium text-gray-800">Marketplace visibility</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-gray-800">Visible on marketplace</p>
                        <p className="text-xs text-gray-500">Hidden products won&apos;t appear in search.</p>
                      </div>
                      <Switch
                        size="sm"
                        checked={product.is_active}
                        onCheckedChange={(checked) => void patchSettings({ is_active: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-gray-800">Immersive product page</p>
                        <p className="text-xs text-gray-500">Full-screen hero with floating buy card.</p>
                      </div>
                      <Switch
                        size="sm"
                        checked={product.immersive_page}
                        onCheckedChange={(checked) => void patchSettings({ immersive_page: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className={GENIE_SECTION}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Complete bicycle</p>
                      <p className="text-xs text-gray-500">Enables structured bike specs on the product page.</p>
                    </div>
                    <Switch
                      size="sm"
                      checked={product.is_bicycle}
                      onCheckedChange={(checked) => {
                        void patchSettings({ is_bicycle: checked });
                        if (checked) setBikeSpecsExpanded(true);
                      }}
                    />
                  </div>

                  <AnimatePresence>
                    {product.is_bicycle && bikeSpecsExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 border-t border-gray-100 pt-3">
                          <BikeSpecsEditor
                            productId={product.id}
                            productName={productName}
                            initialSpecs={parseBikeSpecs(product.bike_specs)}
                            onSaved={(specs: BikeSpecsData | null, isBicycle: boolean) => {
                              patchProduct({ bike_specs: specs, is_bicycle: isBicycle });
                              notifySaved();
                            }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className={GENIE_SECTION}>
                  <p className="mb-2 text-sm font-medium text-gray-800">Inventory (from Lightspeed)</p>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-[11px] text-gray-500">SKU</dt>
                      <dd className="font-mono text-xs text-gray-800">{sku}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Price</dt>
                      <dd className="text-xs text-gray-800">${product.price.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Stock</dt>
                      <dd className="text-xs text-gray-800">{product.qoh}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Reorder point</dt>
                      <dd className="text-xs text-gray-800">{product.reorder_point}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-[11px] text-gray-500">Price and stock sync from Lightspeed.</p>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox — portaled above the edit dialog (z-50) */}
      {lightboxMounted &&
        createPortal(
          <AnimatePresence>
            {lightbox && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-[100] bg-black/60 animate-in fade-in duration-200"
                  onClick={() => setLightbox(null)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.95 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="pointer-events-none fixed inset-0 z-[101] flex items-center justify-center p-6"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lightbox}
                    alt="Preview"
                    className="pointer-events-auto max-h-[85vh] max-w-[85vw] rounded-md object-contain shadow-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setLightbox(null)}
                    className="pointer-events-auto absolute right-6 top-6 inline-flex size-8 items-center justify-center rounded-md bg-white text-foreground shadow"
                  >
                    <X className="size-4" />
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

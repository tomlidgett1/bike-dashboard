"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Globe,
  Upload,
  FileSpreadsheet,
  Loader2,
  X,
  Sparkles,
  Check,
  CheckCircle2,
  AlertCircle,
  Search,
  Star,
  Plus,
  Wand2,
  Eye,
  RefreshCw,
  Package,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  buildSpeedSearchQuery,
  fetchSerperCandidates,
  runWithConcurrency,
  type SpeedSearchCandidate,
  type SpeedWorkbenchProduct,
} from "@/lib/admin/image-qa-speed";
import {
  OnlineOnlyBadgeToggle,
  StoreOnlineProductsCsvPanel,
} from "@/components/settings/store-online-products-csv-panel";
import { OnlineProductsGenerationTooltip } from "@/components/settings/online-products-generation-guide";

const ONLINE_ONLY_BADGE_STORAGE_KEY = "yj-online-products-online-only-badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtractedProduct {
  id: string; // local only
  rowIndex?: number;
  name: string;
  brand: string;
  price: number | null;
  soh?: number | null;
  category: string;
  subcategory: string;
  description: string;
  specs: string;
  isDuplicate?: boolean;
  duplicateOfId?: string | null;
  duplicateOfName?: string | null;
}

type IntakeMode = "screenshot" | "csv";

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
  selectedCandidates: SpeedSearchCandidate[];
  selectedUrls: string[];
  primaryUrl: string | null;
  reasoning?: string;
  error?: string;
  showAdditional?: boolean;
  reloading?: boolean;
  enhancedUrls?: Record<string, string>;
  enhancingUrls?: string[];
}

type FlowPhase =
  | "idle"
  | "extracting"
  | "review"
  | "searching"
  | "creating"
  | "done";

type UploadKind = "image" | "csv";

type ExtractResponseProduct = {
  rowIndex?: unknown;
  name?: unknown;
  brand?: unknown;
  price?: unknown;
  category?: unknown;
  subcategory?: unknown;
  description?: unknown;
  specs?: unknown;
  isDuplicate?: unknown;
  duplicateOfId?: unknown;
  duplicateOfName?: unknown;
};

const MAX_IMAGES = 6;
const IMAGE_CONCURRENCY = 2;

const CATEGORIES = ["Bicycles", "Parts", "Apparel", "Nutrition"] as const;
const SUBCATEGORIES: Record<string, string[]> = {
  Bicycles: ["Road", "Mountain", "Hybrid", "Electric", "Kids", "BMX", "Cruiser", "Other"],
  Parts: ["Frames", "Wheels", "Drivetrain", "Brakes", "Handlebars", "Saddles", "Pedals", "Other"],
  Apparel: ["Jerseys", "Shorts", "Jackets", "Gloves", "Shoes", "Helmets", "Other"],
  Nutrition: ["Energy Bars", "Gels", "Drinks", "Supplements", "Other"],
};

function emptyImageState(): ImageState {
  return {
    phase: "idle",
    candidates: [],
    selectedCandidates: [],
    selectedUrls: [],
    primaryUrl: null,
  };
}

function toSpeedProduct(p: ExtractedProduct): SpeedWorkbenchProduct {
  return {
    id: p.id,
    normalized_name: p.name,
    display_name: p.name,
    upc: null,
    category: p.subcategory,
    manufacturer: p.brand || null,
    marketplace_category: p.category,
    marketplace_subcategory: p.subcategory,
    image_review_search_query: null,
    store_product_name: p.name,
  };
}

function isCsvFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    file.type === "text/csv" ||
    file.type === "application/csv" ||
    file.type === "application/vnd.ms-excel"
  );
}

function getUploadKind(file: File): UploadKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (isCsvFile(file)) return "csv";
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UploadZone({
  onFile,
  onInvalid,
  disabled,
}: {
  onFile: (file: File) => void;
  onInvalid: () => void;
  disabled?: boolean;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const handle = (file: File) => {
    if (!getUploadKind(file)) {
      onInvalid();
      return;
    }
    onFile(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      onClick={() => !disabled && ref.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }}
      />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Upload className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Upload a screenshot or CSV</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          JPG, PNG, or WebP up to 20 MB
        </p>
      </div>
    </div>
  );
}

function ProductEditRow({
  product,
  imageState,
  expanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onSetPrimary,
  onRemoveImage,
  onAddCandidate,
  onToggleAdditional,
  onEnhance,
  onLightbox,
  disabled,
  showDuplicateBadge,
}: {
  product: ExtractedProduct;
  imageState: ImageState;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<ExtractedProduct>) => void;
  onDelete: () => void;
  onSetPrimary: (url: string) => void;
  onRemoveImage: (url: string) => void;
  onAddCandidate: (c: SpeedSearchCandidate) => void;
  onToggleAdditional: () => void;
  onEnhance: (url: string) => void;
  onLightbox: (url: string) => void;
  disabled?: boolean;
  showDuplicateBadge?: boolean;
}) {
  const img = imageState;
  const thumb = img.primaryUrl || img.selectedUrls[0] || null;
  const imgBusy = img.phase === "searching" || img.phase === "selecting" || img.phase === "saving";

  const imageStatusBadge = () => {
    if (img.phase === "done") return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" /> Images ready
      </span>
    );
    if (img.phase === "ready") return (
      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
        <Eye className="h-3 w-3" /> Review images
      </span>
    );
    if (imgBusy) return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {img.phase === "searching" ? "Searching…" : img.phase === "selecting" ? "AI selecting…" : "Saving…"}
      </span>
    );
    if (img.phase === "no_results" || img.phase === "error") return (
      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
        <AlertCircle className="h-3 w-3" /> {img.phase === "no_results" ? "No images found" : "Failed"}
      </span>
    );
    return null;
  };

  return (
    <div
      className={cn(
        "border-b border-border last:border-0",
        showDuplicateBadge && product.isDuplicate && "bg-amber-50/60 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Thumbnail */}
        <div
          className="relative h-16 w-16 shrink-0 cursor-zoom-in overflow-hidden rounded-lg bg-muted"
          onClick={() => thumb && onLightbox(thumb)}
        >
          {imgBusy && !thumb ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : thumb ? (
            <Image src={thumb} alt="" fill unoptimized className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-6 w-6 text-muted-foreground/40" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {product.brand || "—"} · {product.category}/{product.subcategory}
            {product.price != null ? ` · $${product.price.toFixed(2)}` : ""}
            {product.soh != null ? ` · SOH ${product.soh}` : ""}
          </p>
          {product.description.trim() ? (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-3">
              {product.description}
            </p>
          ) : (
            <p className="mt-1.5 text-xs italic text-muted-foreground">No description generated</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {showDuplicateBadge && product.isDuplicate && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:border-amber-800 dark:bg-background dark:text-amber-200">
                <AlertCircle className="h-3 w-3" />
                Duplicate
                {product.duplicateOfName ? ` · ${product.duplicateOfName}` : ""}
              </span>
            )}
            {imageStatusBadge()}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            aria-label="Remove product"
            className="rounded-md p-1 text-muted-foreground/40 transition hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label="Toggle details"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 bg-muted/20 px-4 pb-4 pt-3 space-y-3">
          {/* Edit fields */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Product Name</Label>
              <Input
                value={product.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                disabled={disabled}
                className="h-8 rounded-md text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Brand</Label>
              <Input
                value={product.brand}
                onChange={(e) => onUpdate({ brand: e.target.value })}
                disabled={disabled}
                className="h-8 rounded-md text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Price (AUD)</Label>
              <Input
                type="number"
                value={product.price ?? ""}
                onChange={(e) => onUpdate({ price: e.target.value ? parseFloat(e.target.value) : null })}
                disabled={disabled}
                className="h-8 rounded-md text-sm"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Category</Label>
              <Select
                value={product.category}
                onValueChange={(v) => onUpdate({ category: v, subcategory: SUBCATEGORIES[v]?.[0] ?? "" })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 rounded-md text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs font-medium">Subcategory</Label>
              <Select
                value={product.subcategory}
                onValueChange={(v) => onUpdate({ subcategory: v })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 rounded-md text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(SUBCATEGORIES[product.category] ?? []).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs font-medium">Description</Label>
              <textarea
                value={product.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                disabled={disabled}
                rows={4}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="AI-generated description will appear here…"
              />
            </div>
            {product.specs.trim() ? (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-medium">Specs</Label>
                <p className="whitespace-pre-line rounded-md border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
                  {product.specs}
                </p>
              </div>
            ) : null}
          </div>

          {/* Image review */}
          {(img.phase !== "idle" || img.selectedUrls.length > 0) && (
            <ImageReviewBlock
              img={img}
              onSetPrimary={onSetPrimary}
              onRemove={onRemoveImage}
              onAdd={onAddCandidate}
              onToggleAdditional={onToggleAdditional}
              onEnhance={onEnhance}
              onLightbox={onLightbox}
              saving={img.phase === "saving"}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ImageReviewBlock({
  img,
  onSetPrimary,
  onRemove,
  onAdd,
  onToggleAdditional,
  onEnhance,
  onLightbox,
  saving,
}: {
  img: ImageState;
  onSetPrimary: (url: string) => void;
  onRemove: (url: string) => void;
  onAdd: (c: SpeedSearchCandidate) => void;
  onToggleAdditional: () => void;
  onEnhance: (url: string) => void;
  onLightbox: (url: string) => void;
  saving: boolean;
}) {
  const editable = img.phase === "ready" || img.phase === "done";
  const busy = img.phase === "searching" || img.phase === "selecting" || saving;
  const extra = img.candidates.filter((c) => !img.selectedUrls.includes(c.url));

  if (img.phase === "no_results" || img.phase === "error") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {img.error || "No images found — try a different search"}
      </div>
    );
  }

  if (busy && img.selectedUrls.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        {img.phase === "searching" ? "Searching for images…" : "AI selecting best images…"}
      </div>
    );
  }

  if (img.selectedUrls.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        {img.phase === "done" ? (
          <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> {img.selectedUrls.length} image{img.selectedUrls.length === 1 ? "" : "s"} selected</>
        ) : (
          <><Eye className="h-3.5 w-3.5 text-primary" /> AI picked {img.selectedUrls.length} — set primary, remove unwanted</>
        )}
        {editable && (
          <button
            type="button"
            onClick={onToggleAdditional}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            {img.showAdditional ? "Hide more" : "More"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {img.selectedUrls.map((url) => {
          const candidate = img.candidates.find((c) => c.url === url);
          const isEnhanced = !!img.enhancedUrls?.[url];
          const displaySrc = isEnhanced ? img.enhancedUrls![url] : (candidate?.thumbnailUrl ?? url);
          const isEnhancing = (img.enhancingUrls ?? []).includes(url);
          const primary = url === img.primaryUrl;
          return (
            <div
              key={url}
              role="button"
              tabIndex={0}
              aria-label="View full image"
              onClick={() => onLightbox(isEnhanced ? img.enhancedUrls![url] : url)}
              onKeyDown={(e) => e.key === "Enter" && onLightbox(url)}
              className={cn(
                "group relative aspect-square cursor-zoom-in overflow-hidden rounded-md border bg-muted",
                primary ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border",
              )}
            >
              <Image src={displaySrc} alt="" fill unoptimized className="object-cover" />
              {primary && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground shadow-sm">
                  <Star className="h-2 w-2 fill-current" /> Primary
                </span>
              )}
              {isEnhancing && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {editable && !isEnhancing && (
                <>
                  {img.selectedUrls.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={(e) => { e.stopPropagation(); onRemove(url); }}
                      className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition hover:bg-background hover:text-foreground group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {!isEnhanced && (
                    <button
                      type="button"
                      aria-label="Remove background"
                      onClick={(e) => { e.stopPropagation(); onEnhance(url); }}
                      className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[9px] font-medium text-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100"
                    >
                      <Wand2 className="h-2.5 w-2.5" /> BG
                    </button>
                  )}
                  {!primary && (
                    <button
                      type="button"
                      aria-label="Set as primary"
                      onClick={(e) => { e.stopPropagation(); onSetPrimary(url); }}
                      className="absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100"
                    >
                      <Star className="h-2.5 w-2.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {editable && img.showAdditional && extra.length > 0 && (
        <div className="mt-2">
          <div className="mb-1.5 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">More candidates</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid max-h-48 grid-cols-6 gap-1.5 overflow-y-auto">
            {extra.map((c) => {
              const atMax = img.selectedUrls.length >= MAX_IMAGES;
              return (
                <div key={c.url} className="group relative aspect-square overflow-hidden rounded-md border border-dashed border-border bg-muted/50">
                  <Image src={c.thumbnailUrl || c.url} alt="" fill unoptimized className="object-cover opacity-80" />
                  {!atMax && (
                    <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition group-hover:bg-foreground/30 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => onAdd(c)}
                        className="inline-flex items-center gap-1 rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm"
                      >
                        <Plus className="h-2.5 w-2.5" /> Add
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StoreOnlineProductsManager() {
  const router = useRouter();

  // Flow state
  const [phase, setPhase] = React.useState<FlowPhase>("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Upload
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploadKind, setUploadKind] = React.useState<UploadKind | null>(null);
  const [uploadPreview, setUploadPreview] = React.useState<string | null>(null);

  // Extracted products
  const [intakeMode, setIntakeMode] = React.useState<IntakeMode>("csv");
  const [products, setProducts] = React.useState<ExtractedProduct[]>([]);

  // Per-product image state
  const [imageStates, setImageStates] = React.useState<Record<string, ImageState>>({});

  // UI
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [imageBatchSize, setImageBatchSize] = React.useState<string>("10");
  const [onlineOnlyBadge, setOnlineOnlyBadge] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(ONLINE_ONLY_BADGE_STORAGE_KEY);
      if (stored === "1") setOnlineOnlyBadge(true);
    } catch {
      /* ignore */
    }
  }, []);

  const handleOnlineOnlyBadgeChange = React.useCallback((value: boolean) => {
    setOnlineOnlyBadge(value);
    try {
      localStorage.setItem(ONLINE_ONLY_BADGE_STORAGE_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  // Refs for async ops
  const productsRef = React.useRef(products);
  const imageStatesRef = React.useRef(imageStates);
  React.useEffect(() => { productsRef.current = products; }, [products]);
  React.useEffect(() => { imageStatesRef.current = imageStates; }, [imageStates]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Upload handlers ──────────────────────────────────────────────────────────

  const resetFlow = React.useCallback(() => {
    setPhase("idle");
    setUploadFile(null);
    setUploadKind(null);
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(null);
    setProducts([]);
    setImageStates({});
    setExpanded(new Set());
    setErrorMsg(null);
  }, [uploadPreview]);

  const handleFile = (file: File) => {
    const kind = getUploadKind(file);
    if (kind !== "image") {
      setErrorMsg("Use the CSV catalog tab to upload CSV files.");
      return;
    }

    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(file);
    setUploadKind("image");
    setUploadPreview(URL.createObjectURL(file));
    setPhase("idle");
    setProducts([]);
    setImageStates({});
    setExpanded(new Set());
    setErrorMsg(null);
  };

  const backToCsvTable = () => {
    setProducts([]);
    setImageStates({});
    setExpanded(new Set());
    setPhase("idle");
    setErrorMsg(null);
  };

  const handleExtract = async () => {
    if (!uploadFile || uploadKind !== "image") return;
    setPhase("extracting");
    setErrorMsg(null);

    try {
      const fd = new FormData();
      fd.append("image", uploadFile);
      const res = await fetch("/api/store/online-products/extract", { method: "POST", body: fd });
      const data = await res.json() as { success?: boolean; error?: string; products?: unknown };
      if (!res.ok || !data.success) throw new Error(data.error || "Extraction failed");

      const rawProducts = Array.isArray(data.products) ? data.products as ExtractResponseProduct[] : [];
      const extracted: ExtractedProduct[] = rawProducts.map((p, i) => ({
        id: `extract-${i}-${Date.now()}`,
        name: typeof p.name === "string" && p.name.trim() ? p.name : "Unknown Product",
        brand: typeof p.brand === "string" ? p.brand : "",
        price: typeof p.price === "number" ? p.price : null,
        category: typeof p.category === "string" && p.category.trim() ? p.category : "Parts",
        subcategory: typeof p.subcategory === "string" && p.subcategory.trim() ? p.subcategory : "Other",
        description: typeof p.description === "string" ? p.description : "",
        specs: typeof p.specs === "string" ? p.specs : "",
      }));

      if (extracted.length === 0) {
        setErrorMsg("No products found in this screenshot. Try a clearer image of a product listing page.");
        setPhase("idle");
        return;
      }

      setProducts(extracted);
      setImageStates(Object.fromEntries(extracted.map((p) => [p.id, emptyImageState()])));
      setExpanded(new Set());
      setPhase("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Extraction failed");
      setPhase("idle");
    }
  };

  // ── Image search ─────────────────────────────────────────────────────────────

  const patchImg = React.useCallback(
    (id: string, patch: Partial<ImageState> | ((prev: ImageState) => Partial<ImageState>)) =>
      setImageStates((prev) => {
        const cur = prev[id] ?? emptyImageState();
        const next = typeof patch === "function" ? patch(cur) : patch;
        return { ...prev, [id]: { ...cur, ...next } };
      }),
    [],
  );

  const runImageSearch = React.useCallback(
    async (product: ExtractedProduct) => {
      const id = product.id;
      const sp = toSpeedProduct(product);
      try {
        patchImg(id, { phase: "searching" });
        const searchQuery = buildSpeedSearchQuery(sp);
        const candidates = await fetchSerperCandidates(sp, searchQuery);
        if (candidates.length === 0) {
          patchImg(id, { phase: "no_results", error: "No images found" });
          return;
        }
        patchImg(id, { phase: "selecting", candidates });

        const selRes = await fetch("/api/admin/images/ai-select-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: product.name,
            brand: product.brand || undefined,
            candidates,
            maxImages: MAX_IMAGES,
          }),
        });
        const selJson = await selRes.json();
        if (!selRes.ok || !selJson.success || !selJson.primaryUrl) {
          throw new Error(selJson.error || "AI selection failed");
        }
        patchImg(id, {
          phase: "ready",
          selectedCandidates: selJson.selectedCandidates,
          selectedUrls: selJson.selectedUrls,
          primaryUrl: selJson.primaryUrl,
          reasoning: selJson.reasoning,
        });
      } catch (err) {
        patchImg(id, {
          phase: "error",
          error: err instanceof Error ? err.message : "Image search failed",
        });
      }
    },
    [patchImg],
  );

  const pendingImageSearch = React.useMemo(
    () =>
      products.filter((p) => {
        const s = imageStates[p.id];
        return !s || s.phase === "idle";
      }),
    [products, imageStates],
  );

  const imageBatchLimit = imageBatchSize === "all" ? pendingImageSearch.length : Number(imageBatchSize);

  const handleFindImages = async () => {
    const batch = pendingImageSearch.slice(0, imageBatchLimit);
    if (batch.length === 0) return;
    setPhase("searching");
    const tasks = batch.map((p) => () => runImageSearch(p));
    await runWithConcurrency(tasks, IMAGE_CONCURRENCY);
    setPhase("review");
  };

  // ── Image edits ──────────────────────────────────────────────────────────────

  const setPrimary = (id: string, url: string) =>
    patchImg(id, (prev) =>
      prev.selectedUrls.includes(url) ? { primaryUrl: url } : {},
    );

  const removeImage = (id: string, url: string) =>
    patchImg(id, (prev) => {
      if (prev.selectedUrls.length <= 1) return {};
      const selectedUrls = prev.selectedUrls.filter((u) => u !== url);
      const selectedCandidates = prev.selectedCandidates.filter((c) => c.url !== url);
      const primaryUrl = prev.primaryUrl === url ? selectedUrls[0] ?? null : prev.primaryUrl;
      return { selectedUrls, selectedCandidates, primaryUrl };
    });

  const addCandidate = (id: string, c: SpeedSearchCandidate) =>
    patchImg(id, (prev) => {
      if (prev.selectedUrls.includes(c.url) || prev.selectedUrls.length >= MAX_IMAGES) return {};
      return {
        selectedUrls: [...prev.selectedUrls, c.url],
        selectedCandidates: [...prev.selectedCandidates, c],
        primaryUrl: prev.primaryUrl ?? c.url,
      };
    });

  const toggleAdditional = (id: string) =>
    patchImg(id, (prev) => ({ showAdditional: !prev.showAdditional }));

  const enhanceImage = React.useCallback(async (id: string, url: string) => {
    const cur = imageStatesRef.current[id];
    if ((cur?.enhancingUrls ?? []).includes(url)) return;
    patchImg(id, (prev) => ({ enhancingUrls: [...(prev.enhancingUrls ?? []), url] }));
    try {
      const res = await fetch("/api/admin/images/enhance-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.url) throw new Error("Enhancement failed");
      const enhanced: string = json.url;
      patchImg(id, (prev) => ({
        selectedUrls: prev.selectedUrls.map((u) => (u === url ? enhanced : u)),
        selectedCandidates: prev.selectedCandidates.map((c) =>
          c.url === url ? { ...c, url: enhanced, thumbnailUrl: json.thumbnailUrl ?? enhanced } : c,
        ),
        primaryUrl: prev.primaryUrl === url ? enhanced : prev.primaryUrl,
        enhancedUrls: { ...(prev.enhancedUrls ?? {}), [url]: enhanced },
        enhancingUrls: (prev.enhancingUrls ?? []).filter((u) => u !== url),
      }));
    } catch {
      patchImg(id, (prev) => ({ enhancingUrls: (prev.enhancingUrls ?? []).filter((u) => u !== url) }));
    }
  }, [patchImg]);

  // ── Create products ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setPhase("creating");
    setErrorMsg(null);

    const toCreate = products
      .filter((p) => {
        if (p.isDuplicate) return false;
        const img = imageStates[p.id];
        return img && (img.phase === "ready" || img.phase === "done" || img.phase === "idle") && p.price != null;
      })
      .map((p) => {
        const img = imageStates[p.id] ?? emptyImageState();
        return {
          name: p.name,
          brand: p.brand || null,
          price: p.price!,
          soh: p.soh ?? null,
          description: p.description || null,
          specs: p.specs || null,
          category: p.category,
          subcategory: p.subcategory,
          selectedCandidates: img.selectedCandidates,
          primaryUrl: img.primaryUrl || img.selectedUrls[0] || "",
        };
      });

    try {
      const res = await fetch("/api/store/online-products/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: toCreate, onlineOnly: onlineOnlyBadge }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create products");
      if (data.created === 0) {
        const detail = data.errors?.length ? data.errors[0] : "No products were saved";
        throw new Error(detail);
      }
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create products");
      setPhase("review");
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const allSearched = products.length > 0 && products.every((p) => {
    const s = imageStates[p.id];
    return s && !["idle", "searching", "selecting"].includes(s.phase);
  });

  const readyCount = products.filter((p) => {
    if (p.isDuplicate) return false;
    const s = imageStates[p.id];
    return s && (s.phase === "ready" || s.phase === "done") && p.price != null;
  }).length;

  const searching = products.some((p) => {
    const s = imageStates[p.id];
    return s && (s.phase === "searching" || s.phase === "selecting");
  });

  const isCreating = phase === "creating";
  const pendingImageCount = pendingImageSearch.length;
  const nextBatchCount = Math.min(imageBatchLimit, pendingImageCount);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/10 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">Products created!</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            {onlineOnlyBadge
              ? "Your online-only products have been saved. Images are uploading in the background — they'll appear on the marketplace once processing completes."
              : "Your store products have been saved without the Online Only badge. Images are uploading in the background — they'll appear on the marketplace once processing completes."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetFlow}>
            Add more products
          </Button>
          <Button size="sm" onClick={() => router.push("/products")}>
            <Sparkles className="size-4" />
            View My Products
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Error banner */}
      {errorMsg && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      {/* Intake mode tabs */}
      {products.length === 0 && (
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          <button
            type="button"
            onClick={() => setIntakeMode("csv")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              intakeMode === "csv"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <FileSpreadsheet size={15} />
            CSV catalog
          </button>
          <button
            type="button"
            onClick={() => setIntakeMode("screenshot")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              intakeMode === "screenshot"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Upload size={15} />
            Screenshot
          </button>
        </div>
      )}

      {intakeMode === "csv" && products.length === 0 && (
        <StoreOnlineProductsCsvPanel onError={setErrorMsg} />
      )}

      {intakeMode === "screenshot" && products.length === 0 && (
        <OnlineOnlyBadgeToggle
          value={onlineOnlyBadge}
          onChange={handleOnlineOnlyBadgeChange}
          disabled={phase === "extracting"}
        />
      )}

      {/* Screenshot upload */}
      {intakeMode === "screenshot" && products.length === 0 && !uploadFile ? (
        <UploadZone
          onFile={handleFile}
          onInvalid={() => setErrorMsg("Upload a screenshot image (JPG, PNG, or WebP).")}
          disabled={phase === "extracting"}
        />
      ) : null}

      {intakeMode === "screenshot" && products.length === 0 && uploadFile ? (
        <div className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-4">
            {uploadPreview ? (
              <div
                className="relative h-24 w-24 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted"
                onClick={() => setLightbox(uploadPreview)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadPreview} alt="Screenshot preview" className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{uploadFile.name}</p>
              <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(0)} KB</p>
              {phase === "idle" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Click <strong>Analyse</strong> to extract products from this screenshot.
                </p>
              )}
              {phase === "extracting" && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analysing screenshot…
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {phase !== "extracting" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFlow}
                >
                  <X className="size-4" /> Change
                </Button>
              )}
              {(phase === "idle" || phase === "extracting") && products.length === 0 && (
                <Button size="sm" onClick={handleExtract} disabled={phase === "extracting"}>
                  {phase === "extracting" ? (
                    <><Loader2 className="size-4 animate-spin" /> Analysing…</>
                  ) : (
                    <><Sparkles className="size-4" /> Analyse screenshot</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Extracted products list */}
      {products.length > 0 && (
        <>
          <OnlineOnlyBadgeToggle
            value={onlineOnlyBadge}
            onChange={handleOnlineOnlyBadgeChange}
            disabled={isCreating || searching}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {intakeMode === "csv" && (
                <Button size="sm" variant="outline" onClick={backToCsvTable}>
                  <FileSpreadsheet className="size-4" />
                  Back to CSV table
                </Button>
              )}
              <span className="text-sm font-semibold text-foreground">
                {products.length} product{products.length === 1 ? "" : "s"} — catalogue fields done, images next
              </span>
              {pendingImageCount > 0 && !allSearched && (
                <span className="text-xs text-muted-foreground">
                  · {pendingImageCount} need image search
                </span>
              )}
              {allSearched && readyCount > 0 && (
                <span className="text-xs text-muted-foreground">· {readyCount} with images</span>
              )}
              <OnlineProductsGenerationTooltip />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(phase === "review" || phase === "searching") && pendingImageCount > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="image-batch-size" className="text-xs text-muted-foreground whitespace-nowrap">
                      Images per batch
                    </Label>
                    <Select
                      value={imageBatchSize}
                      onValueChange={setImageBatchSize}
                      disabled={searching || isCreating}
                    >
                      <SelectTrigger id="image-batch-size" className="h-8 w-[120px] rounded-md text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 products</SelectItem>
                        <SelectItem value="10">10 products</SelectItem>
                        <SelectItem value="20">20 products</SelectItem>
                        <SelectItem value="50">50 products</SelectItem>
                        <SelectItem value="all">All remaining</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFindImages}
                    disabled={searching || isCreating}
                  >
                    {searching ? (
                      <><Loader2 className="size-4 animate-spin" /> Finding images…</>
                    ) : (
                      <>
                        <Search className="size-4" />
                        Find images
                        {imageBatchSize === "all"
                          ? ` (${pendingImageCount})`
                          : ` (next ${nextBatchCount})`}
                      </>
                    )}
                  </Button>
                </>
              )}
              {allSearched && readyCount > 0 && (
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <><Loader2 className="size-4 animate-spin" /> Creating…</>
                  ) : onlineOnlyBadge ? (
                    <><Globe className="size-4" /> Create {readyCount} online product{readyCount === 1 ? "" : "s"}</>
                  ) : (
                    <><Package className="size-4" /> Create {readyCount} store product{readyCount === 1 ? "" : "s"}</>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border/60">
              {products.map((product) => (
                <ProductEditRow
                  key={product.id}
                  product={product}
                  imageState={imageStates[product.id] ?? emptyImageState()}
                  expanded={expanded.has(product.id)}
                  onToggleExpand={() => setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(product.id)) next.delete(product.id);
                    else next.add(product.id);
                    return next;
                  })}
                  onUpdate={(patch) => setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, ...patch } : p))}
                  onDelete={() => setProducts((prev) => prev.filter((p) => p.id !== product.id))}
                  onSetPrimary={(url) => setPrimary(product.id, url)}
                  onRemoveImage={(url) => removeImage(product.id, url)}
                  onAddCandidate={(c) => addCandidate(product.id, c)}
                  onToggleAdditional={() => toggleAdditional(product.id)}
                  onEnhance={(url) => void enhanceImage(product.id, url)}
                  onLightbox={setLightbox}
                  disabled={isCreating || searching}
                  showDuplicateBadge={intakeMode === "csv"}
                />
              ))}
          </div>

          {/* Bottom action bar */}
          {(phase === "review" || phase === "searching") && (
            <div className="flex flex-wrap justify-end items-center gap-2">
              {pendingImageCount > 0 && (
                <>
                  <Select
                    value={imageBatchSize}
                    onValueChange={setImageBatchSize}
                    disabled={searching}
                  >
                    <SelectTrigger className="h-8 w-[120px] rounded-md text-xs">
                      <SelectValue placeholder="Batch size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 products</SelectItem>
                      <SelectItem value="10">10 products</SelectItem>
                      <SelectItem value="20">20 products</SelectItem>
                      <SelectItem value="50">50 products</SelectItem>
                      <SelectItem value="all">All remaining</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFindImages}
                    disabled={searching}
                  >
                    {searching ? (
                      <><Loader2 className="size-4 animate-spin" /> Finding…</>
                    ) : (
                      <>
                        <Search className="size-4" />
                        Find images
                        {imageBatchSize === "all"
                          ? ` (${pendingImageCount})`
                          : ` (next ${nextBatchCount})`}
                      </>
                    )}
                  </Button>
                </>
              )}
              {allSearched && readyCount > 0 && (
                <Button size="sm" onClick={handleCreate} disabled={isCreating}>
                  {isCreating ? (
                    <><Loader2 className="size-4 animate-spin" /> Creating…</>
                  ) : (
                    <><Globe className="size-4" /> Create {readyCount} Product{readyCount === 1 ? "" : "s"}</>
                  )}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/85 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Full-size preview"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg transition hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

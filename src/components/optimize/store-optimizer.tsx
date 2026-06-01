"use client";

import * as React from "react";
import Image from "next/image";
import {
  Sparkles,
  Loader2,
  Package,
  ImageIcon,
  Wand2,
  Type,
  FileText,
  ListChecks,
  Check,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  StopCircle,
  Layers,
  Star,
  X,
  Plus,
  ZoomIn,
  Eye,
  Square,
  CheckSquare,
  Ban,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

// ── Types ───────────────────────────────────────────────────────────────────

interface CanonicalImage {
  id: string;
  cloudinary_public_id: string | null;
  cloudinary_url: string | null;
  external_url: string | null;
  is_primary: boolean | null;
  approval_status: string | null;
  sort_order: number | null;
}

interface OptimizerProduct {
  id: string;
  canonical_product_id: string | null;
  description: string;
  display_name: string | null;
  product_description: string | null;
  product_specs: string | null;
  brand: string | null;
  upc: string | null;
  category_name: string | null;
  price: number;
  qoh: number;
  resolved_image_url: string | null;
  primary_image_url: string | null;
  canonical_images: CanonicalImage[];
  canonical_products?: {
    id: string;
    upc: string | null;
    normalized_name: string | null;
  } | null;
}

type DimKey = "image" | "title" | "description" | "specs";
const DIMS: DimKey[] = ["image", "title", "description", "specs"];
type Focus = Record<DimKey, boolean>;
type Picks = Record<DimKey, boolean>;

type TextStatus = "idle" | "queued" | "running" | "done" | "error";
interface TextStep {
  status: TextStatus;
  detail?: string;
}

type ImagePhase =
  | "idle"
  | "queued"
  | "searching"
  | "selecting"
  | "ready"
  | "saving"
  | "done"
  | "no_results"
  | "error";

interface ImageRun {
  phase: ImagePhase;
  candidates: SpeedSearchCandidate[];
  selectedCandidates: SpeedSearchCandidate[];
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

interface RowRun {
  title: TextStep;
  description: TextStep;
  specs: TextStep;
  image: ImageRun;
}

interface CategoryOption {
  id: string;           // lightspeed_category_id — used to filter products
  name: string;         // human-readable name from Lightspeed API
  count: number;        // total active products in category
  missingImages: number; // products with no approved image
}

interface RejectedDetail {
  id: string;
  product_id: string;
  description: string;
  display_name: string | null;
  brand: string | null;
  category_name: string | null;
  price: number;
  qoh: number;
}

const IMAGE_CONCURRENCY = 2;
const MAX_SELECTED_IMAGES = 6;

const emptyText = (): TextStep => ({ status: "idle" });
const emptyImageRun = (): ImageRun => ({
  phase: "idle",
  candidates: [],
  selectedCandidates: [],
  selectedUrls: [],
  primaryUrl: null,
});
const emptyRun = (): RowRun => ({
  title: emptyText(),
  description: emptyText(),
  specs: emptyText(),
  image: emptyImageRun(),
});

// ── Helpers ───────────────────────────────────────────────────────────────

function hasImage(p: OptimizerProduct) {
  return !!(p.resolved_image_url || p.primary_image_url);
}
function hasTitle(p: OptimizerProduct) {
  return !!p.display_name;
}
function hasDesc(p: OptimizerProduct) {
  return !!p.product_description;
}
function hasSpecs(p: OptimizerProduct) {
  return !!p.product_specs;
}

function hasDim(p: OptimizerProduct, dim: DimKey) {
  switch (dim) {
    case "image":
      return hasImage(p);
    case "title":
      return hasTitle(p);
    case "description":
      return hasDesc(p);
    case "specs":
      return hasSpecs(p);
  }
}

function defaultPicks(p: OptimizerProduct, focus: Focus): Picks {
  return {
    image: focus.image && !hasImage(p),
    title: focus.title && !hasTitle(p),
    description: focus.description && !hasDesc(p),
    specs: focus.specs && !hasSpecs(p),
  };
}

function emptyPicks(): Picks {
  return { image: false, title: false, description: false, specs: false };
}

function anyPick(pk: Picks | undefined) {
  return !!pk && (pk.image || pk.title || pk.description || pk.specs);
}

function isTouched(run: RowRun | undefined) {
  if (!run) return false;
  return (
    run.title.status !== "idle" ||
    run.description.status !== "idle" ||
    run.specs.status !== "idle" ||
    run.image.phase !== "idle"
  );
}

function toSpeedProduct(p: OptimizerProduct): SpeedWorkbenchProduct {
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

const IMG_BUSY: ImagePhase[] = ["queued", "searching", "selecting", "saving"];

// ── Status chip ─────────────────────────────────────────────────────────────

type PillState = "done" | "working" | "review" | "error" | "picked" | "off";

const DIM_META: Record<
  DimKey,
  {
    icon: React.ComponentType<{ className?: string }>;
    noun: string;
    pick: string;
    working: string;
  }
> = {
  image: { icon: ImageIcon, noun: "Photos", pick: "Add photos", working: "Finding photos" },
  title: { icon: Type, noun: "Title", pick: "Fix title", working: "Fixing title" },
  description: {
    icon: FileText,
    noun: "Description",
    pick: "Write description",
    working: "Writing description",
  },
  specs: { icon: ListChecks, noun: "Specs", pick: "Add specs", working: "Writing specs" },
};

function pillState(
  p: OptimizerProduct,
  dim: DimKey,
  run: RowRun,
  pk: Picks | undefined,
  redo?: Picks,
): PillState {
  if (dim === "image") {
    const img = run.image;
    if (img.phase === "ready") return "review";
    if (IMG_BUSY.includes(img.phase)) return "working";
    if (img.phase === "error" || img.phase === "no_results") return "error";
    if (redo?.image) return "picked";
    if (img.phase === "done" || hasImage(p)) return "done";
    return pk?.image ? "picked" : "off";
  }
  const step = dim === "title" ? run.title : dim === "description" ? run.description : run.specs;
  if (step.status === "queued" || step.status === "running") return "working";
  if (step.status === "error") return "error";
  // Redo: user clicked a done pill to re-queue it
  if (redo?.[dim]) return "picked";
  if (hasDim(p, dim) || step.status === "done") return "done";
  return pk?.[dim] ? "picked" : "off";
}

// Dimensions the user has ticked that are still pending (not done/working/etc.).
function pendingDims(
  p: OptimizerProduct,
  run: RowRun,
  pk: Picks | undefined,
  redo?: Picks,
): DimKey[] {
  return DIMS.filter((d) => pillState(p, d, run, pk, redo) === "picked");
}

function DimPill({
  dim,
  state,
  onToggle,
  disabled,
  canRedo,
}: {
  dim: DimKey;
  state: PillState;
  onToggle: () => void;
  disabled?: boolean;
  canRedo?: boolean;
}) {
  const meta = DIM_META[dim];
  const clickable = (state === "picked" || state === "off" || (state === "done" && canRedo)) && !disabled;

  const label =
    state === "done"
      ? meta.noun
      : state === "working"
        ? meta.working
        : state === "review"
          ? `Review ${meta.noun.toLowerCase()}`
          : state === "error"
            ? `${meta.noun} failed`
            : meta.pick;

  const lead =
    state === "working" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : state === "error" ? (
      <AlertCircle className="h-3.5 w-3.5" />
    ) : state === "review" ? (
      <Eye className="h-3.5 w-3.5" />
    ) : state === "done" ? (
      <Check className="h-3.5 w-3.5" />
    ) : state === "picked" ? (
      <CheckSquare className="h-3.5 w-3.5" />
    ) : (
      <Square className="h-3.5 w-3.5" />
    );

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? onToggle : undefined}
      aria-pressed={state === "picked"}
      title={
        state === "picked"
          ? `Will ${meta.pick.toLowerCase()} — tap to skip`
          : state === "done" && canRedo
            ? `Tap to redo ${meta.noun.toLowerCase()}`
            : state === "done"
              ? `${meta.noun} already done`
              : state === "off"
                ? `Tap to ${meta.pick.toLowerCase()}`
                : label
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
        clickable ? "cursor-pointer" : "cursor-default",
        state === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        state === "working" && "border-primary/40 bg-primary/10 text-foreground",
        state === "review" && "border-primary bg-primary/15 text-foreground",
        state === "done" && !canRedo &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        state === "done" && canRedo &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:border-emerald-500/60 hover:bg-emerald-500/20 dark:text-emerald-400",
        state === "picked" && "border-primary bg-primary/10 text-foreground hover:bg-primary/15",
        state === "off" && "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {lead}
      {label}
    </button>
  );
}

const IMG_PHASE_LABEL: Partial<Record<ImagePhase, string>> = {
  queued: "Queued",
  searching: "Searching images…",
  selecting: "AI selecting…",
  ready: "Review picks",
  saving: "Saving…",
  no_results: "No images found",
  error: "Failed",
};

// ── Operation toggle ─────────────────────────────────────────────────────────

function OpToggle({
  icon: Icon,
  label,
  active,
  count,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
        active
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-card hover:bg-accent",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-none text-foreground">
          {label}
        </span>
        <span className="mt-1 block text-[11px] leading-none text-muted-foreground">
          {count} missing
        </span>
      </span>
    </button>
  );
}

// ── Image review block (mirrors the autopilot reviewer) ──────────────────────

function ImageReview({
  img,
  hasCanonical,
  onSetPrimary,
  onRemove,
  onAdd,
  onEnhance,
  onToggleAdditional,
  onApprove,
  onLightbox,
  saving,
  panelMode,
}: {
  img: ImageRun;
  hasCanonical: boolean;
  onSetPrimary: (url: string) => void;
  onRemove: (url: string) => void;
  onAdd: (c: SpeedSearchCandidate) => void;
  onEnhance: (url: string) => void;
  onToggleAdditional: () => void;
  onApprove: () => void;
  onLightbox: (url: string) => void;
  saving: boolean;
  panelMode?: boolean;
}) {
  const editable = img.phase === "ready";
  const done = img.phase === "done";

  if (img.phase === "no_results" || img.phase === "error") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {img.error || "Image step failed"}
      </div>
    );
  }

  if (IMG_BUSY.includes(img.phase) && img.selectedUrls.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        {IMG_PHASE_LABEL[img.phase]}
      </div>
    );
  }

  if (img.selectedUrls.length === 0) return null;

  const extra = img.candidates.filter((c) => !img.selectedUrls.includes(c.url));

  const inner = (
    <>
      {/* Header row: reasoning + actions */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          {done ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Saved {img.savedCount ?? img.selectedUrls.length} image
              {(img.savedCount ?? img.selectedUrls.length) === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 text-primary" />
              AI picked {img.selectedUrls.length} — set the primary, remove any you don&apos;t
              want, then approve.
            </>
          )}
        </div>
        {editable && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={img.reloading}
              onClick={onToggleAdditional}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent disabled:opacity-50"
            >
              {img.reloading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {img.showAdditional ? "Hide more" : "More images"}
            </button>
            <Button
              type="button"
              size="sm"
              className="h-7 rounded-md text-xs"
              disabled={saving || !hasCanonical}
              onClick={onApprove}
            >
              {saving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              )}
              Approve ({img.selectedUrls.length})
            </Button>
          </div>
        )}
      </div>

      {img.reasoning && editable && (
        <p className="mb-2 text-[11px] italic text-muted-foreground">{img.reasoning}</p>
      )}

      {!hasCanonical && (
        <p className="mb-2 inline-flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3" />
          Can&apos;t save — not linked to a canonical product. Sync from Lightspeed first.
        </p>
      )}

      {/* Selected grid */}
      <div className={cn("grid gap-2", panelMode ? "grid-cols-6" : "grid-cols-3 sm:grid-cols-6")}>
        {img.selectedUrls.map((url) => {
          const candidate = img.candidates.find((c) => c.url === url);
          const isEnhanced = !!img.enhancedUrls?.[url];
          const displaySrc = isEnhanced
            ? img.enhancedUrls![url]
            : candidate?.thumbnailUrl ?? url;
          const fullSrc = isEnhanced ? img.enhancedUrls![url] : url;
          const primary = url === img.primaryUrl;
          const isEnhancing = (img.enhancingUrls ?? []).includes(url);
          return (
            <div
              key={url}
              role="button"
              tabIndex={0}
              aria-label="View full image"
              onClick={() => onLightbox(fullSrc)}
              onKeyDown={(e) => e.key === "Enter" && onLightbox(fullSrc)}
              className={cn(
                "group relative aspect-square cursor-zoom-in overflow-hidden rounded-md border bg-muted",
                primary
                  ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
                  : "border-border",
              )}
            >
              <Image src={displaySrc} alt="" fill unoptimized className="object-cover" />

              {primary && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  {isEnhanced ? "Primary · BG" : "Primary"}
                </span>
              )}
              {isEnhanced && !primary && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background shadow-sm">
                  <Wand2 className="h-2.5 w-2.5" />
                  BG
                </span>
              )}

              {isEnhancing && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {editable && !isEnhancing && (
                <>
                  {img.selectedUrls.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove image"
                      title="Remove image"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(url);
                      }}
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isEnhanced && (
                    <button
                      type="button"
                      aria-label="Remove background"
                      title="Remove background & add white backdrop"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEnhance(url);
                      }}
                      className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100"
                    >
                      <Wand2 className="h-2.5 w-2.5" />
                      BG
                    </button>
                  )}
                  {!primary && (
                    <button
                      type="button"
                      aria-label="Set as primary"
                      title="Set as primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetPrimary(url);
                      }}
                      className="absolute bottom-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100"
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Additional candidates */}
      {editable && img.showAdditional && (
        <div className="mt-3">
          {extra.length === 0 ? (
            <p className="text-center text-[11px] text-muted-foreground">
              No additional candidates — all results are already selected.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  More candidates
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className={cn("grid gap-2 overflow-y-auto", panelMode ? "max-h-96 grid-cols-6" : "max-h-72 grid-cols-3 sm:grid-cols-6")}>
                {extra.map((c) => {
                  const atMax = img.selectedUrls.length >= MAX_SELECTED_IMAGES;
                  return (
                    <div
                      key={c.url}
                      className="group relative aspect-square overflow-hidden rounded-md border border-dashed border-border bg-muted/50"
                    >
                      <Image
                        src={c.thumbnailUrl || c.url}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover opacity-80"
                      />
                      {!atMax && (
                        <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition group-hover:bg-foreground/30 group-hover:opacity-100">
                          <button
                            type="button"
                            aria-label="Add image"
                            onClick={() => onAdd(c)}
                            className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-[11px] font-medium text-foreground shadow-sm"
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        aria-label="View full image"
                        onClick={() => onLightbox(c.url)}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-sm transition hover:bg-background hover:text-foreground group-hover:opacity-100"
                      >
                        <ZoomIn className="h-3 w-3" />
                      </button>
                      {atMax && (
                        <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1 py-0.5 text-center text-[10px] text-muted-foreground">
                          Max {MAX_SELECTED_IMAGES}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );

  if (panelMode) return inner;
  return <div className="rounded-lg border border-border bg-muted/30 p-3">{inner}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function StoreOptimizer() {
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [category, setCategory] = React.useState<string>("");
  const [products, setProducts] = React.useState<OptimizerProduct[]>([]);
  const [loadingCats, setLoadingCats] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [picks, setPicks] = React.useState<Record<string, Picks>>({});
  const [redos, setRedos] = React.useState<Record<string, Picks>>({});
  const [runs, setRuns] = React.useState<Record<string, RowRun>>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [running, setRunning] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [showCompleted, setShowCompleted] = React.useState(false);
  // Canonical image edit state (keyed by product id)
  const [ciEnhancing, setCiEnhancing] = React.useState<Record<string, string[]>>({});  // productId → imageIds
  const [ciRemoving, setCiRemoving] = React.useState<Record<string, string[]>>({});    // productId → imageIds
  // Rejected products
  const [rejectedIds, setRejectedIds] = React.useState<Set<string>>(new Set());
  const [rejectedDetails, setRejectedDetails] = React.useState<RejectedDetail[]>([]);
  const [showRejected, setShowRejected] = React.useState(false);
  const [runLimit, setRunLimit] = React.useState<number | null>(null);
  const [missingFilter, setMissingFilter] = React.useState<DimKey | null>(null);

  const [focus, setFocus] = React.useState<Focus>({
    image: true,
    title: true,
    description: true,
    specs: true,
  });

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

  // ── Lightbox escape ──────────────────────────────────────────────────────
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Load category list (Lightspeed API → real names + missing image counts) ─
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCats(true);
      try {
        const [scanRes, summaryRes] = await Promise.all([
          fetch("/api/lightspeed/categories/scan"),
          fetch("/api/store/image-summary"),
        ]);
        const scanData = await scanRes.json();
        const summaryData = await summaryRes.json();

        const raw: Array<{ id?: string; name?: string; product_count?: number }> =
          scanData.categories ?? [];

        const missingMap = new Map<string, number>(
          (summaryData.summary ?? []).map(
            (s: { ls_category_id: string; missing_images: number }) =>
              [s.ls_category_id, s.missing_images] as [string, number],
          ),
        );

        const opts: CategoryOption[] = raw
          .filter((c) => c.id)
          .map((c) => ({
            id: c.id!,
            name: c.name || c.id!,
            count: c.product_count ?? 0,
            missingImages: missingMap.get(c.id!) ?? 0,
          }));
        if (!cancelled) setCategories(opts);
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoadingCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load products for a category ────────────────────────────────────────────
  const loadProducts = React.useCallback(
    async (cat: string) => {
      setLoading(true);
      setRuns({});
      setExpanded(new Set());
      try {
        const params = new URLSearchParams({ pageSize: "1000", status: "active" });
        if (cat && cat !== "all") params.set("ls_category_id", cat);
        const res = await fetch(`/api/products?${params.toString()}`);
        const data = await res.json();
        const list: OptimizerProduct[] = (data.products ?? []).map((p: any) => ({
          ...p,
          canonical_images: (p.canonical_products?.product_images ?? []).filter(
            (img: any) => img.approval_status === "approved" || img.approval_status === null,
          ),
        }));
        setProducts(list);
        const nextPicks: Record<string, Picks> = {};
        for (const p of list) nextPicks[p.id] = defaultPicks(p, focus);
        setPicks(nextPicks);
      } catch {
        setProducts([]);
        setPicks({});
      } finally {
        setLoading(false);
      }
    },
    [focus],
  );

  const onCategoryChange = (cat: string) => {
    setCategory(cat);
    setMissingFilter(null);
    void loadProducts(cat);
  };

  // ── Rejected products ────────────────────────────────────────────────────────
  const loadRejected = React.useCallback(async () => {
    try {
      const res = await fetch("/api/products/reject");
      const data = await res.json();
      const list: RejectedDetail[] = data.rejected ?? [];
      setRejectedDetails(list);
      setRejectedIds(new Set(list.map((r) => r.product_id)));
    } catch {
      // non-fatal — rejected list just won't be populated
    }
  }, []);

  React.useEffect(() => {
    void loadRejected();
  }, [loadRejected]);

  const rejectProduct = React.useCallback(async (productId: string) => {
    const product = productsRef.current.find((p) => p.id === productId);
    if (!product) return;
    try {
      await fetch("/api/products/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      setRejectedIds((prev) => new Set([...prev, productId]));
      setRejectedDetails((prev) => [
        {
          id: crypto.randomUUID(),
          product_id: productId,
          description: product.description,
          display_name: product.display_name,
          brand: product.brand,
          category_name: product.category_name,
          price: product.price,
          qoh: product.qoh,
        },
        ...prev,
      ]);
    } catch {
      // ignore — product stays visible
    }
  }, []);

  const restoreProduct = React.useCallback(async (productId: string) => {
    try {
      await fetch("/api/products/reject", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      setRejectedIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
      setRejectedDetails((prev) => prev.filter((r) => r.product_id !== productId));
    } catch {
      // ignore
    }
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (rejectedIds.has(p.id)) return false;
      if (!q) return true;
      return (
        (p.display_name || p.description).toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q)
      );
    });
  }, [products, search, rejectedIds]);

  const counts = React.useMemo(
    () => ({
      image: products.filter((p) => !rejectedIds.has(p.id) && !hasImage(p)).length,
      title: products.filter((p) => !rejectedIds.has(p.id) && !hasTitle(p)).length,
      desc: products.filter((p) => !rejectedIds.has(p.id) && !hasDesc(p)).length,
      specs: products.filter((p) => !rejectedIds.has(p.id) && !hasSpecs(p)).length,
    }),
    [products, rejectedIds],
  );

  const readyImageCount = React.useMemo(
    () => Object.values(runs).filter((r) => r.image.phase === "ready").length,
    [runs],
  );

  // Products to show: those still missing a focused dimension, plus any we've
  // already touched this session (so processed rows don't vanish mid-run).
  // Sliced to runLimit so bulk-tick and run count both respect the batch cap.
  const visible = React.useMemo(() => {
    const all = filtered.filter((p) => {
      if (missingFilter && !showCompleted && hasDim(p, missingFilter)) return false;
      if (showCompleted) return true;
      if (DIMS.some((d) => focus[d] && !hasDim(p, d))) return true;
      return isTouched(runs[p.id]);
    });
    return runLimit === null ? all : all.slice(0, runLimit);
  }, [filtered, showCompleted, focus, runs, runLimit, missingFilter]);

  const productsToRun = React.useMemo(
    () => visible.filter((p) => pendingDims(p, runs[p.id] ?? emptyRun(), picks[p.id], redos[p.id]).length > 0),
    [visible, picks, redos, runs],
  );
  const runCount = productsToRun.length;
  const anyVisiblePicked = visible.some((p) => anyPick(picks[p.id]));

  const togglePick = (id: string, dim: DimKey) => {
    if (running) return;
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const run = runs[id] ?? emptyRun();
    const pk = picks[id];
    const redo = redos[id];
    const state = pillState(p, dim, run, pk, redo);
    if (state === "done") {
      // Queue for redo
      setRedos((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyPicks()), [dim]: true } }));
    } else if (state === "picked" && redo?.[dim]) {
      // Cancel redo — revert to done
      setRedos((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyPicks()), [dim]: false } }));
    } else {
      setPicks((prev) => {
        const cur = prev[id] ?? emptyPicks();
        return { ...prev, [id]: { ...cur, [dim]: !cur[dim] } };
      });
    }
  };

  const toggleAllPicks = () => {
    if (running) return;
    setPicks((prev) => {
      const next = { ...prev };
      if (anyVisiblePicked) {
        for (const p of visible) next[p.id] = emptyPicks();
      } else {
        for (const p of visible) next[p.id] = defaultPicks(p, focus);
      }
      return next;
    });
  };

  const anyDimPicked = React.useCallback(
    (dim: DimKey) =>
      visible.some((p) => pillState(p, dim, runs[p.id] ?? emptyRun(), picks[p.id], redos[p.id]) === "picked"),
    [visible, runs, picks, redos],
  );

  const toggleDimAllPicks = React.useCallback(
    (dim: DimKey) => {
      if (running) return;
      const hasSome = visible.some(
        (p) => pillState(p, dim, runs[p.id] ?? emptyRun(), picks[p.id], redos[p.id]) === "picked",
      );
      setPicks((prev) => {
        const next = { ...prev };
        for (const p of visible) {
          const pk = next[p.id] ?? emptyPicks();
          if (hasSome) {
            next[p.id] = { ...pk, [dim]: false };
          } else {
            const state = pillState(p, dim, runs[p.id] ?? emptyRun(), pk, redos[p.id]);
            if (state === "off") next[p.id] = { ...pk, [dim]: true };
          }
        }
        return next;
      });
      setRedos((prev) => {
        const next = { ...prev };
        for (const p of visible) {
          const rd = next[p.id] ?? emptyPicks();
          if (hasSome) {
            next[p.id] = { ...rd, [dim]: false };
          } else {
            const state = pillState(p, dim, runs[p.id] ?? emptyRun(), picks[p.id], rd);
            if (state === "done") next[p.id] = { ...rd, [dim]: true };
          }
        }
        return next;
      });
    },
    [running, visible, runs, picks, redos],
  );

  const toggleFocus = (dim: DimKey) => {
    if (running) return;
    const nextFocus: Focus = { ...focus, [dim]: !focus[dim] };
    setFocus(nextFocus);
    const next: Record<string, Picks> = {};
    for (const p of productsRef.current) next[p.id] = defaultPicks(p, nextFocus);
    setPicks(next);
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── State writers ────────────────────────────────────────────────────────
  const setText = React.useCallback(
    (id: string, key: "title" | "description" | "specs", patch: Partial<TextStep>) =>
      setRuns((prev) => {
        const cur = prev[id] ?? emptyRun();
        return { ...prev, [id]: { ...cur, [key]: { ...cur[key], ...patch } } };
      }),
    [],
  );

  const patchImg = React.useCallback(
    (id: string, patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) =>
      setRuns((prev) => {
        const cur = prev[id] ?? emptyRun();
        const next = typeof patch === "function" ? patch(cur.image) : patch;
        return { ...prev, [id]: { ...cur, image: { ...cur.image, ...next } } };
      }),
    [],
  );

  // ── Title generation (batch SSE, auto-saved) ────────────────────────────────
  const runTitles = React.useCallback(
    async (ids: string[]) => {
      ids.forEach((id) => setText(id, "title", { status: "running", detail: "Cleaning title" }));
      try {
        const res = await fetch("/api/products/generate-titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: ids }),
          signal: abortRef.current?.signal,
        });
        if (!res.ok || !res.body) throw new Error("Failed to start title generation");
        await readSSE(res.body, (event) => {
          const id = event.productId as string;
          if (!id || event.event !== "product_complete") return;
          const title = (event.title as string | null) ?? null;
          if (event.success && title) {
            setProducts((prev) =>
              prev.map((p) => (p.id === id ? { ...p, display_name: title } : p)),
            );
            setText(id, "title", { status: "done" });
            setRedos((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyPicks()), title: false } }));
          } else {
            setText(id, "title", { status: "error", detail: (event.error as string) || "Failed" });
          }
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        ids.forEach((id) => setText(id, "title", { status: "error", detail: "Generation failed" }));
      }
    },
    [setText, setRedos],
  );

  // ── Description + specs generation (batch SSE, auto-saved) ────────────────────
  const runDescriptions = React.useCallback(
    async (ids: string[], mode: "both" | "description" | "specs") => {
      const doDesc = mode === "both" || mode === "description";
      const doSpecs = mode === "both" || mode === "specs";
      ids.forEach((id) => {
        if (doDesc) setText(id, "description", { status: "running", detail: "Researching" });
        if (doSpecs) setText(id, "specs", { status: "running", detail: "Researching" });
      });
      try {
        const res = await fetch("/api/products/generate-product-descriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: ids, mode }),
          signal: abortRef.current?.signal,
        });
        if (!res.ok || !res.body) throw new Error("Failed to start generation");
        await readSSE(res.body, (event) => {
          const id = event.productId as string;
          if (!id) return;
          if (event.event === "product_phase") {
            if (event.phase === "specs") {
              if (doSpecs) setText(id, "specs", { status: "running", detail: "Writing specs" });
            } else if (doDesc) {
              setText(id, "description", { status: "running", detail: "Writing description" });
            }
          }
          if (event.event === "product_complete") {
            if (event.success) {
              const description = (event.description as string | null) ?? null;
              const specs = (event.specs as string | null) ?? null;
              setProducts((prev) =>
                prev.map((p) =>
                  p.id === id
                    ? {
                        ...p,
                        product_description: description ?? p.product_description,
                        product_specs: specs ?? p.product_specs,
                      }
                    : p,
                ),
              );
              if (doDesc) setText(id, "description", { status: "done" });
              if (doSpecs) setText(id, "specs", { status: "done" });
              setRedos((prev) => ({
                ...prev,
                [id]: {
                  ...(prev[id] ?? emptyPicks()),
                  ...(doDesc ? { description: false } : {}),
                  ...(doSpecs ? { specs: false } : {}),
                },
              }));
            } else {
              const detail = (event.error as string) || "Failed";
              if (doDesc) setText(id, "description", { status: "error", detail });
              if (doSpecs) setText(id, "specs", { status: "error", detail });
            }
          }
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        ids.forEach((id) => {
          if (doDesc) setText(id, "description", { status: "error", detail: "Generation failed" });
          if (doSpecs) setText(id, "specs", { status: "error", detail: "Generation failed" });
        });
      }
    },
    [setText, setRedos],
  );

  // ── Image search + AI select (stops at "ready" for review) ───────────────────
  const runImageForProduct = React.useCallback(
    async (product: OptimizerProduct) => {
      const id = product.id;
      if (cancelledRef.current) return;
      if (!product.canonical_product_id) {
        patchImg(id, {
          phase: "error",
          error: "No canonical product — sync from Lightspeed first",
        });
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
            maxImages: MAX_SELECTED_IMAGES,
          }),
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

  // ── Approve a reviewed product's images (persists) ───────────────────────────
  const approveImages = React.useCallback(
    async (id: string) => {
      const product = productsRef.current.find((p) => p.id === id);
      const run = runsRef.current[id];
      if (!product || !run) return;
      const img = run.image;
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
        patchImg(id, {
          phase: "done",
          savedCount: (json.savedImageIds || img.selectedUrls).length,
        });
        setRedos((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyPicks()), image: false } }));
        setProducts((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  resolved_image_url: primaryUrl,
                  // add newly approved images to the canonical_images array so they show inline
                  canonical_images: [
                    ...img.selectedCandidates.map((c, i) => ({
                      id: `new-${i}`,
                      cloudinary_public_id: null,
                      cloudinary_url: null,
                      external_url: c.url,
                      is_primary: c.url === primaryUrl,
                      approval_status: "approved",
                      sort_order: i,
                    })),
                  ],
                }
              : p,
          ),
        );
      } catch (err) {
        patchImg(id, {
          phase: "ready",
          error: err instanceof Error ? err.message : "Failed to save images",
        });
      }
    },
    [patchImg],
  );

  const approveAllImages = async () => {
    const ids = Object.entries(runsRef.current)
      .filter(([, r]) => r.image.phase === "ready")
      .map(([id]) => id);
    const tasks = ids.map((id) => () => approveImages(id));
    await runWithConcurrency(tasks, IMAGE_CONCURRENCY);
  };

  // Run image search for a single product immediately (used by "Search for more" button)
  const runSingleImage = React.useCallback(
    async (p: OptimizerProduct) => {
      if (running) return;
      setRunning(true);
      cancelledRef.current = false;
      abortRef.current = new AbortController();
      try {
        await runImageForProduct(p);
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [running, runImageForProduct],
  );

  // ── Canonical image edits (existing approved photos) ────────────────────────

  const removeCanonicalImage = React.useCallback(async (productId: string, imageId: string) => {
    const product = productsRef.current.find((p) => p.id === productId);
    if (!product?.canonical_product_id) return;
    setCiRemoving((prev) => ({ ...prev, [productId]: [...(prev[productId] ?? []), imageId] }));
    // Optimistic removal
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? { ...p, canonical_images: p.canonical_images.filter((ci) => ci.id !== imageId) }
          : p,
      ),
    );
    try {
      const res = await fetch("/api/admin/images/remove-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: product.canonical_product_id, imageId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
    } catch {
      // Revert: reload products for this category
      void loadProducts(category);
    } finally {
      setCiRemoving((prev) => ({ ...prev, [productId]: (prev[productId] ?? []).filter((id) => id !== imageId) }));
    }
  }, [category, loadProducts]);

  const setCanonicalPrimary = React.useCallback(async (productId: string, imageId: string) => {
    const product = productsRef.current.find((p) => p.id === productId);
    if (!product?.canonical_product_id) return;
    // Optimistic update
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? { ...p, canonical_images: p.canonical_images.map((ci) => ({ ...ci, is_primary: ci.id === imageId })) }
          : p,
      ),
    );
    try {
      const res = await fetch("/api/admin/images/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: product.canonical_product_id, imageId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
    } catch {
      void loadProducts(category);
    }
  }, [category, loadProducts]);

  const enhanceCanonicalImage = React.useCallback(async (productId: string, imageId: string, url: string) => {
    const product = productsRef.current.find((p) => p.id === productId);
    if (!product?.canonical_product_id) return;
    setCiEnhancing((prev) => ({ ...prev, [productId]: [...(prev[productId] ?? []), imageId] }));
    try {
      const res = await fetch("/api/admin/images/enhance-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, canonicalProductId: product.canonical_product_id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.url) throw new Error(json.error || "Enhancement failed");
      const enhancedUrl: string = json.url;
      const publicId: string | undefined = json.publicId;
      // Save back to DB
      await fetch("/api/admin/images/update-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          canonicalProductId: product.canonical_product_id,
          cloudinaryUrl: enhancedUrl,
          cloudinaryPublicId: publicId ?? null,
        }),
      });
      // Update local state
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                canonical_images: p.canonical_images.map((ci) =>
                  ci.id === imageId
                    ? { ...ci, cloudinary_url: enhancedUrl, external_url: null }
                    : ci,
                ),
              }
            : p,
        ),
      );
    } catch {
      // silently fail — image unchanged
    } finally {
      setCiEnhancing((prev) => ({ ...prev, [productId]: (prev[productId] ?? []).filter((id) => id !== imageId) }));
    }
  }, []);

  // ── Per-image review edits ───────────────────────────────────────────────────
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
      if (prev.selectedUrls.length >= MAX_SELECTED_IMAGES) return {};
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
      // Lazy-load more candidates the first time.
      if (prev.candidates.length <= prev.selectedUrls.length) {
        void reloadCandidates(id);
        return {};
      }
      return { showAdditional: true };
    });

  const enhanceImage = React.useCallback(
    async (id: string, url: string) => {
      const product = productsRef.current.find((p) => p.id === id);
      if (!product?.canonical_product_id) return;
      const already = runsRef.current[id]?.image.enhancingUrls ?? [];
      if (already.includes(url)) return;
      patchImg(id, (prev) => ({ enhancingUrls: [...(prev.enhancingUrls ?? []), url] }));
      try {
        const res = await fetch("/api/admin/images/enhance-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: url, canonicalProductId: product.canonical_product_id }),
        });
        const json = await res.json();
        if (!res.ok || !json.success || !json.url) throw new Error(json.error || "Enhancement failed");
        const enhancedUrl: string = json.url;
        const enhancedThumb: string = json.thumbnailUrl ?? json.url;
        patchImg(id, (prev) => ({
          selectedUrls: prev.selectedUrls.map((u) => (u === url ? enhancedUrl : u)),
          selectedCandidates: prev.selectedCandidates.map((c) =>
            c.url === url ? { ...c, url: enhancedUrl, thumbnailUrl: enhancedThumb } : c,
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
    },
    [patchImg],
  );

  // ── Run everything ───────────────────────────────────────────────────────────
  const handleRun = async () => {
    // Resolve each product's still-pending ticked dimensions up front.
    const plan = visible
      .map((p) => ({ p, dims: pendingDims(p, runs[p.id] ?? emptyRun(), picks[p.id], redos[p.id]) }))
      .filter((t) => t.dims.length > 0);
    if (plan.length === 0) return;
    const has = (p: OptimizerProduct, d: DimKey) =>
      plan.find((t) => t.p.id === p.id)?.dims.includes(d) ?? false;

    setRunning(true);
    cancelledRef.current = false;
    abortRef.current = new AbortController();

    setRuns((prev) => {
      const next = { ...prev };
      for (const { p, dims } of plan) {
        const cur = next[p.id] ?? emptyRun();
        next[p.id] = {
          ...cur,
          title: dims.includes("title") ? { status: "queued" } : cur.title,
          description: dims.includes("description") ? { status: "queued" } : cur.description,
          specs: dims.includes("specs") ? { status: "queued" } : cur.specs,
          image: dims.includes("image") ? { ...emptyImageRun(), phase: "queued" } : cur.image,
        };
      }
      return next;
    });

    const jobs: Promise<unknown>[] = [];
    const targets = plan.map((t) => t.p);

    const titleIds = targets.filter((p) => has(p, "title")).map((p) => p.id);
    if (titleIds.length) jobs.push(runTitles(titleIds));

    const bothIds = targets
      .filter((p) => has(p, "description") && has(p, "specs"))
      .map((p) => p.id);
    const descOnlyIds = targets
      .filter((p) => has(p, "description") && !has(p, "specs"))
      .map((p) => p.id);
    const specsOnlyIds = targets
      .filter((p) => !has(p, "description") && has(p, "specs"))
      .map((p) => p.id);
    if (bothIds.length) jobs.push(runDescriptions(bothIds, "both"));
    if (descOnlyIds.length) jobs.push(runDescriptions(descOnlyIds, "description"));
    if (specsOnlyIds.length) jobs.push(runDescriptions(specsOnlyIds, "specs"));

    const imageProducts = targets.filter((p) => has(p, "image"));
    if (imageProducts.length) {
      const tasks = imageProducts.map((p) => () => runImageForProduct(p));
      jobs.push(runWithConcurrency(tasks, IMAGE_CONCURRENCY));
    }

    await Promise.all(jobs);
    setRunning(false);
    abortRef.current = null;
  };

  const handleStop = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setRunning(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Control bar — category + focus toggles */}
      <div className="rounded-xl border border-border bg-card p-4">
        {/* Row 1: category picker */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={category} onValueChange={onCategoryChange} disabled={loadingCats || running}>
            <SelectTrigger className="h-10 w-full rounded-md sm:max-w-xs">
              <SelectValue placeholder={loadingCats ? "Loading categories…" : "Select a category"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5" />
                  All products
                </span>
              </SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    {c.name}
                    <span className="text-xs text-muted-foreground">
                      {c.missingImages > 0
                        ? `${c.missingImages} of ${c.count} missing photos`
                        : `${c.count} products`}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {products.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{products.length}</span> products
            </p>
          )}

          {category && (
            <Button
              variant="ghost"
              size="sm"
              disabled={loading || running}
              onClick={() => void loadProducts(category)}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          )}
        </div>

        {/* Row 2: focus toggles (visible once a category is chosen) */}
        {category && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <OpToggle icon={ImageIcon} label="Photos" active={focus.image} count={counts.image} disabled={running} onClick={() => toggleFocus("image")} />
            <OpToggle icon={Type} label="Titles" active={focus.title} count={counts.title} disabled={running} onClick={() => toggleFocus("title")} />
            <OpToggle icon={FileText} label="Descriptions" active={focus.description} count={counts.desc} disabled={running} onClick={() => toggleFocus("description")} />
            <OpToggle icon={ListChecks} label="Specs" active={focus.specs} count={counts.specs} disabled={running} onClick={() => toggleFocus("specs")} />
          </div>
        )}

        {/* Row 3: filter by gap — show only products missing a specific dimension */}
        {products.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Show missing:</span>
            {(
              [
                { dim: "title" as DimKey, label: "Titles", count: counts.title },
                { dim: "description" as DimKey, label: "Descriptions", count: counts.desc },
                { dim: "specs" as DimKey, label: "Specs", count: counts.specs },
                { dim: "image" as DimKey, label: "Photos", count: counts.image },
              ] as const
            ).map(({ dim, label, count }) => (
              <button
                key={dim}
                type="button"
                disabled={running}
                onClick={() => setMissingFilter(missingFilter === dim ? null : dim)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  missingFilter === dim
                    ? "bg-primary text-primary-foreground"
                    : count === 0
                      ? "bg-muted text-muted-foreground opacity-50"
                      : "bg-muted text-foreground hover:bg-muted/80",
                )}
              >
                {label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    missingFilter === dim ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
            {missingFilter && (
              <button
                type="button"
                onClick={() => setMissingFilter(null)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Toolbar — search, bulk actions, run */}
      {category && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={running || visible.length === 0}
            onClick={toggleAllPicks}
          >
            {anyVisiblePicked ? "Untick all" : "Tick everything"}
          </Button>

          {(["title", "description", "specs", "image"] as DimKey[]).map((dim) => {
            const labels: Record<DimKey, string> = {
              title: "All titles",
              description: "All descs",
              specs: "All specs",
              image: "All photos",
            };
            const hasPicked = anyDimPicked(dim);
            return (
              <Button
                key={dim}
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                disabled={running || visible.length === 0}
                onClick={() => toggleDimAllPicks(dim)}
              >
                {hasPicked ? `Untick ${labels[dim].toLowerCase()}` : labels[dim]}
              </Button>
            );
          })}

          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{runCount}</span> product
            {runCount === 1 ? "" : "s"} ready
          </span>

          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={showCompleted}
              onCheckedChange={() => setShowCompleted((v) => !v)}
              aria-label="Show all products"
            />
            Show all products
          </label>

          {rejectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setShowRejected((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                showRejected
                  ? "bg-destructive/10 text-destructive"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Ban className="h-3 w-3" />
              {rejectedIds.size} rejected
            </button>
          )}

          <Select
            value={runLimit === null ? "all" : String(runLimit)}
            onValueChange={(v) => setRunLimit(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="10">Batch of 10</SelectItem>
              <SelectItem value="20">Batch of 20</SelectItem>
              <SelectItem value="50">Batch of 50</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative ml-auto w-48">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a product…"
              className="h-8 rounded-md pl-8 text-sm"
            />
          </div>

          {readyImageCount > 0 && !running && (
            <Button variant="outline" size="sm" onClick={() => void approveAllImages()}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Approve all photos ({readyImageCount})
            </Button>
          )}

          {running ? (
            <Button variant="outline" size="sm" onClick={handleStop}>
              <StopCircle className="mr-1.5 h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={handleRun} disabled={runCount === 0}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Optimize {runCount > 0 ? `${runCount} product${runCount === 1 ? "" : "s"}` : ""}
            </Button>
          )}
        </div>
      )}

      {/* Rejected products panel */}
      {showRejected && (
        <div className="rounded-xl border border-destructive/20 bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Rejected products</span>
              <span className="text-xs text-muted-foreground">({rejectedDetails.length})</span>
            </div>
            <p className="text-xs text-muted-foreground">
              These products are excluded from optimisation. Restore them to include them again.
            </p>
          </div>
          {rejectedDetails.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No rejected products</div>
          ) : (
            <div className="divide-y divide-border">
              {rejectedDetails.map((r) => (
                <div key={r.product_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {r.display_name || r.description}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.brand || "—"} · {r.category_name || "Unknown category"} · ${Number(r.price).toFixed(2)} · {r.qoh} in stock
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void restoreProduct(r.product_id)}
                    className="shrink-0"
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product list — 1 per row */}
      {category && (
        loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card py-20 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
            <p className="text-sm font-medium text-foreground">All caught up</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Nothing here needs the selected fixes. Turn on more boxes above, or tick &quot;Show
              completed&quot; to see everything.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card">
            <div className="divide-y divide-border">
              {visible.map((p) => {
                const run = runs[p.id] ?? emptyRun();
                const pk = picks[p.id];
                const isExpanded = expanded.has(p.id);
                const name = p.display_name || p.description;
                const img = run.image;
                const thumb = img.primaryUrl || p.resolved_image_url || p.primary_image_url || null;
                const showImageReview = img.phase !== "idle" && img.phase !== "queued";
                const isComplete = DIMS.every(
                  (d) => !focus[d] || pillState(p, d, run, pk, redos[p.id]) === "done",
                );

                return (
                  <div key={p.id} className={cn(isComplete && "bg-emerald-50/30 dark:bg-emerald-950/10")}>
                    {/* Main row */}
                    <div className="flex items-start gap-4 px-4 py-3">
                      {/* Checkbox */}
                      <div className="mt-1 shrink-0">
                        <Checkbox
                          checked={anyPick(pk)}
                          disabled={running}
                          aria-label={`Include ${name}`}
                          onCheckedChange={(checked) => {
                            if (running) return;
                            setPicks((prev) => ({
                              ...prev,
                              [p.id]: checked ? defaultPicks(p, focus) : emptyPicks(),
                            }));
                          }}
                        />
                      </div>

                      {/* Thumbnail — 88px, click to lightbox */}
                      <div
                        className="relative h-[88px] w-[88px] shrink-0 cursor-zoom-in overflow-hidden rounded-lg bg-muted"
                        onClick={() => thumb && setLightbox(thumb)}
                      >
                        {thumb ? (
                          <Image src={thumb} alt="" fill unoptimized className="object-cover" sizes="88px" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-7 w-7 text-muted-foreground/30" />
                          </div>
                        )}
                        {/* Complete tick on thumb */}
                        {isComplete && (
                          <div className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Name + meta + pills */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground leading-snug">{name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {p.brand || "—"} · ${Number(p.price).toFixed(2)} · {p.qoh} in stock
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {DIMS.map((dim) => (
                            <DimPill
                              key={dim}
                              dim={dim}
                              state={pillState(p, dim, run, pk, redos[p.id])}
                              disabled={running}
                              canRedo
                              onToggle={() => togglePick(p.id, dim)}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Reject button */}
                      <button
                        type="button"
                        title="Reject — hide this product from optimisation (not for sale online)"
                        aria-label="Reject product"
                        disabled={running}
                        onClick={() => void rejectProduct(p.id)}
                        className="mt-1 shrink-0 rounded-md p-1 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none"
                      >
                        <Ban className="h-4 w-4" />
                      </button>

                      {/* Expand toggle */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(p.id)}
                        className="mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Toggle details"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Existing approved images — shown when product already has photos and no active image run */}
                    {p.canonical_images.length > 0 && img.phase === "idle" && (
                      <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {p.canonical_images.length} approved photo{p.canonical_images.length === 1 ? "" : "s"}
                          </span>
                          <button
                            type="button"
                            disabled={running}
                            onClick={() => void runSingleImage(p)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent disabled:opacity-50"
                          >
                            <Search className="h-3 w-3" />
                            Search for different photos
                          </button>
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                          {p.canonical_images.map((ci) => {
                            const url = ci.cloudinary_url || ci.external_url;
                            if (!url) return null;
                            const isEnhancing = (ciEnhancing[p.id] ?? []).includes(ci.id);
                            const isRemoving = (ciRemoving[p.id] ?? []).includes(ci.id);
                            return (
                              <div
                                key={ci.id}
                                className={cn(
                                  "group relative aspect-square overflow-hidden rounded-md border bg-muted",
                                  ci.is_primary
                                    ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
                                    : "border-border",
                                  isRemoving && "opacity-40",
                                )}
                              >
                                {/* Clickable image area */}
                                <div
                                  role="button"
                                  tabIndex={0}
                                  aria-label="View full image"
                                  onClick={() => !isEnhancing && !isRemoving && setLightbox(url)}
                                  onKeyDown={(e) => e.key === "Enter" && !isEnhancing && !isRemoving && setLightbox(url)}
                                  className="absolute inset-0 cursor-zoom-in"
                                >
                                  <Image src={url} alt="" fill unoptimized className="object-cover" />
                                </div>

                                {ci.is_primary && (
                                  <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
                                    <Star className="h-2.5 w-2.5 fill-current" />
                                    Primary
                                  </span>
                                )}

                                {/* Enhancing spinner */}
                                {isEnhancing && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                  </div>
                                )}

                                {!isEnhancing && !isRemoving && (
                                  <>
                                    {/* Remove (X) — top-right, hidden until hover, only if >1 image */}
                                    {p.canonical_images.length > 1 && (
                                      <button
                                        type="button"
                                        aria-label="Remove photo"
                                        title="Remove photo"
                                        onClick={(e) => { e.stopPropagation(); void removeCanonicalImage(p.id, ci.id); }}
                                        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}

                                    {/* Remove background (Wand) — bottom-left */}
                                    {p.canonical_product_id && (
                                      <button
                                        type="button"
                                        aria-label="Remove background"
                                        title="Remove background & white backdrop"
                                        onClick={(e) => { e.stopPropagation(); void enhanceCanonicalImage(p.id, ci.id, url); }}
                                        className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100"
                                      >
                                        <Wand2 className="h-2.5 w-2.5" />
                                        BG
                                      </button>
                                    )}

                                    {/* Set primary (Star) — bottom-right, only for non-primary */}
                                    {!ci.is_primary && (
                                      <button
                                        type="button"
                                        aria-label="Set as primary"
                                        title="Set as primary"
                                        onClick={(e) => { e.stopPropagation(); void setCanonicalPrimary(p.id, ci.id); }}
                                        className="absolute bottom-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100"
                                      >
                                        <Star className="h-3 w-3" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Image review — full width, shown inline */}
                    {showImageReview && (
                      <div className="border-t border-border/50 bg-muted/20 px-4 py-4">
                        <ImageReview
                          img={img}
                          hasCanonical={!!p.canonical_product_id}
                          saving={img.phase === "saving"}
                          panelMode
                          onSetPrimary={(url) => setPrimary(p.id, url)}
                          onRemove={(url) => removeImage(p.id, url)}
                          onAdd={(c) => addCandidate(p.id, c)}
                          onEnhance={(url) => void enhanceImage(p.id, url)}
                          onToggleAdditional={() => toggleAdditional(p.id)}
                          onApprove={() => void approveImages(p.id)}
                          onLightbox={(url) => setLightbox(url)}
                        />
                      </div>
                    )}

                    {/* Expanded text details */}
                    {isExpanded && (
                      <div className="space-y-2 border-t border-border/50 bg-muted/20 px-4 py-3">
                        <div className="text-xs">
                          <span className="font-medium text-foreground">Title: </span>
                          <span className="text-muted-foreground">
                            {p.display_name || <span className="italic">Raw: {p.description}</span>}
                          </span>
                        </div>
                        {p.product_description && (
                          <div className="text-xs">
                            <span className="font-medium text-foreground">Description: </span>
                            <span className="line-clamp-4 text-muted-foreground">{p.product_description}</span>
                          </div>
                        )}
                        {p.product_specs && (
                          <div className="text-xs">
                            <span className="font-medium text-foreground">Specs: </span>
                            <span className="line-clamp-4 whitespace-pre-line text-muted-foreground">{p.product_specs}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {!category && !loadingCats && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Pick a category to begin</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              We&apos;ll list every product that still needs work and pre-tick exactly what&apos;s
              missing. Untick anything to skip it, then press Optimize. Photos come back for you to
              approve; titles, descriptions and specs save themselves.
            </p>
          </div>
        </div>
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

// ── SSE reader ────────────────────────────────────────────────────────────────
async function readSSE(
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

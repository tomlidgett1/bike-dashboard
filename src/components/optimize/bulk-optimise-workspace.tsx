"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  ChevronDown,
  Dot,
  ImageIcon,
  Loader2,
  Package,
  PenLine,
  Plus,
  Save,
  Search,
  Sparkles,
  Tag,
  Wand2,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SafeProductImage } from "@/components/settings/safe-product-image";
import { OptimizerImageReview } from "@/components/optimize/optimizer-image-review";
import {
  type CanonicalImage,
  type ImageRun,
  type OptimizerProduct,
  IMG_BUSY,
  LightboxOverlay,
  buildSpeedSearchQuery,
  emptyImageRun,
  fetchOptimizerProductsBySearch,
  hasDesc,
  hasSerperImage,
  hasSpecs,
  hasTitle,
  readSSE,
  toSpeedProduct,
  useLightbox,
} from "@/components/optimize/optimizer-shared";
import type { SpeedSearchCandidate } from "@/lib/admin/image-qa-speed";
import {
  type SerperAiSelectionCache,
  type SerperImageCacheEntry,
  imageRunFromSerperCache,
} from "@/lib/optimize/serper-image-cache";
import { useOptimizeJobs } from "@/components/providers/optimize-jobs-provider";
import type { CopyBatchFields } from "@/lib/optimize/copy-batch-job-types";
import type { HeroPipelineResult } from "@/lib/optimize/hero-images/types";
import {
  readBulkOptimiseIds,
  writeBulkOptimiseIds,
} from "@/lib/optimize/bulk-optimise-session";

// ── Types ───────────────────────────────────────────────────────────────────

export type BulkProduct = OptimizerProduct & {
  system_sku?: string | null;
  custom_sku?: string | null;
  lightspeed_item_id?: string | null;
  manufacturer_id?: string | null;
  sellable?: number | null;
};

type FieldKey = "title" | "description" | "specs" | "photos" | "brand";

type FieldSelection = Record<FieldKey, boolean>;

type CopyDraft = { title: string; description: string; specs: string };

type DirectDescriptionMode = "both" | "description" | "specs";

const FIELD_LABELS: Record<FieldKey, string> = {
  title: "Title",
  description: "Description",
  specs: "Specs",
  photos: "Photos",
  brand: "Brand",
};

const FIELD_ORDER: FieldKey[] = ["title", "description", "specs", "photos", "brand"];

const DROPDOWN_TRANSITION = { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] as const };

const BRAND_CHUNK = 25;
const SERPER_CACHE_CHUNK = 50;
const SMART_PHOTO_SYSTEM = "smart_product_photos" as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function fieldHasContent(product: BulkProduct, field: FieldKey) {
  switch (field) {
    case "title":
      return hasTitle(product);
    case "description":
      return hasDesc(product);
    case "specs":
      return hasSpecs(product);
    case "photos":
      return hasSerperImage(product);
    case "brand":
      return !!product.brand?.trim();
  }
}

function defaultFieldSelection(product: BulkProduct): FieldSelection {
  return {
    title: !hasTitle(product),
    description: !hasDesc(product),
    specs: !hasSpecs(product),
    photos: !hasSerperImage(product),
    brand: !product.brand?.trim(),
  };
}

function getSku(product: BulkProduct) {
  return product.custom_sku || product.system_sku || null;
}

/** True when copy and approved images are on the product — safe to drop from the batch. */
function isProductFullyOptimised(
  product: BulkProduct,
  imageRun: ImageRun | undefined,
  busy: { copyBusy: boolean; photoBusy: boolean; brandBusy: boolean; saving: boolean },
): boolean {
  if (busy.copyBusy || busy.photoBusy || busy.brandBusy || busy.saving) return false;

  const hasApprovedPhotos = hasSerperImage(product);
  const phase = imageRun?.phase;
  if (
    phase === "searching" ||
    phase === "selecting" ||
    phase === "saving" ||
    (phase === "ready" && !hasApprovedPhotos)
  ) {
    return false;
  }

  return (
    hasTitle(product) &&
    hasDesc(product) &&
    hasSpecs(product) &&
    hasApprovedPhotos
  );
}

type ProductApiRow = Omit<BulkProduct, "canonical_images"> & {
  canonical_products?: (BulkProduct["canonical_products"] & {
    product_images?: CanonicalImage[] | null;
  }) | null;
};

function mapProductRows(rows: ProductApiRow[]): BulkProduct[] {
  return rows.map((row) => ({
    ...row,
    canonical_images: (row.canonical_products?.product_images ?? []).filter(
      (img) => img.approval_status === "approved" || img.approval_status === null,
    ),
  }));
}

async function fetchProductsByIds(ids: string[]): Promise<BulkProduct[]> {
  if (ids.length === 0) return [];
  const out: BulkProduct[] = [];

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const params = new URLSearchParams({
      page: "1",
      pageSize: String(chunk.length),
      ids: chunk.join(","),
      includeOptimizeCanonical: "true",
    });
    const res = await fetch(`/api/products?${params}`);
    if (!res.ok) continue;
    const data = await res.json();
    out.push(...mapProductRows((data.products ?? []) as ProductApiRow[]));
  }

  const order = new Map(ids.map((id, index) => [id, index]));
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function fetchSerperCaches(
  canonicalIds: string[],
): Promise<Record<string, SerperImageCacheEntry>> {
  const unique = [...new Set(canonicalIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const caches: Record<string, SerperImageCacheEntry> = {};
  for (let index = 0; index < unique.length; index += SERPER_CACHE_CHUNK) {
    const chunk = unique.slice(index, index + SERPER_CACHE_CHUNK);
    const response = await fetch(
      `/api/optimize/serper-cache?canonicalIds=${encodeURIComponent(chunk.join(","))}`,
    );
    if (!response.ok) continue;
    const data = await response.json();
    Object.assign(caches, data.caches ?? {});
  }
  return caches;
}

function saveSerperCache(
  canonicalProductId: string,
  payload: {
    searchQuery: string;
    candidates: ImageRun["candidates"];
    aiSelection: SerperAiSelectionCache | null;
  },
) {
  void fetch("/api/optimize/serper-cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canonicalProductId, ...payload }),
  });
}

function imageRunToSerperAiSelection(run: ImageRun): SerperAiSelectionCache | null {
  if (!run.primaryUrl || run.selectedCandidates.length === 0) return null;

  return {
    selectedCandidates: run.selectedCandidates,
    selectedUrls: run.selectedUrls,
    primaryUrl: run.primaryUrl,
    photoSystem: run.photoSystem,
    reasoning: run.reasoning,
  };
}

function isSmartCachedRun(
  run: ReturnType<typeof imageRunFromSerperCache>,
): run is NonNullable<ReturnType<typeof imageRunFromSerperCache>> & {
  photoSystem: typeof SMART_PHOTO_SYSTEM;
} {
  return run?.photoSystem === SMART_PHOTO_SYSTEM;
}

function hasAdditionalSmartCandidates(run: ReturnType<typeof imageRunFromSerperCache>) {
  if (!isSmartCachedRun(run)) return false;
  return run.candidates.some((candidate) => !run.selectedUrls.includes(candidate.url));
}

function smartPhotoResultToCandidates(result: HeroPipelineResult): SpeedSearchCandidate[] {
  const selected = Array.isArray(result.selected) ? result.selected : [];
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  const byUrl = new Map<string, SpeedSearchCandidate>();

  const addCandidate = (
    image: {
      url: string;
      thumbnailUrl?: string;
      title?: string;
      reason?: string;
      domain?: string;
      source?: string;
      width?: number;
      height?: number;
      isOfficial?: boolean;
    },
    index: number,
  ) => {
    if (!image.url || byUrl.has(image.url)) return;
    byUrl.set(image.url, {
      id: `smart-photo-${index + 1}`,
      url: image.url,
      thumbnailUrl: image.thumbnailUrl ?? image.url,
      title: image.reason || image.title || image.domain || `Smart product photo ${index + 1}`,
      source: image.source || (image.isOfficial ? "official" : image.domain ?? SMART_PHOTO_SYSTEM),
      domain: image.domain,
      width: image.width,
      height: image.height,
    });
  };

  selected.forEach(addCandidate);
  candidates.forEach((candidate, index) => addCandidate(candidate, selected.length + index));

  return [...byUrl.values()];
}

function hasCopyFields(copyFields: CopyBatchFields) {
  return copyFields.title || copyFields.description || copyFields.specs;
}

function directDescriptionMode(copyFields: CopyBatchFields): DirectDescriptionMode | null {
  if (copyFields.description && copyFields.specs) return "both";
  if (copyFields.description) return "description";
  if (copyFields.specs) return "specs";
  return null;
}

interface IdentifyBrandResult {
  productId: string;
  brand: string | null;
  manufacturerId: string | null;
  createdManufacturer: boolean;
  updatedLightspeed: boolean;
  error?: string;
}

// ── Small UI pieces ─────────────────────────────────────────────────────────

function SelectionCheckbox({
  checked,
  indeterminate,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { indeterminate?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      className={cn(
        "h-3.5 w-3.5 rounded-md border-border text-foreground accent-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function FieldChip({
  field,
  active,
  hasContent,
  disabled,
  onToggle,
}: {
  field: FieldKey;
  active: boolean;
  hasContent: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      title={
        active
          ? `${FIELD_LABELS[field]} will be optimised — click to skip`
          : `${FIELD_LABELS[field]} will be skipped — click to include`
      }
      className={cn(
        "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {FIELD_LABELS[field]}
      {hasContent ? (
        <CheckCircle2 className="h-2.5 w-2.5" />
      ) : (
        <Dot className="-mx-1 h-3.5 w-3.5" />
      )}
    </button>
  );
}

function StatChip({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border bg-background px-3 py-2", className)}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

type BulkOptimiseWorkspaceProps = {
  variant?: "default" | "products-card";
};

export function BulkOptimiseWorkspace({ variant = "default" }: BulkOptimiseWorkspaceProps) {
  const isProductsCard = variant === "products-card";
  const { jobs, startCopyBatch } = useOptimizeJobs();
  const { lightbox, setLightbox } = useLightbox();

  const [products, setProducts] = React.useState<BulkProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [rowSelected, setRowSelected] = React.useState<Set<string>>(new Set());
  const [fields, setFields] = React.useState<Record<string, FieldSelection>>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [drafts, setDrafts] = React.useState<Record<string, CopyDraft>>({});
  const [savingIds, setSavingIds] = React.useState<Set<string>>(new Set());
  const [imageRuns, setImageRuns] = React.useState<Record<string, ImageRun>>({});
  const [photoProgress, setPhotoProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [directCopyProgress, setDirectCopyProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [bicycleBusy, setBicycleBusy] = React.useState<Set<string>>(new Set());
  const [brandBusy, setBrandBusy] = React.useState<Set<string>>(new Set());
  const [brandErrors, setBrandErrors] = React.useState<Record<string, string>>({});
  const [sessionJobIds, setSessionJobIds] = React.useState<string[]>([]);
  const [copyQueuedIds, setCopyQueuedIds] = React.useState<Set<string>>(new Set());

  // Add-products search
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<BulkProduct[]>([]);
  const [searching, setSearching] = React.useState(false);
  const searchAbortRef = React.useRef<AbortController | null>(null);

  const imageRunsRef = React.useRef(imageRuns);
  React.useEffect(() => {
    imageRunsRef.current = imageRuns;
  }, [imageRuns]);

  const productsRef = React.useRef(products);
  React.useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // ── Generic state patches ─────────────────────────────────────────────────

  const patchProduct = React.useCallback((id: string, patch: Partial<BulkProduct>) => {
    setProducts((prev) =>
      prev.map((product) => (product.id === id ? { ...product, ...patch } : product)),
    );
  }, []);

  const patchImageRun = React.useCallback(
    (id: string, patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) => {
      setImageRuns((prev) => {
        const current = prev[id] ?? emptyImageRun();
        const next = typeof patch === "function" ? patch(current) : patch;
        return { ...prev, [id]: { ...current, ...next } };
      });
    },
    [],
  );

  const setRowFields = React.useCallback((id: string, patch: Partial<FieldSelection>) => {
    setFields((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { title: false, description: false, specs: false, photos: false, brand: false }),
        ...patch,
      },
    }));
  }, []);

  const updateImageRunForProduct = React.useCallback(
    (
      product: BulkProduct,
      patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>),
    ) => {
      const current = imageRunsRef.current[product.id] ?? emptyImageRun();
      const nextPatch = typeof patch === "function" ? patch(current) : patch;
      const nextRun = { ...current, ...nextPatch };

      patchImageRun(product.id, nextPatch);

      if (
        product.canonical_product_id &&
        !hasSerperImage(product) &&
        nextRun.candidates.length > 0 &&
        (nextRun.phase === "ready" || nextRun.phase === "selecting")
      ) {
        saveSerperCache(product.canonical_product_id, {
          searchQuery: buildSpeedSearchQuery(toSpeedProduct(product)),
          candidates: nextRun.candidates,
          aiSelection: imageRunToSerperAiSelection(nextRun),
        });
      }
    },
    [patchImageRun],
  );

  // ── Initial load ──────────────────────────────────────────────────────────

  const hydrateCachedImageRuns = React.useCallback(
    async (list: BulkProduct[]) => {
      const canonicalIds = list
        .map((product) => product.canonical_product_id)
        .filter((id): id is string => !!id);
      if (canonicalIds.length === 0) return;

      try {
        const caches = await fetchSerperCaches(canonicalIds);
        setImageRuns((prev) => {
          const next = { ...prev };
          for (const product of list) {
            if (!product.canonical_product_id) continue;
            if (hasSerperImage(product)) {
              next[product.id] = emptyImageRun();
              continue;
            }
            if (next[product.id] && next[product.id].phase !== "idle") continue;
            const cached = imageRunFromSerperCache(caches[product.canonical_product_id]);
            if (hasAdditionalSmartCandidates(cached)) {
              next[product.id] = { ...emptyImageRun(), ...cached };
            }
          }
          return next;
        });
      } catch {
        /* cache hydration is best-effort */
      }
    },
    [],
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = readBulkOptimiseIds();
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
      try {
        const loaded = await fetchProductsByIds(ids);
        if (cancelled) return;
        setProducts(loaded);
        setRowSelected(new Set(loaded.map((product) => product.id)));
        setFields(
          Object.fromEntries(loaded.map((product) => [product.id, defaultFieldSelection(product)])),
        );
        void hydrateCachedImageRuns(loaded);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateCachedImageRuns]);

  // ── Copy batch jobs ───────────────────────────────────────────────────────

  const activeSessionJobs = React.useMemo(
    () =>
      jobs.filter(
        (job) =>
          sessionJobIds.includes(job.id) &&
          (job.status === "queued" || job.status === "running"),
      ),
    [jobs, sessionJobIds],
  );
  const backgroundCopyRunning = activeSessionJobs.length > 0;
  const copyRunning = backgroundCopyRunning || directCopyProgress !== null;

  const copyProgress = React.useMemo(() => {
    if (directCopyProgress) return directCopyProgress;
    if (!backgroundCopyRunning) return null;
    const sessionJobs = jobs.filter((job) => sessionJobIds.includes(job.id));
    const done = sessionJobs.reduce((sum, job) => sum + job.done, 0);
    const total = sessionJobs.reduce((sum, job) => sum + job.total, 0);
    return { done, total };
  }, [backgroundCopyRunning, directCopyProgress, jobs, sessionJobIds]);

  // While copy jobs are running, refresh the affected products so generated
  // titles/descriptions/specs and bicycle detections stream into the table.
  React.useEffect(() => {
    if (!copyRunning) {
      setCopyQueuedIds(new Set());
      return;
    }
    const ids = [...copyQueuedIds];
    if (ids.length === 0) return;

    let cancelled = false;
    const refresh = async () => {
      const rows = await fetchProductsByIds(ids);
      if (cancelled || rows.length === 0) return;
      setProducts((prev) => {
        const byId = new Map(prev.map((product) => [product.id, product]));
        for (const row of rows) {
          const existing = byId.get(row.id);
          if (existing) byId.set(row.id, { ...existing, ...row });
        }
        return [...byId.values()];
      });
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyRunning]);

  // ── Photo pipeline ────────────────────────────────────────────────────────

  const runImageSearch = React.useCallback(
    async (product: BulkProduct, cacheEntry?: SerperImageCacheEntry | null) => {
      if (hasSerperImage(product)) {
        patchImageRun(product.id, emptyImageRun());
        return true;
      }

      if (!product.canonical_product_id) {
        patchImageRun(product.id, {
          phase: "error",
          error: "No canonical product. Sync from Lightspeed first.",
        });
        return false;
      }

      try {
        const speedProduct = toSpeedProduct(product);
        const searchQuery = buildSpeedSearchQuery(speedProduct);
        let entry = cacheEntry ?? null;

        if (!entry) {
          const caches = await fetchSerperCaches([product.canonical_product_id]);
          entry = caches[product.canonical_product_id] ?? null;
        }

        const cachedRun = imageRunFromSerperCache(entry ?? undefined);
        if (cachedRun?.phase === "ready" && hasAdditionalSmartCandidates(cachedRun)) {
          patchImageRun(product.id, { ...emptyImageRun(), ...cachedRun });
          return true;
        }

        patchImageRun(product.id, { ...emptyImageRun(), phase: "searching" });
        const response = await fetch("/api/optimize/hero-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: speedProduct.display_name || speedProduct.normalized_name || speedProduct.store_product_name,
            brand: speedProduct.manufacturer || null,
            upc: speedProduct.upc || null,
            searchQuery,
            maxImages: 6,
          }),
        });

        const json = (await response.json().catch(() => ({}))) as HeroPipelineResult & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(json.error || "Smart photo search failed");
        }

        const selectedImages = Array.isArray(json.selected) ? json.selected : [];
        const candidates = smartPhotoResultToCandidates(json);
        const selectedUrlSet = new Set(selectedImages.map((image) => image.url));
        const selectedCandidates = candidates.filter((candidate) => selectedUrlSet.has(candidate.url));
        const selectedUrls = selectedCandidates.map((candidate) => candidate.url);
        const primaryUrl =
          json.primaryUrl ||
          selectedImages.find((image) => image.isPrimary)?.url ||
          selectedUrls[0] ||
          null;

        if (!json.ok || candidates.length === 0 || !primaryUrl) {
          patchImageRun(product.id, {
            phase: "no_results",
            error: json.error || json.reasoning || "No images found",
            photoSystem: SMART_PHOTO_SYSTEM,
          });
          saveSerperCache(product.canonical_product_id, {
            searchQuery,
            candidates: [],
            aiSelection: null,
          });
          return false;
        }

        patchImageRun(product.id, {
          phase: "ready",
          candidates,
          selectedCandidates,
          selectedUrls,
          primaryUrl,
          photoSystem: SMART_PHOTO_SYSTEM,
          reasoning: json.reasoning,
          error: undefined,
        });
        saveSerperCache(product.canonical_product_id, {
          searchQuery,
          candidates,
          aiSelection: {
            selectedCandidates,
            selectedUrls,
            primaryUrl,
            photoSystem: SMART_PHOTO_SYSTEM,
            reasoning: json.reasoning,
          },
        });
        return true;
      } catch (error) {
        patchImageRun(product.id, {
          phase: "error",
          error: error instanceof Error ? error.message : "Image search failed",
        });
        return false;
      }
    },
    [patchImageRun],
  );

  const runPhotoPipeline = React.useCallback(
    async (targets: BulkProduct[]) => {
      const skipPhases = new Set<ImageRun["phase"]>([
        "searching",
        "selecting",
        "ready",
        "saving",
        "done",
      ]);
      const pending = targets.filter((product) => {
        const phase = imageRunsRef.current[product.id]?.phase;
        return !phase || !skipPhases.has(phase);
      });
      if (pending.length === 0) return;

      const caches = await fetchSerperCaches(
        pending
          .map((product) => product.canonical_product_id)
          .filter((id): id is string => !!id),
      );

      setPhotoProgress({ done: 0, total: pending.length });
      let completed = 0;

      for (const product of pending) {
        const canonicalId = product.canonical_product_id;
        await runImageSearch(product, canonicalId ? caches[canonicalId] ?? null : null);
        completed += 1;
        setPhotoProgress({ done: completed, total: pending.length });
      }

      setPhotoProgress(null);
    },
    [runImageSearch],
  );

  const approveImages = React.useCallback(
    async (product: BulkProduct) => {
      const run = imageRunsRef.current[product.id] ?? emptyImageRun();
      if (!product.canonical_product_id || run.phase !== "ready" || !run.primaryUrl) {
        return false;
      }

      patchImageRun(product.id, { phase: "saving", error: undefined });

      try {
        const response = await fetch("/api/admin/images/approve-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonicalProductId: product.canonical_product_id,
            selectedCandidates: run.selectedCandidates,
            primaryCandidateUrl: run.primaryUrl,
            searchQuery: buildSpeedSearchQuery(toSpeedProduct(product)),
            rejectPending: true,
            quickMode: true,
          }),
        });

        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || "Failed to save images");

        patchImageRun(product.id, {
          phase: "done",
          savedCount: (json.savedImageIds || run.selectedUrls).length,
        });
        patchProduct(product.id, {
          resolved_image_url: run.primaryUrl,
          canonical_images: run.selectedCandidates.map((candidate, index) => ({
            id: `new-${index}`,
            cloudinary_public_id: null,
            cloudinary_url: null,
            external_url: candidate.url,
            is_primary: candidate.url === run.primaryUrl,
            approval_status: "approved",
            sort_order: index,
            source: "serper_workbench",
          })),
        });
        return true;
      } catch (error) {
        patchImageRun(product.id, {
          phase: "ready",
          error: error instanceof Error ? error.message : "Failed to save images",
        });
        return false;
      }
    },
    [patchImageRun, patchProduct],
  );

  const enhanceImage = React.useCallback(
    async (product: BulkProduct, url: string) => {
      if (!product.canonical_product_id) return;
      patchImageRun(product.id, (prev) => ({
        enhancingUrls: [...(prev.enhancingUrls ?? []), url],
      }));

      try {
        const response = await fetch("/api/admin/images/enhance-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: url,
            canonicalProductId: product.canonical_product_id,
          }),
        });
        const json = await response.json();
        if (!response.ok || !json.success || !json.url) {
          throw new Error(json.error || "Background removal failed");
        }

        const enhancedUrl = json.url as string;
        updateImageRunForProduct(product, (prev) => ({
          selectedUrls: prev.selectedUrls.map((item) => (item === url ? enhancedUrl : item)),
          selectedCandidates: prev.selectedCandidates.map((candidate) =>
            candidate.url === url
              ? { ...candidate, url: enhancedUrl, thumbnailUrl: json.thumbnailUrl ?? enhancedUrl }
              : candidate,
          ),
          primaryUrl: prev.primaryUrl === url ? enhancedUrl : prev.primaryUrl,
          enhancedUrls: { ...(prev.enhancedUrls ?? {}), [url]: enhancedUrl },
          enhancingUrls: (prev.enhancingUrls ?? []).filter((item) => item !== url),
        }));
      } catch {
        patchImageRun(product.id, (prev) => ({
          enhancingUrls: (prev.enhancingUrls ?? []).filter((item) => item !== url),
        }));
      }
    },
    [patchImageRun, updateImageRunForProduct],
  );

  // ── Copy generation ───────────────────────────────────────────────────────

  const startCopyForProducts = React.useCallback(
    async (targets: Array<{ product: BulkProduct; copyFields: CopyBatchFields }>) => {
      // The batch API applies one field set per job, so group identical sets.
      const groups = new Map<string, { copyFields: CopyBatchFields; ids: string[] }>();
      for (const { product, copyFields } of targets) {
        if (!copyFields.title && !copyFields.description && !copyFields.specs) continue;
        const key = `${copyFields.title}|${copyFields.description}|${copyFields.specs}`;
        const group = groups.get(key) ?? { copyFields, ids: [] };
        group.ids.push(product.id);
        groups.set(key, group);
      }
      if (groups.size === 0) return;

      const queued = new Set<string>();
      for (const group of groups.values()) {
        const jobId = await startCopyBatch({
          productIds: group.ids,
          copyFields: group.copyFields,
          label: "Bulk optimise",
        });
        if (jobId) {
          setSessionJobIds((prev) => [...prev, jobId]);
          for (const id of group.ids) queued.add(id);
        }
      }
      if (queued.size > 0) {
        setCopyQueuedIds((prev) => new Set([...prev, ...queued]));
      }
    },
    [startCopyBatch],
  );

  const runTitleCopyForProduct = React.useCallback(
    async (product: BulkProduct) => {
      const response = await fetch("/api/products/generate-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [product.id] }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Title generation failed");
      }

      let completed = false;
      let success = false;
      await readSSE(response.body, (event) => {
        if (event.event !== "product_complete" || event.productId !== product.id) return;
        completed = true;
        success = event.success === true;

        if (typeof event.title === "string" && event.title.trim()) {
          patchProduct(product.id, { display_name: event.title });
        }
      });

      return completed ? success : response.ok;
    },
    [patchProduct],
  );

  const runDescriptionCopyForProduct = React.useCallback(
    async (product: BulkProduct, mode: DirectDescriptionMode) => {
      const response = await fetch("/api/products/generate-product-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [product.id], mode }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Copy generation failed");
      }

      let completed = false;
      let success = false;
      await readSSE(response.body, (event) => {
        if (event.event !== "product_complete" || event.productId !== product.id) return;
        completed = true;
        success = event.success === true;

        const patch: Partial<BulkProduct> = {};
        if (typeof event.description === "string" && event.description.trim()) {
          patch.product_description = event.description;
        }
        if (typeof event.specs === "string" && event.specs.trim()) {
          patch.product_specs = event.specs;
        }
        if (typeof event.is_bicycle === "boolean") {
          patch.is_bicycle = event.is_bicycle;
        }
        if (event.bike_specs) {
          patch.bike_specs = event.bike_specs;
        }

        if (Object.keys(patch).length > 0) {
          patchProduct(product.id, patch);
        }
      });

      return completed ? success : response.ok;
    },
    [patchProduct],
  );

  const runCopyForProduct = React.useCallback(
    async (product: BulkProduct, copyFields: CopyBatchFields) => {
      let success = true;

      if (copyFields.title) {
        success = (await runTitleCopyForProduct(product)) && success;
      }

      const mode = directDescriptionMode(copyFields);
      if (mode) {
        success = (await runDescriptionCopyForProduct(product, mode)) && success;
      }

      return success;
    },
    [runDescriptionCopyForProduct, runTitleCopyForProduct],
  );

  // ── Brand identification ──────────────────────────────────────────────────

  const fixBrands = React.useCallback(
    async (ids: string[]) => {
      const targets = ids.filter((id) => {
        const product = productsRef.current.find((item) => item.id === id);
        return product && !product.brand?.trim();
      });
      if (targets.length === 0) return;

      setBrandBusy((prev) => new Set([...prev, ...targets]));
      setBrandErrors((prev) => {
        const next = { ...prev };
        for (const id of targets) delete next[id];
        return next;
      });

      try {
        for (let index = 0; index < targets.length; index += BRAND_CHUNK) {
          const chunk = targets.slice(index, index + BRAND_CHUNK);
          const response = await fetch("/api/optimize/identify-brand", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productIds: chunk }),
          });
          const json = await response.json();
          if (!response.ok) {
            const message = json.error || "Brand identification failed";
            setBrandErrors((prev) => ({
              ...prev,
              ...Object.fromEntries(chunk.map((id) => [id, message])),
            }));
            continue;
          }

          for (const result of (json.results ?? []) as IdentifyBrandResult[]) {
            if (result.brand) {
              patchProduct(result.productId, {
                brand: result.brand,
                manufacturer_id: result.manufacturerId,
              });
            }
            if (result.error) {
              setBrandErrors((prev) => ({ ...prev, [result.productId]: result.error! }));
            }
          }
        }
      } finally {
        setBrandBusy((prev) => {
          const next = new Set(prev);
          for (const id of targets) next.delete(id);
          return next;
        });
      }
    },
    [patchProduct],
  );

  // ── Bicycle flag ──────────────────────────────────────────────────────────

  const setBicycle = React.useCallback(
    async (product: BulkProduct, isBicycle: boolean) => {
      setBicycleBusy((prev) => new Set([...prev, product.id]));
      patchProduct(product.id, { is_bicycle: isBicycle });
      try {
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_bicycle: isBicycle }),
        });
        if (!response.ok) throw new Error("Failed to update bicycle flag");
      } catch {
        patchProduct(product.id, { is_bicycle: !isBicycle });
      } finally {
        setBicycleBusy((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }
    },
    [patchProduct],
  );

  const autoDetectBicycle = React.useCallback(
    async (product: BulkProduct) => {
      setBicycleBusy((prev) => new Set([...prev, product.id]));
      try {
        const response = await fetch("/api/products/generate-product-descriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: [product.id], mode: "bicycle" }),
        });
        if (!response.ok || !response.body) throw new Error("Detection failed");
        await readSSE(response.body, (event) => {
          if (event.event === "product_complete" && event.productId === product.id) {
            patchProduct(product.id, {
              is_bicycle: !!event.is_bicycle,
              ...(event.bike_specs ? { bike_specs: event.bike_specs } : {}),
            });
          }
        });
      } catch {
        /* leave existing flag untouched */
      } finally {
        setBicycleBusy((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }
    },
    [patchProduct],
  );

  // ── Manual copy edits ─────────────────────────────────────────────────────

  const saveDraft = React.useCallback(
    async (product: BulkProduct) => {
      const draft = drafts[product.id];
      if (!draft) return;
      setSavingIds((prev) => new Set([...prev, product.id]));
      try {
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: draft.title.trim() || null,
            product_description: draft.description.trim() || null,
            product_specs: draft.specs.trim() || null,
          }),
        });
        if (!response.ok) throw new Error("Save failed");
        patchProduct(product.id, {
          display_name: draft.title.trim() || null,
          product_description: draft.description.trim() || null,
          product_specs: draft.specs.trim() || null,
        });
      } catch {
        /* keep draft so the user can retry */
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }
    },
    [drafts, patchProduct],
  );

  // ── Selection / batch management ──────────────────────────────────────────

  const persistIds = React.useCallback((list: BulkProduct[]) => {
    writeBulkOptimiseIds(list.map((product) => product.id));
  }, []);

  const addProduct = React.useCallback(
    (product: BulkProduct) => {
      setProducts((prev) => {
        if (prev.some((item) => item.id === product.id)) return prev;
        const next = [product, ...prev];
        persistIds(next);
        return next;
      });
      setFields((prev) => ({ ...prev, [product.id]: defaultFieldSelection(product) }));
      setRowSelected((prev) => new Set([...prev, product.id]));
      void hydrateCachedImageRuns([product]);
    },
    [hydrateCachedImageRuns, persistIds],
  );

  const removeProductsFromBatch = React.useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);

      setProducts((prev) => {
        const next = prev.filter((product) => !idSet.has(product.id));
        persistIds(next);
        return next;
      });
      setRowSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setFields((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      setImageRuns((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      setBrandErrors((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      setCopyQueuedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setSavingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setBicycleBusy((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setBrandBusy((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    },
    [persistIds],
  );

  const removeProduct = React.useCallback(
    (id: string) => removeProductsFromBatch([id]),
    [removeProductsFromBatch],
  );

  // Drop products from the batch once title, description, specs, and approved
  // images are all populated — including after copy jobs finish or photos are approved.
  React.useEffect(() => {
    const completedIds = products
      .filter((product) =>
        isProductFullyOptimised(product, imageRuns[product.id], {
          copyBusy: copyRunning && copyQueuedIds.has(product.id),
          photoBusy: IMG_BUSY.includes(imageRuns[product.id]?.phase ?? "idle"),
          brandBusy: brandBusy.has(product.id),
          saving: savingIds.has(product.id),
        }),
      )
      .map((product) => product.id);

    if (completedIds.length > 0) {
      removeProductsFromBatch(completedIds);
    }
  }, [
    products,
    imageRuns,
    copyRunning,
    copyQueuedIds,
    brandBusy,
    savingIds,
    removeProductsFromBatch,
  ]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        const product = productsRef.current.find((item) => item.id === id);
        if (product) {
          setDrafts((current) => ({
            ...current,
            [id]: current[id] ?? {
              title: product.display_name || "",
              description: product.product_description || "",
              specs: product.product_specs || "",
            },
          }));
        }
      }
      return next;
    });
  };

  // ── Add-products search ───────────────────────────────────────────────────

  React.useEffect(() => {
    const query = searchQuery.trim();
    searchAbortRef.current?.abort();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    const timeout = window.setTimeout(async () => {
      try {
        const results = await fetchOptimizerProductsBySearch(query, {
          signal: controller.signal,
          pageSize: 10,
        });
        if (!controller.signal.aborted) setSearchResults(results as BulkProduct[]);
      } catch {
        /* aborted or failed */
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedProducts = React.useMemo(
    () => products.filter((product) => rowSelected.has(product.id)),
    [products, rowSelected],
  );

  const missingBrandIds = React.useMemo(
    () => products.filter((product) => !product.brand?.trim()).map((product) => product.id),
    [products],
  );

  const readyPhotoCount = React.useMemo(
    () =>
      products.filter((product) => {
        const run = imageRuns[product.id];
        return run?.phase === "ready" && !!run.primaryUrl;
      }).length,
    [imageRuns, products],
  );

  const photosBusy = photoProgress !== null;
  const brandRunning = brandBusy.size > 0;
  const optimiseBusy = copyRunning || photosBusy || brandRunning;

  const masterFieldState = React.useMemo(() => {
    const state: Record<FieldKey, boolean> = {
      title: false,
      description: false,
      specs: false,
      photos: false,
      brand: false,
    };
    if (selectedProducts.length === 0) return state;
    for (const field of FIELD_ORDER) {
      state[field] = selectedProducts.every((product) => fields[product.id]?.[field]);
    }
    return state;
  }, [fields, selectedProducts]);

  const toggleMasterField = (field: FieldKey) => {
    const nextValue = !masterFieldState[field];
    setFields((prev) => {
      const next = { ...prev };
      for (const product of selectedProducts) {
        next[product.id] = {
          ...(next[product.id] ?? defaultFieldSelection(product)),
          [field]: nextValue,
        };
      }
      return next;
    });
  };

  const startOptimise = async () => {
    if (selectedProducts.length === 0 || optimiseBusy) return;

    const orderedTargets = selectedProducts.map((product) => {
      const selection = fields[product.id] ?? defaultFieldSelection(product);
      return {
        product,
        selection,
        copyFields: {
          title: selection.title,
          description: selection.description,
          specs: selection.specs,
        },
      };
    });

    const photoTotal = orderedTargets.filter(({ selection }) => selection.photos).length;
    const copyTotal = orderedTargets.filter(({ copyFields }) => hasCopyFields(copyFields)).length;
    let photoCaches: Record<string, SerperImageCacheEntry> = {};
    if (photoTotal > 0) {
      try {
        photoCaches = await fetchSerperCaches(
          orderedTargets
            .filter(({ selection }) => selection.photos)
            .map(({ product }) => product.canonical_product_id)
            .filter((id): id is string => !!id),
        );
      } catch {
        // Product-level image search still works without the warm cache lookup.
      }
    }

    let photosDone = 0;
    let copyDone = 0;

    if (photoTotal > 0) setPhotoProgress({ done: 0, total: photoTotal });
    if (copyTotal > 0) setDirectCopyProgress({ done: 0, total: copyTotal });

    try {
      for (const { product, selection, copyFields } of orderedTargets) {
        if (selection.photos) {
          const canonicalId = product.canonical_product_id;
          await runImageSearch(product, canonicalId ? photoCaches[canonicalId] ?? null : null);
          photosDone += 1;
          setPhotoProgress({ done: photosDone, total: photoTotal });
        }

        if (hasCopyFields(copyFields)) {
          setCopyQueuedIds(new Set([product.id]));
          try {
            await runCopyForProduct(product, copyFields);
          } catch {
            /* Keep the ordered run moving if one product's AI request fails. */
          } finally {
            copyDone += 1;
            setDirectCopyProgress({ done: copyDone, total: copyTotal });
            setCopyQueuedIds(new Set());
          }
        }

        if (selection.brand && !product.brand?.trim()) {
          await fixBrands([product.id]);
        }
      }
    } finally {
      setPhotoProgress(null);
      setDirectCopyProgress(null);
      setCopyQueuedIds(new Set());
    }
  };

  const approveAllReady = async () => {
    const ready = products.filter((product) => {
      const run = imageRuns[product.id];
      return run?.phase === "ready" && !!run.primaryUrl;
    });
    await Promise.all(ready.map((product) => approveImages(product)));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center",
          isProductsCard ? "min-h-0 flex-1" : "py-20",
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allSelected = products.length > 0 && rowSelected.size === products.length;
  const someSelected = rowSelected.size > 0;

  const statsRow = (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <StatChip label="Products in batch" value={products.length.toLocaleString()} className={isProductsCard ? "bg-white" : undefined} />
      <StatChip label="Selected" value={rowSelected.size.toLocaleString()} className={isProductsCard ? "bg-white" : undefined} />
      <StatChip label="Missing brand" value={missingBrandIds.length.toLocaleString()} className={isProductsCard ? "bg-white" : undefined} />
      <StatChip label="Photos ready to approve" value={readyPhotoCount.toLocaleString()} className={isProductsCard ? "bg-white" : undefined} />
    </div>
  );

  const toolbar = (
    <div className={cn("space-y-3", isProductsCard ? "" : "rounded-md border border-border bg-background p-4")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Add products */}
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search to add products to this batch..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={cn(
                "rounded-md pl-8 text-sm",
                isProductsCard ? "h-9" : "h-8 text-xs",
              )}
            />
            <AnimatePresence>
              {searchQuery.trim().length >= 2 ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={DROPDOWN_TRANSITION}
                  className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-background shadow-lg"
                >
                  {searching ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Searching products...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-muted-foreground">No products found.</p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto py-1">
                      {searchResults.map((result) => {
                        const inBatch = products.some((product) => product.id === result.id);
                        return (
                          <button
                            key={result.id}
                            type="button"
                            disabled={inBatch}
                            onClick={() => {
                              addProduct(result);
                              setSearchQuery("");
                            }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50">
                              {result.resolved_image_url || result.primary_image_url ? (
                                <SafeProductImage
                                  src={(result.resolved_image_url || result.primary_image_url)!}
                                  alt=""
                                  width={32}
                                  height={32}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-foreground">
                                {result.display_name || result.description}
                              </p>
                              {result.description?.trim() ? (
                                <p
                                  className="truncate text-[10px] text-muted-foreground"
                                  title={result.description}
                                >
                                  Lightspeed: {result.description}
                                </p>
                              ) : null}
                              <p className="truncate font-mono text-[10px] text-muted-foreground">
                                {getSku(result) ?? "No SKU"} · SOH {result.qoh ?? 0}
                              </p>
                            </div>
                            {inBatch ? (
                              <span className="text-[10px] text-muted-foreground">In batch</span>
                            ) : (
                              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Primary actions */}
          <div className="flex flex-wrap items-center gap-2">
            {readyPhotoCount > 0 ? (
              <Button size="sm" variant="outline" className="rounded-md" onClick={() => void approveAllReady()}>
                <CheckCircle2 className="size-3.5" />
                Approve all photos ({readyPhotoCount})
              </Button>
            ) : null}
            <Button
              size="sm"
              className="rounded-md"
              disabled={!someSelected || optimiseBusy}
              onClick={() => void startOptimise()}
            >
              {optimiseBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              Optimise selected ({rowSelected.size})
            </Button>
          </div>
        </div>

        {/* Select-all + master field toggles */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
            <SelectionCheckbox
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              disabled={products.length === 0}
              onChange={() =>
                setRowSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)))
              }
            />
            Select all products
          </label>
          <div className="h-4 w-px bg-border" />
          <span className="text-[11px] font-medium text-muted-foreground">
            Apply to selected:
          </span>
          {FIELD_ORDER.map((field) => (
            <FieldChip
              key={field}
              field={field}
              active={masterFieldState[field]}
              hasContent={false}
              disabled={selectedProducts.length === 0 || optimiseBusy}
              onToggle={() => toggleMasterField(field)}
            />
          ))}
        </div>

        {/* Progress */}
        <AnimatePresence>
          {(copyProgress || photoProgress) ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={DROPDOWN_TRANSITION}
              className="overflow-hidden"
            >
              <div className="space-y-2 border-t border-border/60 pt-3">
                {copyProgress ? (
                  <ProgressLine
                    icon={<PenLine className="h-3 w-3" />}
                    label="Writing copy with AI"
                    done={copyProgress.done}
                    total={copyProgress.total}
                  />
                ) : null}
                {photoProgress ? (
                  <ProgressLine
                    icon={<ImageIcon className="h-3 w-3" />}
                    label="Finding photos"
                    done={photoProgress.done}
                    total={photoProgress.total}
                  />
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
    </div>
  );

  const productList =
    products.length === 0 ? (
      <div
        className={cn(
          "py-16 text-center",
          isProductsCard ? "" : "rounded-md border border-border bg-background",
        )}
      >
        <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">No products in this batch</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Search above to add products, or select products from the table first.
        </p>
      </div>
    ) : (
      <div className="space-y-2">
        {products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            fieldSelection={fields[product.id] ?? defaultFieldSelection(product)}
            selected={rowSelected.has(product.id)}
            expanded={expanded.has(product.id)}
            imageRun={imageRuns[product.id] ?? emptyImageRun()}
            draft={drafts[product.id]}
            saving={savingIds.has(product.id)}
            copyBusy={copyRunning && copyQueuedIds.has(product.id)}
            bicycleBusy={bicycleBusy.has(product.id)}
            brandBusy={brandBusy.has(product.id)}
            brandError={brandErrors[product.id]}
            optimiseBusy={optimiseBusy}
            onToggleSelect={() =>
              setRowSelected((prev) => {
                const next = new Set(prev);
                if (next.has(product.id)) next.delete(product.id);
                else next.add(product.id);
                return next;
              })
            }
            onToggleField={(field) =>
              setRowFields(product.id, {
                [field]: !(fields[product.id] ?? defaultFieldSelection(product))[field],
              })
            }
            onToggleExpand={() => toggleExpand(product.id)}
            onRemove={() => removeProduct(product.id)}
            onDraftChange={(patch) =>
              setDrafts((prev) => ({
                ...prev,
                [product.id]: { ...(prev[product.id] ?? { title: "", description: "", specs: "" }), ...patch },
              }))
            }
            onSaveDraft={() => void saveDraft(product)}
            onGenerateCopy={() => {
              const selection = fields[product.id] ?? defaultFieldSelection(product);
              void startCopyForProducts([
                {
                  product,
                  copyFields: {
                    title: selection.title,
                    description: selection.description,
                    specs: selection.specs,
                  },
                },
              ]);
            }}
            onSetBicycle={(value) => void setBicycle(product, value)}
            onAutoDetectBicycle={() => void autoDetectBicycle(product)}
            onIdentifyBrand={() => void fixBrands([product.id])}
            onFindPhotos={() => void runPhotoPipeline([product])}
            onImageUpdate={(patch) => updateImageRunForProduct(product, patch)}
            onEnhance={(url) => void enhanceImage(product, url)}
            onApproveImages={() => void approveImages(product)}
            onLightbox={setLightbox}
          />
        ))}
      </div>
    );

  if (isProductsCard) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 rounded-t-xl border-b border-border/60 bg-gray-50">
          <div className="flex flex-col gap-3 px-4 py-3 md:px-5">
            {statsRow}
            {toolbar}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-5">{productList}</div>
        <LightboxOverlay url={lightbox} onClose={() => setLightbox(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {statsRow}
      {toolbar}
      {productList}

      <LightboxOverlay url={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

// ── Progress line ───────────────────────────────────────────────────────────

function ProgressLine({
  icon,
  label,
  done,
  total,
}: {
  icon: React.ReactNode;
  label: string;
  done: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="font-mono tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-md bg-muted">
        <motion.div
          className="h-full rounded-md bg-foreground"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ── Product row ─────────────────────────────────────────────────────────────

function ProductRow({
  product,
  fieldSelection,
  selected,
  expanded,
  imageRun,
  draft,
  saving,
  copyBusy,
  bicycleBusy,
  brandBusy,
  brandError,
  optimiseBusy,
  onToggleSelect,
  onToggleField,
  onToggleExpand,
  onRemove,
  onDraftChange,
  onSaveDraft,
  onGenerateCopy,
  onSetBicycle,
  onAutoDetectBicycle,
  onIdentifyBrand,
  onFindPhotos,
  onImageUpdate,
  onEnhance,
  onApproveImages,
  onLightbox,
}: {
  product: BulkProduct;
  fieldSelection: FieldSelection;
  selected: boolean;
  expanded: boolean;
  imageRun: ImageRun;
  draft?: CopyDraft;
  saving: boolean;
  copyBusy: boolean;
  bicycleBusy: boolean;
  brandBusy: boolean;
  brandError?: string;
  optimiseBusy: boolean;
  onToggleSelect: () => void;
  onToggleField: (field: FieldKey) => void;
  onToggleExpand: () => void;
  onRemove: () => void;
  onDraftChange: (patch: Partial<CopyDraft>) => void;
  onSaveDraft: () => void;
  onGenerateCopy: () => void;
  onSetBicycle: (value: boolean) => void;
  onAutoDetectBicycle: () => void;
  onIdentifyBrand: () => void;
  onFindPhotos: () => void;
  onImageUpdate: (patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) => void;
  onEnhance: (url: string) => void;
  onApproveImages: () => void;
  onLightbox: (url: string) => void;
}) {
  const title = product.display_name || product.description || "Unnamed product";
  const lightspeedName = product.description?.trim();
  const sku = getSku(product);
  const imageUrl = product.resolved_image_url || product.primary_image_url;
  const photoBusyNow = IMG_BUSY.includes(imageRun.phase);

  const statusText = copyBusy
    ? "Writing copy..."
    : photoBusyNow
      ? imageRun.phase === "saving"
        ? "Saving photos..."
        : "Finding photos..."
      : imageRun.phase === "ready"
        ? "Photos ready to approve"
        : imageRun.phase === "done"
          ? "Photos saved"
          : null;

  return (
    <div
      className={cn(
        "rounded-md border bg-background transition-colors",
        selected ? "border-foreground/30" : "border-border",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <SelectionCheckbox
          checked={selected}
          disabled={optimiseBusy}
          aria-label={`Select ${title}`}
          onChange={onToggleSelect}
        />

        <button
          type="button"
          onClick={() => imageUrl && onLightbox(imageUrl)}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50"
        >
          {imageUrl ? (
            <SafeProductImage
              src={imageUrl}
              alt={title}
              width={44}
              height={44}
              className="h-full w-full object-cover"
            />
          ) : (
            <Package className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-xs font-semibold text-foreground">{title}</p>
            {copyBusy || photoBusyNow ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-mono text-[10px] text-muted-foreground">
              SKU {sku ?? "—"}
            </span>
            {lightspeedName ? (
              <span
                className="max-w-[220px] truncate text-[10px] text-muted-foreground"
                title={lightspeedName}
              >
                Lightspeed: {lightspeedName}
              </span>
            ) : null}
            <Badge variant="outline" className="h-4.5 rounded-md border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground">
              SOH {(product.qoh ?? 0).toLocaleString()}
            </Badge>
            {product.brand?.trim() ? (
              <Badge variant="outline" className="h-4.5 rounded-md border-border bg-background px-1.5 text-[10px] font-medium text-foreground">
                <Tag className="h-2.5 w-2.5" />
                {product.brand}
              </Badge>
            ) : (
              <button
                type="button"
                disabled={brandBusy}
                onClick={onIdentifyBrand}
                title={brandError || "Identify the brand with AI and write it back to Lightspeed"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-muted disabled:opacity-60",
                  brandError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {brandBusy ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : brandError ? (
                  <AlertCircle className="h-2.5 w-2.5" />
                ) : (
                  <Tag className="h-2.5 w-2.5" />
                )}
                {brandBusy ? "Identifying..." : brandError ? "Brand not found" : "No brand — identify"}
              </button>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={!!product.is_bicycle}
                disabled={bicycleBusy}
                onChange={(event) => onSetBicycle(event.target.checked)}
                className="h-3 w-3 rounded-md border-border accent-foreground disabled:opacity-50"
              />
              <Bike className="h-3 w-3" />
              Bicycle
            </label>
            <button
              type="button"
              disabled={bicycleBusy}
              onClick={onAutoDetectBicycle}
              title="Auto-detect whether this product is a complete bicycle"
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {bicycleBusy ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Sparkles className="h-2.5 w-2.5" />
              )}
              Auto-detect
            </button>
          </div>
        </div>

        <div className="hidden items-center gap-1.5 md:flex">
          {FIELD_ORDER.map((field) => (
            <FieldChip
              key={field}
              field={field}
              active={fieldSelection[field]}
              hasContent={fieldHasContent(product, field)}
              disabled={optimiseBusy}
              onToggle={() => onToggleField(field)}
            />
          ))}
        </div>

        {statusText ? (
          <span className="hidden whitespace-nowrap text-[10px] text-muted-foreground xl:block">
            {statusText}
          </span>
        ) : null}

        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide copy editor" : "Edit copy"}
          title={expanded ? "Hide copy editor" : "Edit title, description and specs"}
          onClick={onToggleExpand}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")}
          />
        </button>
        <button
          type="button"
          aria-label="Remove from batch"
          onClick={onRemove}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Mobile field chips */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 md:hidden">
        {FIELD_ORDER.map((field) => (
          <FieldChip
            key={field}
            field={field}
            active={fieldSelection[field]}
            hasContent={fieldHasContent(product, field)}
            disabled={optimiseBusy}
            onToggle={() => onToggleField(field)}
          />
        ))}
      </div>

      {/* Photos — always visible, no expand needed */}
      {imageRun.phase !== "idle" || hasSerperImage(product) || fieldSelection.photos ? (
        <div className="border-t border-border/40 px-4 py-3">
          {hasSerperImage(product) ? (
            <ApprovedImagesStrip product={product} onLightbox={onLightbox} />
          ) : imageRun.phase === "idle" ? (
            <div className="flex items-center gap-2.5">
              <p className="text-xs text-muted-foreground">No photos yet.</p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="rounded-md"
                disabled={photoBusyNow}
                onClick={onFindPhotos}
              >
                <Search className="size-3" />
                Find photos
              </Button>
            </div>
          ) : (
            <OptimizerImageReview
              img={imageRun}
              hasCanonical={!!product.canonical_product_id}
              saving={imageRun.phase === "saving"}
              size="default"
              onSetPrimary={(url) => onImageUpdate({ primaryUrl: url })}
              onRemove={(url) =>
                onImageUpdate((prev) => {
                  if (prev.selectedUrls.length <= 1) return {};
                  const selectedUrls = prev.selectedUrls.filter((item) => item !== url);
                  return {
                    selectedUrls,
                    selectedCandidates: prev.selectedCandidates.filter(
                      (candidate) => candidate.url !== url,
                    ),
                    primaryUrl:
                      prev.primaryUrl === url ? selectedUrls[0] ?? null : prev.primaryUrl,
                  };
                })
              }
              onAdd={(candidate) =>
                onImageUpdate((prev) => {
                  if (
                    prev.selectedUrls.includes(candidate.url) ||
                    prev.selectedUrls.length >= 6
                  ) {
                    return {};
                  }
                  return {
                    selectedUrls: [...prev.selectedUrls, candidate.url],
                    selectedCandidates: [...prev.selectedCandidates, candidate],
                    primaryUrl: prev.primaryUrl ?? candidate.url,
                  };
                })
              }
              onEnhance={onEnhance}
              onToggleAdditional={() =>
                onImageUpdate((prev) => ({ showAdditional: !prev.showAdditional }))
              }
              onApprove={onApproveImages}
              onLightbox={onLightbox}
            />
          )}
        </div>
      ) : null}

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={DROPDOWN_TRANSITION}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-border/60 px-4 py-4">
              {/* Copy editor */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <PenLine className="h-3 w-3 text-muted-foreground" />
                  Copy
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="rounded-md"
                    disabled={copyBusy || (!fieldSelection.title && !fieldSelection.description && !fieldSelection.specs)}
                    onClick={onGenerateCopy}
                  >
                    {copyBusy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                    Generate selected fields
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    className="rounded-md"
                    disabled={saving || !draft}
                    onClick={onSaveDraft}
                  >
                    {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                    Save edits
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Optimised title
                </label>
                <Input
                  value={draft?.title ?? product.display_name ?? ""}
                  onChange={(event) => onDraftChange({ title: event.target.value })}
                  placeholder="No optimised title yet"
                  className="h-8 rounded-md text-xs"
                />
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Description
                  </label>
                  <Textarea
                    value={draft?.description ?? product.product_description ?? ""}
                    onChange={(event) => onDraftChange({ description: event.target.value })}
                    placeholder="No description yet — generate one or write your own"
                    className="min-h-32 rounded-md text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Specifications
                  </label>
                  <Textarea
                    value={draft?.specs ?? product.product_specs ?? ""}
                    onChange={(event) => onDraftChange({ specs: event.target.value })}
                    placeholder="No specs yet"
                    className="min-h-32 rounded-md text-xs"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ── Approved images strip ───────────────────────────────────────────────────

function ApprovedImagesStrip({
  product,
  onLightbox,
}: {
  product: BulkProduct;
  onLightbox: (url: string) => void;
}) {
  const images = [...(product.canonical_images ?? []), ...(product.product_images ?? [])]
    .filter((img) => img.approval_status === "approved" || img.approval_status === null)
    .filter((img) => img.cloudinary_url || img.external_url)
    .slice(0, 8);

  if (images.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">
        Approved photos already saved for this product.
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {images.map((img) => {
          const url = (img.cloudinary_url || img.external_url)!;
          const key = "id" in img && typeof img.id === "string" ? img.id : url;
          const isPrimary = "is_primary" in img && img.is_primary === true;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onLightbox(url)}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted",
                isPrimary ? "border-foreground" : "border-border",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

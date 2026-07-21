"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileText,
  ImageIcon,
  Layers,
  ListChecks,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  StopCircle,
  Type,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/dashboard";
import { OptimizerImageReview } from "@/components/optimize/optimizer-image-review";
import {
  buildSpeedSearchQuery,
  fetchSerperCandidates,
} from "@/lib/admin/image-qa-speed";
import {
  imageRunFromSerperCache,
  type SerperAiSelectionCache,
  type SerperImageCacheEntry,
} from "@/lib/optimize/serper-image-cache";
import { cn } from "@/lib/utils";
import { hasBikeSpecs, parseBikeSpecs } from "@/lib/types/bike-specs";
import {
  emptyImageRun,
  hasDesc,
  hasSerperImage,
  hasSpecs,
  hasSubDescription,
  hasTitle,
  IMG_BUSY,
  IMAGE_CONCURRENCY,
  LightboxOverlay,
  productLabel,
  toSpeedProduct,
  type CategoryOption,
  type CopyField,
  type ImageRun,
  type OptimizerProduct,
  type TextStatus,
  fetchLiveProductSoh,
  fetchOptimizerProductsBySearch,
  useOptimizerCategories,
  useOptimizerProducts,
} from "@/components/optimize/optimizer-shared";
import {
  useOptimizeJobs,
  type OptimizeJob,
} from "@/components/providers/optimize-jobs-provider";

type WizardStep =
  | "category"
  | "goal"
  | "batch"
  | "individual_pick"
  | "individual_work"
  | "copy_batch"
  | "photos"
  | "done";
type OptimiseGoal = "copy" | "photos" | "both";
type BatchSize = "individual" | 10 | 20 | 30 | "all";

const PHOTOS_PAGE_SIZE = 10;
const PHOTOS_PAGE_PRELOAD_CONCURRENCY = 5;

type CopyRun = Record<CopyField, TextStatus> & {
  error?: string;
};

const emptyCopyRun = (): CopyRun => ({
  title: "idle",
  description: "idle",
  specs: "idle",
  subDescription: "idle",
});

const DEFAULT_COPY_FIELDS: Record<CopyField, boolean> = {
  title: true,
  description: true,
  specs: true,
  subDescription: true,
};

function sliceQueueIds(ids: string[], batchSize: BatchSize): string[] {
  if (batchSize === "all") return ids;
  if (batchSize === "individual") return ids;
  return ids.slice(0, batchSize);
}

function shouldPreloadImages(goal: OptimiseGoal | null) {
  return goal === "photos" || goal === "both";
}

function needsCopyStep(goal: OptimiseGoal | null) {
  return goal === "copy" || goal === "both";
}

function photoIdsFromQueue(ids: string[], products: OptimizerProduct[]) {
  return ids.filter((id) => {
    const product = products.find((item) => item.id === id);
    return product && needsPhotos(product);
  });
}

const SERPER_CACHE_CHUNK = 50;

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
    body: JSON.stringify({
      canonicalProductId,
      searchQuery: payload.searchQuery,
      candidates: payload.candidates,
      aiSelection: payload.aiSelection,
    }),
  });
}

type CategoryPreloadState = {
  categoryId: string;
  categoryName: string;
  running: boolean;
  done: number;
  total: number;
  failed: number;
  skipped: number;
  error?: string;
  message?: string;
};

function jobToCategoryPreload(job: OptimizeJob): CategoryPreloadState {
  return {
    categoryId: job.categoryId || "",
    categoryName: job.categoryName || "Category",
    running: job.status === "queued" || job.status === "running",
    done: job.done,
    total: job.total,
    failed: job.failed,
    skipped: job.skipped,
    error: job.errorMessage ?? undefined,
    message: job.message ?? undefined,
  };
}

function copyRunStatus(run: CopyRun | undefined): "idle" | "running" | "done" | "error" {
  if (!run) return "idle";
  const steps = [run.title, run.description, run.specs, run.subDescription];
  if (steps.some((step) => step === "error")) return "error";
  if (steps.some((step) => step === "running" || step === "queued")) return "running";
  if (steps.some((step) => step === "done")) return "done";
  return "idle";
}

function needsCopy(product: OptimizerProduct) {
  return !hasTitle(product) || !hasDesc(product);
}

function needsPhotos(product: OptimizerProduct) {
  return !hasSerperImage(product);
}

function isProductBicycle(
  product: OptimizerProduct,
  bicycleOverrides: Record<string, boolean>,
) {
  return product.id in bicycleOverrides ? bicycleOverrides[product.id] : !!product.is_bicycle;
}

function bikeSpecsPreview(bikeSpecs: unknown): string | null {
  const parsed = parseBikeSpecs(bikeSpecs);
  if (!hasBikeSpecs(parsed)) return null;

  const lines: string[] = [];
  for (const section of parsed!.sections) {
    for (const spec of section.specs) {
      lines.push(`${spec.label}: ${spec.value}`);
      if (lines.length >= 4) return lines.join("\n");
    }
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

function productNeedsGoal(product: OptimizerProduct, goal: OptimiseGoal) {
  if (goal === "copy") return needsCopy(product);
  if (goal === "photos") return needsPhotos(product);
  return needsCopy(product) || needsPhotos(product);
}

function goalLabel(goal: OptimiseGoal | null) {
  if (goal === "copy") return "Copy";
  if (goal === "photos") return "Photos";
  if (goal === "both") return "Copy + photos";
  return "Choose job";
}

const COPY_FIELD_LABELS: Record<CopyField, string> = {
  title: "title",
  description: "description",
  specs: "specs",
  subDescription: "sub description",
};

function getMissingIndividualCopyLabels(
  product: OptimizerProduct,
  copyFields: Record<CopyField, boolean>,
): string[] {
  const missing: string[] = [];
  if (copyFields.title && !hasTitle(product)) missing.push(COPY_FIELD_LABELS.title);
  if (copyFields.description && !hasDesc(product)) missing.push(COPY_FIELD_LABELS.description);
  if (copyFields.specs && !hasSpecs(product)) missing.push(COPY_FIELD_LABELS.specs);
  if (copyFields.subDescription && !hasSubDescription(product)) {
    missing.push(COPY_FIELD_LABELS.subDescription);
  }
  return missing;
}

function formatMissingCopyList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function CatalogueOptimiseModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { categories, loadingCats } = useOptimizerCategories();
  const {
    startCategoryPreload,
    startCategoryCopy,
    startCopyBatch,
    cancelJob,
    jobs,
    getCategoryPreload,
    getCategoryCopy,
    getActiveCopyJob,
  } = useOptimizeJobs();
  const [step, setStep] = React.useState<WizardStep>("category");
  const [category, setCategory] = React.useState("");
  const [goal, setGoal] = React.useState<OptimiseGoal | null>(null);
  const [batchSize, setBatchSize] = React.useState<BatchSize | null>(null);
  const [categorySearch, setCategorySearch] = React.useState("");
  const [productSearch, setProductSearch] = React.useState("");
  const [productSearchResults, setProductSearchResults] = React.useState<OptimizerProduct[]>([]);
  const [productSearchLoading, setProductSearchLoading] = React.useState(false);
  const [pinnedProduct, setPinnedProduct] = React.useState<OptimizerProduct | null>(null);
  const [pendingQueueIds, setPendingQueueIds] = React.useState<string[]>([]);
  const [queueIds, setQueueIds] = React.useState<string[]>([]);
  const [photoQueueIds, setPhotoQueueIds] = React.useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [photoBatchPage, setPhotoBatchPage] = React.useState(0);
  const [selectedCopyIds, setSelectedCopyIds] = React.useState<Set<string>>(new Set());
  const [copySearch, setCopySearch] = React.useState("");
  const [individualPickSearch, setIndividualPickSearch] = React.useState("");
  const [individualHistory, setIndividualHistory] = React.useState<string[]>([]);
  const [copyFields, setCopyFields] = React.useState<Record<CopyField, boolean>>(DEFAULT_COPY_FIELDS);
  const [preloadingImages, setPreloadingImages] = React.useState(false);
  const [preloadProgress, setPreloadProgress] = React.useState({ done: 0, total: 0 });
  const [completedIds, setCompletedIds] = React.useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = React.useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = React.useState<Set<string>>(new Set());
  const [copyRuns, setCopyRuns] = React.useState<Record<string, CopyRun>>({});
  const [imageRuns, setImageRuns] = React.useState<Record<string, ImageRun>>({});
  const activeCopyJob = React.useMemo(() => getActiveCopyJob(), [getActiveCopyJob, jobs]);
  const copyRunning = !!activeCopyJob;
  const copyActiveIds = activeCopyJob?.metadata?.productIds ?? [];
  const [bicycleOverrides, setBicycleOverrides] = React.useState<Record<string, boolean>>({});
  const [bicycleSaving, setBicycleSaving] = React.useState<Set<string>>(new Set());
  const [aiBicycleHints, setAiBicycleHints] = React.useState<
    Record<string, "high" | "medium" | "low">
  >({});
  const [bicycleDetectingIds, setBicycleDetectingIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = React.useState(false);

  const { products, setProducts, loading } = useOptimizerProducts(
    category,
    "all",
    "catalogue",
  );

  const catalogueProducts = React.useMemo(() => {
    if (!pinnedProduct) return products;
    const match = products.find((item) => item.id === pinnedProduct.id);
    return match ? [match] : [pinnedProduct];
  }, [pinnedProduct, products]);

  const productSearchAbortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const query = productSearch.trim();
    if (!query) {
      productSearchAbortRef.current?.abort();
      setProductSearchResults([]);
      setProductSearchLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      productSearchAbortRef.current?.abort();
      const controller = new AbortController();
      productSearchAbortRef.current = controller;
      setProductSearchLoading(true);

      void fetchOptimizerProductsBySearch(query, {
        signal: controller.signal,
        pageSize: 15,
      })
        .then((rows) => {
          if (!controller.signal.aborted) setProductSearchResults(rows);
        })
        .catch(() => {
          if (!controller.signal.aborted) setProductSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setProductSearchLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [productSearch]);

  const sohRefreshAbortRef = React.useRef<AbortController | null>(null);
  const imageAbortRef = React.useRef<AbortController | null>(null);
  const imageCancelledRef = React.useRef(false);
  const preloadQueueImagesRef = React.useRef<
    ((
      ids: string[],
      selectedGoal: OptimiseGoal,
      options?: { concurrency?: number },
    ) => Promise<void>) | null
  >(null);

  const reset = React.useCallback(() => {
    setStep("category");
    setCategory("");
    setGoal(null);
    setBatchSize(null);
    setCategorySearch("");
    setProductSearch("");
    setProductSearchResults([]);
    setProductSearchLoading(false);
    setPinnedProduct(null);
    setPendingQueueIds([]);
    setQueueIds([]);
    setPhotoQueueIds([]);
    setCurrentIndex(0);
    setPhotoBatchPage(0);
    setSelectedCopyIds(new Set());
    setCopySearch("");
    setIndividualPickSearch("");
    setIndividualHistory([]);
    setCopyFields(DEFAULT_COPY_FIELDS);
    setPreloadingImages(false);
    setPreloadProgress({ done: 0, total: 0 });
    setCompletedIds(new Set());
    setSkippedIds(new Set());
    setFailedIds(new Set());
    setCopyRuns({});
    setAiBicycleHints({});
    setBicycleDetectingIds(new Set());
    setImageRuns({});
    setBicycleOverrides({});
    setBicycleSaving(new Set());
    setLightbox(null);
    setApproveConfirmOpen(false);
    imageAbortRef.current?.abort();
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  React.useEffect(() => {
    const sohIds =
      step === "individual_pick"
        ? pendingQueueIds
        : step === "individual_work" || step === "copy_batch"
          ? queueIds
          : [];
    if (sohIds.length === 0) return;

    sohRefreshAbortRef.current?.abort();
    const controller = new AbortController();
    sohRefreshAbortRef.current = controller;

    void fetchLiveProductSoh(sohIds, { signal: controller.signal })
      .then((sohById) => {
        if (controller.signal.aborted || Object.keys(sohById).length === 0) return;
        setProducts((prev) =>
          prev.map((product) =>
            product.id in sohById ? { ...product, qoh: sohById[product.id] } : product,
          ),
        );
        setPinnedProduct((prev) =>
          prev && prev.id in sohById ? { ...prev, qoh: sohById[prev.id] } : prev,
        );
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        console.error("[soh-refresh]", error);
      });

    return () => {
      controller.abort();
    };
  }, [step, queueIds, pendingQueueIds, setProducts]);

  const allCategory = React.useMemo<CategoryOption>(() => {
    return {
      id: "all",
      name: "All products",
      count: categories.reduce((sum, item) => sum + item.count, 0),
      missingImages: categories.reduce((sum, item) => sum + item.missingImages, 0),
      missingSerperImages: categories.reduce(
        (sum, item) => sum + item.missingSerperImages,
        0,
      ),
      missingCopy: categories.reduce((sum, item) => sum + item.missingCopy, 0),
    };
  }, [categories]);

  const categoryRows = React.useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    const rows = [allCategory, ...categories];
    return rows
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.id === "all") return -1;
        if (b.id === "all") return 1;
        const aNeed = a.missingSerperImages + a.missingImages;
        const bNeed = b.missingSerperImages + b.missingImages;
        return bNeed - aNeed || b.count - a.count;
      });
  }, [allCategory, categories, categorySearch]);

  const categoryMeta =
    category === "all"
      ? allCategory
      : categories.find((item) => item.id === category) ?? null;

  const goalCounts = React.useMemo(() => {
    if (pinnedProduct) {
      return { copy: 1, photos: 1, both: 1 };
    }
    return {
      copy: catalogueProducts.filter(needsCopy).length,
      photos: catalogueProducts.filter(needsPhotos).length,
      both: catalogueProducts.filter(
        (product) => needsCopy(product) || needsPhotos(product),
      ).length,
    };
  }, [catalogueProducts, pinnedProduct]);

  const batchProducts = React.useMemo(() => {
    return queueIds
      .map((id) => catalogueProducts.find((product) => product.id === id))
      .filter((product): product is OptimizerProduct => !!product);
  }, [catalogueProducts, queueIds]);

  const photoPageIds = React.useMemo(() => {
    const start = photoBatchPage * PHOTOS_PAGE_SIZE;
    return photoQueueIds.slice(start, start + PHOTOS_PAGE_SIZE);
  }, [photoBatchPage, photoQueueIds]);

  const photoPageProducts = React.useMemo(() => {
    return photoPageIds
      .map((id) => catalogueProducts.find((product) => product.id === id))
      .filter((product): product is OptimizerProduct => !!product);
  }, [catalogueProducts, photoPageIds]);

  const photoBatchPageCount = React.useMemo(
    () => Math.max(1, Math.ceil(photoQueueIds.length / PHOTOS_PAGE_SIZE)),
    [photoQueueIds.length],
  );

  const isLastPhotoBatchPage = photoBatchPage >= photoBatchPageCount - 1;

  const photoPageReadyCount = React.useMemo(() => {
    return photoPageProducts.filter((product) => {
      const run = imageRuns[product.id];
      return run?.phase === "ready" && !!run.primaryUrl;
    }).length;
  }, [imageRuns, photoPageProducts]);

  const individualProduct = React.useMemo(() => {
    const id = queueIds[0];
    if (!id) return null;
    return catalogueProducts.find((product) => product.id === id) ?? null;
  }, [catalogueProducts, queueIds]);

  const missingIndividualCopyLabels = React.useMemo(() => {
    if (!individualProduct || !goal || !needsCopyStep(goal)) return [];
    return getMissingIndividualCopyLabels(individualProduct, copyFields);
  }, [copyFields, goal, individualProduct]);

  const individualApproveLabel = React.useMemo(() => {
    if (pinnedProduct) return "Approve and finish";

    const id = individualProduct?.id;
    if (!id) return "Approve and next";

    const remaining = pendingQueueIds.filter(
      (pid) =>
        pid !== id && !completedIds.has(pid) && !skippedIds.has(pid),
    );
    return remaining.length === 0 ? "Approve and finish" : "Approve and next";
  }, [completedIds, individualProduct?.id, pendingQueueIds, pinnedProduct, skippedIds]);

  const filteredCopyProducts = React.useMemo(() => {
    const q = copySearch.trim().toLowerCase();
    if (!q) return batchProducts;
    return batchProducts.filter((product) => {
      const name = productLabel(product).toLowerCase();
      const title = (product.display_name || product.description || "").toLowerCase();
      const description = (product.product_description || "").toLowerCase();
      const specs = (product.product_specs || "").toLowerCase();
      return (
        name.includes(q) ||
        title.includes(q) ||
        description.includes(q) ||
        specs.includes(q) ||
        (product.brand || "").toLowerCase().includes(q)
      );
    });
  }, [batchProducts, copySearch]);

  const patchProduct = React.useCallback(
    (id: string, patch: Partial<OptimizerProduct>) => {
      setProducts((prev) =>
        prev.map((product) =>
          product.id === id ? { ...product, ...patch } : product,
        ),
      );
    },
    [setProducts],
  );

  const toggleBicycle = React.useCallback(
    async (product: OptimizerProduct, nextValue: boolean) => {
      if (bicycleSaving.has(product.id)) return;

      setBicycleSaving((prev) => new Set(prev).add(product.id));
      setBicycleOverrides((prev) => ({ ...prev, [product.id]: nextValue }));
      patchProduct(product.id, { is_bicycle: nextValue });

      try {
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_bicycle: nextValue }),
        });
        if (!response.ok) throw new Error("Failed to update bicycle flag");
        const data = await response.json();
        if (data.product) {
          patchProduct(product.id, data.product);
        }
      } catch {
        patchProduct(product.id, { is_bicycle: !!product.is_bicycle });
        setBicycleOverrides((prev) => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
      } finally {
        setBicycleSaving((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }
    },
    [bicycleSaving, patchProduct],
  );

  const patchCopyRun = React.useCallback((id: string, patch: Partial<CopyRun>) => {
    setCopyRuns((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyCopyRun()), ...patch },
    }));
  }, []);

  const patchImageRun = React.useCallback(
    (id: string, patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) => {
      setImageRuns((prev) => {
        const cur = prev[id] ?? emptyImageRun();
        const next = typeof patch === "function" ? patch(cur) : patch;
        return { ...prev, [id]: { ...cur, ...next } };
      });
    },
    [],
  );

  const handleCategorySelect = (id: string) => {
    setPinnedProduct(null);
    setProductSearch("");
    setProductSearchResults([]);
    setCategory(id);
    setGoal(null);
    setQueueIds([]);
    setCurrentIndex(0);
    setCompletedIds(new Set());
    setSkippedIds(new Set());
    setFailedIds(new Set());
    setStep("goal");
  };

  const handleProductSelect = (product: OptimizerProduct) => {
    setPinnedProduct(product);
    setProductSearch("");
    setProductSearchResults([]);
    setCategory("");
    setGoal(null);
    setQueueIds([]);
    setCurrentIndex(0);
    setCompletedIds(new Set());
    setSkippedIds(new Set());
    setFailedIds(new Set());
    setProducts((prev) => {
      if (prev.some((item) => item.id === product.id)) {
        return prev.map((item) => (item.id === product.id ? product : item));
      }
      return [product, ...prev];
    });
    setStep("goal");
  };

  const beginBatch = React.useCallback(
    (nextGoal: OptimiseGoal, ids: string[], size: BatchSize) => {
      setBatchSize(size);
      setQueueIds(ids);
      setSelectedCopyIds(new Set(ids));
      setCurrentIndex(0);

      if (size === "individual") {
        setPhotoQueueIds(ids);
        setStep(ids.length > 0 ? "individual_work" : "individual_pick");
        if (ids.length > 0 && shouldPreloadImages(nextGoal)) {
          void preloadQueueImagesRef.current?.(ids, nextGoal);
        }
        return;
      }

      if (nextGoal === "photos") {
        const nextPhotoIds = pinnedProduct
          ? ids
          : photoIdsFromQueue(ids, catalogueProducts);
        setPhotoQueueIds(nextPhotoIds);
        setPhotoBatchPage(0);
        setStep(nextPhotoIds.length > 0 ? "photos" : "done");
        if (nextPhotoIds.length > 0) {
          void preloadQueueImagesRef.current?.(
            nextPhotoIds.slice(0, PHOTOS_PAGE_SIZE),
            "photos",
            { concurrency: PHOTOS_PAGE_PRELOAD_CONCURRENCY },
          );
        }
        return;
      }

      setStep(ids.length > 0 ? "copy_batch" : "done");
    },
    [catalogueProducts, pinnedProduct],
  );

  const handleGoalSelect = (nextGoal: OptimiseGoal) => {
    const ids = pinnedProduct
      ? [pinnedProduct.id]
      : catalogueProducts
          .filter((product) => productNeedsGoal(product, nextGoal))
          .map((product) => product.id);
    setGoal(nextGoal);
    setBatchSize(null);
    setPendingQueueIds(ids);
    setQueueIds([]);
    setCurrentIndex(0);
    setCompletedIds(new Set());
    setSkippedIds(new Set());
    setFailedIds(new Set());

    if (ids.length === 0) {
      setStep("done");
      return;
    }

    if (pinnedProduct) {
      setIndividualHistory([]);
      beginBatch(nextGoal, ids, "individual");
      return;
    }

    setStep("batch");
  };

  const openIndividualProduct = React.useCallback(
    (
      productId: string,
      options?: { preserveRuns?: boolean; recordHistory?: boolean },
    ) => {
      if (!goal) return;

      const preserveRuns = options?.preserveRuns ?? false;
      const recordHistory = options?.recordHistory ?? false;
      const currentId = queueIds[0];

      if (
        recordHistory &&
        step === "individual_work" &&
        currentId &&
        currentId !== productId
      ) {
        setIndividualHistory((prev) => [...prev, currentId]);
      }

      if (!preserveRuns) {
        setCopyRuns((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
        setImageRuns((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
      }

      setCopySearch("");
      setBatchSize("individual");
      setQueueIds([productId]);
      setPhotoQueueIds([productId]);
      setSelectedCopyIds(new Set([productId]));
      setCurrentIndex(0);
      setStep("individual_work");

      if (shouldPreloadImages(goal)) {
        void preloadQueueImagesRef.current?.([productId], goal);
      }
    },
    [goal, queueIds, step],
  );

  const goBackIndividualProduct = React.useCallback(() => {
    if (individualHistory.length > 0) {
      const previousId = individualHistory[individualHistory.length - 1];
      setIndividualHistory((prev) => prev.slice(0, -1));
      setCompletedIds((prev) => {
        const next = new Set(prev);
        next.delete(previousId);
        return next;
      });
      setSkippedIds((prev) => {
        const next = new Set(prev);
        next.delete(previousId);
        return next;
      });
      openIndividualProduct(previousId, { preserveRuns: true, recordHistory: false });
      return;
    }

    if (pinnedProduct) {
      setStep("goal");
      return;
    }

    setStep("individual_pick");
  }, [individualHistory, openIndividualProduct, pinnedProduct]);

  const routeAfterQueueEnd = React.useCallback(
    (mark?: { id: string; kind: "completed" | "skipped" }) => {
      if (batchSize !== "individual") {
        if (mark?.kind === "completed") {
          setCompletedIds((prev) => new Set([...prev, mark.id]));
        } else if (mark?.kind === "skipped") {
          setSkippedIds((prev) => new Set([...prev, mark.id]));
        }
        setStep("done");
        return;
      }

      const nextCompleted =
        mark?.kind === "completed"
          ? new Set([...completedIds, mark.id])
          : completedIds;
      const nextSkipped =
        mark?.kind === "skipped" ? new Set([...skippedIds, mark.id]) : skippedIds;

      if (mark?.kind === "completed") setCompletedIds(nextCompleted);
      if (mark?.kind === "skipped") setSkippedIds(nextSkipped);

      const remaining = pendingQueueIds.filter(
        (pid) => !nextCompleted.has(pid) && !nextSkipped.has(pid),
      );

      if (remaining.length === 0) {
        setStep("done");
        return;
      }

      openIndividualProduct(remaining[0], { recordHistory: true });
    },
    [batchSize, completedIds, openIndividualProduct, pendingQueueIds, skippedIds],
  );

  const handleBatchSizeSelect = (size: BatchSize) => {
    setBatchSize(size);
    if (size === "individual") {
      setIndividualPickSearch("");
      setIndividualHistory([]);
      setStep("individual_pick");
    }
  };

  const handleBatchConfirm = (size: BatchSize) => {
    if (!goal || size === "individual") return;
    const ids = sliceQueueIds(pendingQueueIds, size);
    beginBatch(goal, ids, size);
  };

  const handleIndividualProductSelect = (productId: string) => {
    setIndividualHistory([]);
    openIndividualProduct(productId);
  };

  const pendingPickProducts = React.useMemo(() => {
    return pendingQueueIds
      .map((id) => catalogueProducts.find((product) => product.id === id))
      .filter((product): product is OptimizerProduct => !!product);
  }, [catalogueProducts, pendingQueueIds]);

  const availablePickProducts = React.useMemo(() => {
    return pendingPickProducts.filter(
      (product) => !completedIds.has(product.id) && !skippedIds.has(product.id),
    );
  }, [completedIds, pendingPickProducts, skippedIds]);

  const filteredPickProducts = React.useMemo(() => {
    const q = individualPickSearch.trim().toLowerCase();
    if (!q) return availablePickProducts;
    return availablePickProducts.filter((product) => {
      const name = productLabel(product).toLowerCase();
      return (
        name.includes(q) ||
        (product.brand || "").toLowerCase().includes(q) ||
        (product.product_specs || "").toLowerCase().includes(q)
      );
    });
  }, [availablePickProducts, individualPickSearch]);

  const hydrateImageRunsFromCache = React.useCallback(
    async (targetProducts: OptimizerProduct[]) => {
      const needsHydration = targetProducts.filter((product) => {
        if (!product.canonical_product_id || !needsPhotos(product)) return false;
        const phase = imageRuns[product.id]?.phase ?? "idle";
        return phase === "idle" || phase === "error" || phase === "no_results";
      });
      if (needsHydration.length === 0) return;

      const caches = await fetchSerperCaches(
        needsHydration
          .map((product) => product.canonical_product_id)
          .filter((id): id is string => !!id),
      );

      for (const product of needsHydration) {
        const canonicalId = product.canonical_product_id;
        if (!canonicalId) continue;
        const cached = imageRunFromSerperCache(caches[canonicalId]);
        if (!cached) continue;
        patchImageRun(product.id, { ...emptyImageRun(), ...cached });
      }
    },
    [imageRuns, patchImageRun],
  );

  const preloadPhotoPage = React.useCallback(
    (page: number, ids: string[] = photoQueueIds) => {
      const start = page * PHOTOS_PAGE_SIZE;
      const pageIds = ids.slice(start, start + PHOTOS_PAGE_SIZE);
      if (pageIds.length === 0 || !goal) return;
      const pageProducts = pageIds
        .map((id) => catalogueProducts.find((product) => product.id === id))
        .filter((product): product is OptimizerProduct => !!product);
      void hydrateImageRunsFromCache(pageProducts).then(() => {
        void preloadQueueImagesRef.current?.(pageIds, goal, {
          concurrency: PHOTOS_PAGE_PRELOAD_CONCURRENCY,
        });
      });
    },
    [catalogueProducts, goal, hydrateImageRunsFromCache, photoQueueIds],
  );

  const startPhotosFlow = React.useCallback(() => {
    const nextPhotoIds = pinnedProduct
      ? queueIds
      : photoIdsFromQueue(queueIds, catalogueProducts);
    setPhotoQueueIds(nextPhotoIds);
    setCurrentIndex(0);
    setPhotoBatchPage(0);
    if (nextPhotoIds.length === 0) {
      const id = queueIds[0];
      if (batchSize === "individual" && id) {
        routeAfterQueueEnd({ id, kind: "completed" });
      } else {
        setStep(batchSize === "individual" ? "individual_pick" : "done");
      }
      return;
    }
    setStep("photos");
    const firstPageProducts = nextPhotoIds
      .slice(0, PHOTOS_PAGE_SIZE)
      .map((id) => catalogueProducts.find((product) => product.id === id))
      .filter((product): product is OptimizerProduct => !!product);
    void hydrateImageRunsFromCache(firstPageProducts).then(() => {
      void preloadQueueImagesRef.current?.(
        nextPhotoIds.slice(0, PHOTOS_PAGE_SIZE),
        goal ?? "photos",
        { concurrency: PHOTOS_PAGE_PRELOAD_CONCURRENCY },
      );
    });
  }, [
    batchSize,
    goal,
    catalogueProducts,
    hydrateImageRunsFromCache,
    pinnedProduct,
    queueIds,
    routeAfterQueueEnd,
  ]);

  const goToNextPhotoBatchPage = React.useCallback(() => {
    if (isLastPhotoBatchPage) {
      setStep("done");
      return;
    }

    const nextPage = photoBatchPage + 1;
    setPhotoBatchPage(nextPage);
    preloadPhotoPage(nextPage);
  }, [isLastPhotoBatchPage, photoBatchPage, preloadPhotoPage]);

  const categoryPreload = React.useMemo(() => {
    const running = jobs.find(
      (job) =>
        job.jobType === "category_image_preload" &&
        (job.status === "queued" || job.status === "running"),
    );
    if (running) return jobToCategoryPreload(running);

    const recent = jobs.find((job) => {
      if (job.jobType !== "category_image_preload") return false;
      if (job.status === "failed") return true;
      if (job.status !== "completed" || !job.completedAt) return false;
      return Date.now() - new Date(job.completedAt).getTime() < 5 * 60 * 1000;
    });

    return recent ? jobToCategoryPreload(recent) : null;
  }, [jobs]);

  const runCategoryImagePreload = React.useCallback(
    async (categoryId: string, categoryName: string, options?: { force?: boolean }) => {
      try {
        await startCategoryPreload(categoryId, categoryName, options);
      } catch (error) {
        console.error("[category-preload]", error);
      }
    },
    [startCategoryPreload],
  );

  const runCategoryCopy = React.useCallback(
    async (categoryId: string, categoryName: string) => {
      try {
        await startCategoryCopy(categoryId, categoryName);
      } catch (error) {
        console.error("[category-copy]", error);
      }
    },
    [startCategoryCopy],
  );

  const stopCategoryPreload = React.useCallback(() => {
    const running = jobs.find(
      (job) =>
        job.jobType === "category_image_preload" &&
        (job.status === "queued" || job.status === "running"),
    );
    if (running) void cancelJob(running.id);
  }, [jobs, cancelJob]);

  const runBulkCopy = React.useCallback(
    async (ids: string[]) => {
      const fields = (Object.keys(copyFields) as CopyField[]).filter(
        (field) => copyFields[field],
      );
      if (ids.length === 0 || fields.length === 0) return;

      ids.forEach((id) => {
        patchCopyRun(id, {
          ...(copyFields.title ? { title: "queued" as const } : {}),
          ...(copyFields.description ? { description: "queued" as const } : {}),
          ...(copyFields.specs ? { specs: "queued" as const } : {}),
          ...(copyFields.subDescription ? { subDescription: "queued" as const } : {}),
          error: undefined,
        });
      });

      const overrides = Object.fromEntries(
        ids.filter((id) => id in bicycleOverrides).map((id) => [id, bicycleOverrides[id]]),
      );

      const labelProduct = ids.length === 1 ? catalogueProducts.find((p) => p.id === ids[0]) : null;

      try {
        await startCopyBatch({
          productIds: ids,
          copyFields: {
            title: copyFields.title,
            description: copyFields.description,
            specs: copyFields.specs,
            subDescription: copyFields.subDescription,
          },
          bicycleOverrides: overrides,
          label: labelProduct
            ? `Copy · ${productLabel(labelProduct)}`
            : `Copy · ${ids.length} products`,
        });
      } catch (error) {
        ids.forEach((id) =>
          patchCopyRun(id, {
            error: error instanceof Error ? error.message : "Copy generation failed",
          }),
        );
      }
    },
    [bicycleOverrides, catalogueProducts, copyFields, patchCopyRun, startCopyBatch],
  );

  React.useEffect(() => {
    const job =
      jobs.find((item) => item.jobType === "copy_batch" && item.metadata) ?? null;
    if (!job?.metadata) return;

    const { productIds, copyFields: fields, completedProductIds = [], failedProductIds = [] } =
      job.metadata;
    const running = job.status === "queued" || job.status === "running";

    setCopyRuns((prev) => {
      const next = { ...prev };
      for (const id of productIds) {
        const existing = next[id] ?? emptyCopyRun();
        if (completedProductIds.includes(id)) {
          next[id] = {
            title: fields.title ? "done" : existing.title,
            description: fields.description ? "done" : existing.description,
            specs: fields.specs ? "done" : existing.specs,
            subDescription: fields.subDescription ? "done" : existing.subDescription,
          };
        } else if (failedProductIds.includes(id)) {
          next[id] = {
            title: fields.title ? "error" : existing.title,
            description: fields.description ? "error" : existing.description,
            specs: fields.specs ? "error" : existing.specs,
            subDescription: fields.subDescription ? "error" : existing.subDescription,
            error: "Generation failed",
          };
        } else if (running) {
          next[id] = {
            title: fields.title ? "running" : existing.title,
            description: fields.description ? "running" : existing.description,
            specs: fields.specs ? "running" : existing.specs,
            subDescription: fields.subDescription ? "running" : existing.subDescription,
          };
        }
      }
      return next;
    });
  }, [jobs]);

  React.useEffect(() => {
    if (!activeCopyJob || !copyRunning) return;
    const ids = activeCopyJob.metadata?.productIds ?? [];
    if (ids.length === 0) return;

    let cancelled = false;

    const refreshProducts = async () => {
      const params = new URLSearchParams({
        page: "1",
        pageSize: String(Math.max(ids.length, 1)),
        ids: ids.join(","),
      });

      const response = await fetch(`/api/products?${params}`);
      if (!response.ok || cancelled) return;

      const json = (await response.json()) as { products?: OptimizerProduct[] };
      const rows = json.products ?? [];
      if (rows.length === 0 || cancelled) return;

      setProducts((prev) => {
        const byId = new Map(prev.map((product) => [product.id, product]));
        for (const row of rows) {
          const existing = byId.get(row.id);
          byId.set(row.id, existing ? { ...existing, ...row } : row);
        }
        return [...byId.values()];
      });
    };

    void refreshProducts();
    const interval = window.setInterval(() => {
      void refreshProducts();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeCopyJob?.id, copyRunning, setProducts]);

  const runImageSearch = React.useCallback(
    async (
      product: OptimizerProduct,
      options?: { background?: boolean; cacheEntry?: SerperImageCacheEntry | null },
    ) => {
      const background = options?.background ?? false;

      if (!product.canonical_product_id) {
        patchImageRun(product.id, {
          phase: "error",
          error: "No canonical product. Sync from Lightspeed first.",
        });
        if (!background) {
          setFailedIds((prev) => new Set([...prev, product.id]));
        }
        return false;
      }

      imageCancelledRef.current = false;
      const controller = new AbortController();
      if (!background) {
        imageAbortRef.current = controller;
      }
      try {
        const speedProduct = toSpeedProduct(product);
        const searchQuery = buildSpeedSearchQuery(speedProduct);
        let cacheEntry = options?.cacheEntry ?? null;

        if (!cacheEntry && product.canonical_product_id) {
          const caches = await fetchSerperCaches([product.canonical_product_id]);
          cacheEntry = caches[product.canonical_product_id] ?? null;
        }

        const cachedRun = imageRunFromSerperCache(cacheEntry ?? undefined);
        if (cachedRun?.phase === "ready") {
          patchImageRun(product.id, { ...emptyImageRun(), ...cachedRun });
          return true;
        }

        let candidates = cacheEntry?.candidates ?? [];
        if (candidates.length === 0) {
          patchImageRun(product.id, { ...emptyImageRun(), phase: "searching" });
          candidates = await fetchSerperCandidates(speedProduct, searchQuery);
        }

        if (!background && imageCancelledRef.current) return false;
        if (candidates.length === 0) {
          patchImageRun(product.id, {
            phase: "no_results",
            error: "No images found",
          });
          saveSerperCache(product.canonical_product_id, {
            searchQuery,
            candidates: [],
            aiSelection: null,
          });
          if (!background) {
            setFailedIds((prev) => new Set([...prev, product.id]));
          }
          return false;
        }

        patchImageRun(product.id, { phase: "selecting", candidates });
        const response = await fetch("/api/admin/images/ai-select-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: speedProduct.store_product_name || speedProduct.normalized_name,
            brand: speedProduct.manufacturer || undefined,
            upc: speedProduct.upc || undefined,
            candidates,
            maxImages: 6,
          }),
          signal: controller.signal,
        });

        const json = await response.json();
        if (!response.ok || !json.success || !json.primaryUrl) {
          throw new Error(json.error || "Image selection failed");
        }

        if (!background && imageCancelledRef.current) return false;
        patchImageRun(product.id, {
          phase: "ready",
          candidates,
          selectedCandidates: json.selectedCandidates,
          selectedUrls: json.selectedUrls,
          primaryUrl: json.primaryUrl,
          reasoning: json.reasoning,
          error: undefined,
        });
        saveSerperCache(product.canonical_product_id, {
          searchQuery: cacheEntry?.searchQuery || searchQuery,
          candidates,
          aiSelection: {
            selectedCandidates: json.selectedCandidates,
            selectedUrls: json.selectedUrls,
            primaryUrl: json.primaryUrl,
            reasoning: json.reasoning,
          },
        });
        return true;
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          patchImageRun(product.id, {
            phase: "error",
            error: error instanceof Error ? error.message : "Image search failed",
          });
          if (!background) {
            setFailedIds((prev) => new Set([...prev, product.id]));
          }
        }
        return false;
      } finally {
        if (!background) {
          imageAbortRef.current = null;
        }
      }
    },
    [patchImageRun],
  );

  preloadQueueImagesRef.current = async (
    ids: string[],
    selectedGoal: OptimiseGoal,
    options?: { concurrency?: number },
  ) => {
    if (!shouldPreloadImages(selectedGoal)) return;

    const concurrency = options?.concurrency ?? IMAGE_CONCURRENCY;

    const skipPhases = new Set<ImageRun["phase"]>([
      "searching",
      "selecting",
      "ready",
      "saving",
      "done",
    ]);

    const targets = ids
      .map((id) => catalogueProducts.find((product) => product.id === id))
      .filter((product): product is OptimizerProduct => {
        if (!product || !needsPhotos(product)) return false;
        const phase = imageRuns[product.id]?.phase;
        return !phase || !skipPhases.has(phase);
      });

    if (targets.length === 0) return;

    const caches = await fetchSerperCaches(
      targets
        .map((product) => product.canonical_product_id)
        .filter((id): id is string => !!id),
    );

    const pending: OptimizerProduct[] = [];
    for (const product of targets) {
      const canonicalId = product.canonical_product_id;
      const cached = canonicalId ? imageRunFromSerperCache(caches[canonicalId]) : null;
      if (cached?.phase === "ready") {
        patchImageRun(product.id, { ...emptyImageRun(), ...cached });
        continue;
      }
      pending.push(product);
    }

    if (pending.length === 0) return;

    setPreloadingImages(true);
    setPreloadProgress({ done: 0, total: pending.length });

    let completed = 0;
    for (let index = 0; index < pending.length; index += concurrency) {
      const chunk = pending.slice(index, index + concurrency);
      await Promise.all(
        chunk.map(async (product) => {
          const canonicalId = product.canonical_product_id;
          await runImageSearch(product, {
            background: true,
            cacheEntry: canonicalId ? caches[canonicalId] ?? null : null,
          });
          completed += 1;
          setPreloadProgress({ done: completed, total: pending.length });
        }),
      );
    }

    setPreloadingImages(false);
  };

  const approveImages = React.useCallback(
    async (product: OptimizerProduct, snapshot?: ImageRun) => {
      const run = snapshot ?? imageRuns[product.id] ?? emptyImageRun();
      if (!product.canonical_product_id || run.phase !== "ready" || !run.primaryUrl) {
        return false;
      }

      patchImageRun(product.id, { phase: "saving", error: undefined });

      try {
        const speedProduct = toSpeedProduct(product);
        const response = await fetch("/api/admin/images/approve-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonicalProductId: product.canonical_product_id,
            selectedCandidates: run.selectedCandidates,
            primaryCandidateUrl: run.primaryUrl,
            searchQuery: buildSpeedSearchQuery(speedProduct),
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
        setCompletedIds((prev) => new Set([...prev, product.id]));
        return true;
      } catch (error) {
        patchImageRun(product.id, {
          phase: "ready",
          error: error instanceof Error ? error.message : "Failed to save images",
        });
        setFailedIds((prev) => new Set([...prev, product.id]));
        return false;
      }
    },
    [imageRuns, patchImageRun, patchProduct],
  );

  const approveAllReadyOnPhotoPage = React.useCallback(async () => {
    const ready = photoPageProducts.filter((product) => {
      const run = imageRuns[product.id];
      return run?.phase === "ready" && !!run.primaryUrl;
    });

    await Promise.all(
      ready.map((product) => approveImages(product, imageRuns[product.id])),
    );
  }, [approveImages, imageRuns, photoPageProducts]);

  const finishIndividualWork = React.useCallback(
    async (kind: "completed" | "skipped" = "completed") => {
      const product = individualProduct;
      if (!product) return;

      if (kind === "completed" && goal && shouldPreloadImages(goal) && needsPhotos(product)) {
        const run = imageRuns[product.id] ?? emptyImageRun();
        if (run.phase === "ready" && run.primaryUrl) {
          await approveImages(product, run);
        }
      }

      routeAfterQueueEnd({ id: product.id, kind });
    },
    [approveImages, goal, imageRuns, individualProduct, routeAfterQueueEnd],
  );

  const requestFinishIndividualWork = React.useCallback(
    (kind: "completed" | "skipped") => {
      if (kind === "completed" && missingIndividualCopyLabels.length > 0) {
        setApproveConfirmOpen(true);
        return;
      }
      void finishIndividualWork(kind);
    },
    [finishIndividualWork, missingIndividualCopyLabels.length],
  );

  const updateImageRun = React.useCallback(
    (productId: string) =>
      (patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) =>
        patchImageRun(productId, patch),
    [patchImageRun],
  );

  const stopCurrent = () => {
    if (activeCopyJob) {
      void cancelJob(activeCopyJob.id);
    }
    imageCancelledRef.current = true;
    imageAbortRef.current?.abort();
  };

  const activeCopyFields = React.useMemo(
    () => (Object.keys(copyFields) as CopyField[]).filter((field) => copyFields[field]),
    [copyFields],
  );

  const copyBackgroundProgress = React.useMemo(() => {
    if (!copyRunning || !activeCopyJob || copyActiveIds.length === 0) return null;
    return { done: activeCopyJob.done, total: activeCopyJob.total || copyActiveIds.length };
  }, [activeCopyJob, copyActiveIds.length, copyRunning]);

  const toggleCopySelect = (id: string) => {
    setSelectedCopyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCopySelectAll = () => {
    const visibleIds = filteredCopyProducts.map((product) => product.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedCopyIds.has(id));
    setSelectedCopyIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "grid h-[min(820px,calc(100vh-1.5rem))] max-w-[calc(100vw-1.5rem)] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-lg p-0",
          step === "copy_batch" || step === "photos" || step === "individual_work"
            ? "sm:max-w-6xl"
            : "sm:max-w-5xl",
        )}
        onEscapeKeyDown={(event) => {
          if (lightbox) {
            event.preventDefault();
            setLightbox(null);
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-border bg-background px-5 py-3.5">
          <DialogHeader className="gap-0 p-0 text-left">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Catalogue optimise
            </DialogTitle>
          </DialogHeader>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div
          className={cn(
            "min-h-0",
            step === "category" || step === "individual_pick"
              ? "flex flex-col overflow-hidden"
              : "overflow-y-auto",
          )}
        >
          {step === "category" && (
            <CategoryStep
              categories={categoryRows}
              loading={loadingCats}
              search={categorySearch}
              onSearchChange={setCategorySearch}
              onSelect={handleCategorySelect}
              productSearch={productSearch}
              onProductSearchChange={setProductSearch}
              productSearchResults={productSearchResults}
              productSearchLoading={productSearchLoading}
              onProductSelect={handleProductSelect}
              categoryPreload={categoryPreload}
              onPreloadCategory={(categoryId, categoryName) =>
                void runCategoryImagePreload(categoryId, categoryName)
              }
              onPreloadCopy={(categoryId, categoryName) =>
                void runCategoryCopy(categoryId, categoryName)
              }
              onStopPreload={stopCategoryPreload}
              getCategoryPreload={getCategoryPreload}
              getCategoryCopy={getCategoryCopy}
            />
          )}

          {step === "goal" && (
            <GoalStep
              category={categoryMeta}
              pinnedProduct={pinnedProduct}
              loading={loading && !pinnedProduct}
              counts={goalCounts}
              onSelect={handleGoalSelect}
            />
          )}

          {step === "batch" && goal && (
            <BatchStep
              totalAvailable={pendingQueueIds.length}
              goal={goal}
              selected={batchSize}
              onSelect={handleBatchSizeSelect}
            />
          )}

          {step === "individual_pick" && goal && (
            <IndividualPickStep
              products={filteredPickProducts}
              totalCount={availablePickProducts.length}
              completedIds={completedIds}
              skippedIds={skippedIds}
              goal={goal}
              search={individualPickSearch}
              onSearchChange={setIndividualPickSearch}
              onSelect={handleIndividualProductSelect}
            />
          )}

          {step === "individual_work" && goal && (
            <IndividualWorkStep
              product={individualProduct}
              goal={goal}
              loading={loading}
              copyRun={individualProduct ? copyRuns[individualProduct.id] : undefined}
              copyFields={copyFields}
              copyRunning={copyRunning}
              imageRun={
                individualProduct
                  ? imageRuns[individualProduct.id] ?? emptyImageRun()
                  : emptyImageRun()
              }
              imageRunning={
                individualProduct
                  ? IMG_BUSY.includes(imageRuns[individualProduct.id]?.phase ?? "idle")
                  : false
              }
              preloadingImages={preloadingImages}
              preloadProgress={preloadProgress}
              bicycleOverrides={bicycleOverrides}
              bicycleSaving={bicycleSaving}
              aiBicycleHints={aiBicycleHints}
              bicycleDetectingIds={bicycleDetectingIds}
              onCopyFieldsChange={setCopyFields}
              onToggleBicycle={toggleBicycle}
              onRunImages={() =>
                individualProduct && void runImageSearch(individualProduct, { background: true })
              }
              onImageUpdate={
                individualProduct ? updateImageRun(individualProduct.id) : () => undefined
              }
              onApproveImages={() => {
                if (!individualProduct) return;
                const run = imageRuns[individualProduct.id] ?? emptyImageRun();
                if (run.phase === "ready" && run.primaryUrl) {
                  void approveImages(individualProduct, run);
                }
              }}
              onLightbox={setLightbox}
            />
          )}

          {copyBackgroundProgress && (step === "copy_batch" || step === "photos") ? (
            <BackgroundCopyBanner
              progress={copyBackgroundProgress}
              onStop={stopCurrent}
            />
          ) : null}

          {step === "copy_batch" && goal && batchSize !== "individual" && (
            <CopyBatchStep
              products={filteredCopyProducts}
              totalCount={batchProducts.length}
              copyRuns={copyRuns}
              copyFields={copyFields}
              selectedIds={selectedCopyIds}
              search={copySearch}
              running={copyRunning}
              onSearchChange={setCopySearch}
              onCopyFieldsChange={setCopyFields}
              onToggleSelect={toggleCopySelect}
              onToggleSelectAll={toggleCopySelectAll}
              bicycleOverrides={bicycleOverrides}
              bicycleSaving={bicycleSaving}
              aiBicycleHints={aiBicycleHints}
              bicycleDetectingIds={bicycleDetectingIds}
              onToggleBicycle={toggleBicycle}
            />
          )}

          {step === "photos" && goal && batchSize !== "individual" && (
            <PhotosBatchStep
              products={photoPageProducts}
              pageIndex={photoBatchPage}
              pageCount={photoBatchPageCount}
              totalCount={photoQueueIds.length}
              imageRuns={imageRuns}
              loading={loading}
              preloadingImages={preloadingImages}
              preloadProgress={preloadProgress}
              onRunImages={(product) => void runImageSearch(product, { background: true })}
              onImageUpdate={(productId) => updateImageRun(productId)}
              onApproveImages={(product) => void approveImages(product)}
              onLightbox={setLightbox}
            />
          )}

          {step === "done" && (
            <DoneStep
              category={categoryMeta}
              goal={goal}
              completed={completedIds.size}
              skipped={skippedIds.size}
              failed={failedIds.size}
              onChooseAnother={() => {
                setStep("category");
                setCategory("");
                setPinnedProduct(null);
                setProductSearch("");
                setProductSearchResults([]);
                setGoal(null);
                setBatchSize(null);
                setPendingQueueIds([]);
                setQueueIds([]);
                setPhotoQueueIds([]);
                setCurrentIndex(0);
                setSelectedCopyIds(new Set());
              }}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-popover px-5 py-4">
          <div className="flex items-center gap-2">
            {step !== "category" && step !== "done" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (step === "individual_work") {
                    goBackIndividualProduct();
                  } else if (step === "photos") {
                    setStep(
                      needsCopyStep(goal)
                        ? "copy_batch"
                        : pinnedProduct
                          ? "goal"
                          : "batch",
                    );
                  } else if (step === "copy_batch") {
                    setStep(pinnedProduct ? "goal" : "batch");
                  } else if (step === "individual_pick") {
                    setStep("batch");
                  } else if (step === "batch") {
                    setStep("goal");
                  } else {
                    setPinnedProduct(null);
                    setStep("category");
                  }
                }}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
            )}
            {step === "individual_work" && individualProduct && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={copyRunning}
                onClick={() => void finishIndividualWork("skipped")}
              >
                Skip
              </Button>
            )}
            {step === "photos" && batchSize !== "individual" && photoPageProducts.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={copyRunning || preloadingImages}
                onClick={() => void preloadPhotoPage(photoBatchPage)}
              >
                <RefreshCw className="size-4" />
                Reload images
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === "done" ? (
              <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            ) : step === "batch" ? (
              batchSize && batchSize !== "individual" ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={pendingQueueIds.length === 0}
                  onClick={() => handleBatchConfirm(batchSize)}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              ) : null
            ) : step === "individual_work" && individualProduct ? (
              <>
                {copyRunning ? (
                  <Button type="button" size="sm" variant="outline" onClick={stopCurrent}>
                    <StopCircle className="size-4" />
                    Stop
                  </Button>
                ) : needsCopyStep(goal) ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={activeCopyFields.length === 0}
                    onClick={() => void runBulkCopy([individualProduct.id])}
                  >
                    <Sparkles className="size-4" />
                    Generate copy
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={copyRunning}
                  onClick={() => requestFinishIndividualWork("completed")}
                >
                  <CheckCircle2 className="size-4" />
                  {individualApproveLabel}
                </Button>
              </>
            ) : step === "copy_batch" ? (
              <>
                {copyRunning ? (
                  <Button type="button" size="sm" variant="outline" onClick={stopCurrent}>
                    <StopCircle className="size-4" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={selectedCopyIds.size === 0 || activeCopyFields.length === 0}
                    onClick={() =>
                      void runBulkCopy(Array.from(selectedCopyIds))
                    }
                  >
                    <Sparkles className="size-4" />
                    Generate copy
                    {selectedCopyIds.size > 0 ? ` (${selectedCopyIds.size})` : ""}
                  </Button>
                )}
                {goal === "both" ? (
                  <Button type="button" size="sm" onClick={startPhotosFlow}>
                    {copyRunning ? "Continue to photos (copy in background)" : "Continue to photos"}
                    <ChevronRight className="size-4" />
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={() => setStep("done")}>
                    Finish
                  </Button>
                )}
              </>
            ) : step === "photos" && batchSize !== "individual" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={preloadingImages || photoPageReadyCount === 0}
                  onClick={() => void approveAllReadyOnPhotoPage()}
                >
                  <CheckCircle2 className="size-4" />
                  Approve all ready
                  {photoPageReadyCount > 0 ? ` (${photoPageReadyCount})` : ""}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={preloadingImages}
                  onClick={goToNextPhotoBatchPage}
                >
                  {isLastPhotoBatchPage ? "Finish" : "Next 10"}
                  <ChevronRight className="size-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <LightboxOverlay url={lightbox} onClose={() => setLightbox(null)} />
      </DialogContent>

      <AlertDialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
        <AlertDialogContent className="rounded-md border border-border bg-white animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:max-w-md">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Continue without generating copy?</AlertDialogTitle>
            <AlertDialogDescription>
              {individualProduct ? (
                <>
                  <span className="font-medium text-foreground">{productLabel(individualProduct)}</span>{" "}
                  is still missing {formatMissingCopyList(missingIndividualCopyLabels)} for the fields
                  you selected. Do you want to continue without generating copy?
                </>
              ) : (
                "This product is still missing copy for the fields you selected. Do you want to continue?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Go back</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-md"
              onClick={() => {
                setApproveConfirmOpen(false);
                void finishIndividualWork("completed");
              }}
            >
              Continue anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function BackgroundCopyBanner({
  progress,
  onStop,
}: {
  progress: { done: number; total: number };
  onStop: () => void;
}) {
  return (
    <div className="border-b border-border bg-white px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Copy generating in background</p>
            <p className="text-xs text-muted-foreground">
              {progress.done} of {progress.total} products complete. You can keep reviewing photos.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onStop}>
          <StopCircle className="size-4" />
          Stop copy
        </Button>
      </div>
    </div>
  );
}

function CategoryStep({
  categories,
  loading,
  search,
  onSearchChange,
  onSelect,
  productSearch,
  onProductSearchChange,
  productSearchResults,
  productSearchLoading,
  onProductSelect,
  categoryPreload,
  onPreloadCategory,
  onPreloadCopy,
  onStopPreload,
  getCategoryPreload,
  getCategoryCopy,
}: {
  categories: CategoryOption[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  productSearchResults: OptimizerProduct[];
  productSearchLoading: boolean;
  onProductSelect: (product: OptimizerProduct) => void;
  categoryPreload: CategoryPreloadState | null;
  onPreloadCategory: (categoryId: string, categoryName: string) => void;
  onPreloadCopy: (categoryId: string, categoryName: string) => void;
  onStopPreload: () => void;
  getCategoryPreload: (categoryId: string) => OptimizeJob | null;
  getCategoryCopy: (categoryId: string) => OptimizeJob | null;
}) {
  const showProductResults = productSearch.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 px-5 py-6">
      <div className="shrink-0">
        <h2 className="text-lg font-semibold text-foreground">What do you want to optimise?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search for a product, or choose a category to work through in batches.
        </p>
      </div>

      <div className="shrink-0 rounded-md border border-border bg-white p-4">
        <p className="text-sm font-medium text-foreground">Search for a product</p>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={productSearch}
            onChange={(event) => onProductSearchChange(event.target.value)}
            placeholder="Name, SKU, or description"
            className="pl-9"
          />
        </div>

        {showProductResults ? (
          <div className="mt-3 max-h-48 overflow-y-auto overscroll-contain">
            {productSearchLoading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Searching products
              </div>
            ) : productSearchResults.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                No products found
              </p>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
                {productSearchResults.map((product) => {
                  const needsWork = needsCopy(product) || needsPhotos(product);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => onProductSelect(product)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-muted/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {productLabel(product)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {product.brand || "No brand"}
                          {product.upc ? ` · ${product.upc}` : ""}
                          {needsWork ? "" : " · already complete"}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {!showProductResults ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex shrink-0 items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground">or browse by category</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search categories"
              className="pl-9"
            />
          </div>

          {categoryPreload ? (
            <div className="shrink-0 rounded-md border border-border bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {categoryPreload.error
                      ? `Preload failed for ${categoryPreload.categoryName}`
                      : categoryPreload.running
                        ? `Preloading images for ${categoryPreload.categoryName}`
                        : `Preload finished for ${categoryPreload.categoryName}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {categoryPreload.error ? (
                      categoryPreload.error
                    ) : (
                      <>
                        {categoryPreload.message ||
                          `${categoryPreload.done} of ${categoryPreload.total || "…"} products`}
                        {categoryPreload.total > 0
                          ? ` · ${categoryPreload.done} of ${categoryPreload.total} done`
                          : null}
                        {categoryPreload.skipped > 0
                          ? ` · ${categoryPreload.skipped} already cached or approved`
                          : ""}
                        {categoryPreload.failed > 0 ? ` · ${categoryPreload.failed} failed` : ""}
                      </>
                    )}
                  </p>
                </div>
                {categoryPreload.running ? (
                  <Button type="button" variant="outline" size="sm" onClick={onStopPreload}>
                    <StopCircle className="size-4" />
                    Stop
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {loading ? (
            <CenteredState label="Loading categories" />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-background">
              <div className="divide-y divide-border">
                {categories.map((category) => {
                  const photoNeed = category.missingSerperImages || category.missingImages;
                  const copyNeed = category.missingCopy;
                  const preloadJob = getCategoryPreload(category.id);
                  const copyJob = getCategoryCopy(category.id);
                  const isPreloadingThis =
                    !!preloadJob &&
                    (preloadJob.status === "queued" || preloadJob.status === "running");
                  const isCopyingThis =
                    !!copyJob &&
                    (copyJob.status === "queued" || copyJob.status === "running");
                  const canPreload = category.id !== "all" && photoNeed > 0;
                  const canLoadCopy = category.id !== "all" && copyNeed > 0;
                  return (
                    <div
                      key={category.id}
                      className="flex items-center gap-2 px-4 py-3 transition hover:bg-muted/60"
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(category.id)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {category.id === "all" ? (
                              <Layers className="size-4 text-muted-foreground" />
                            ) : (
                              <Package className="size-4 text-muted-foreground" />
                            )}
                            <p className="truncate text-sm font-medium text-foreground">
                              {category.name}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {category.count.toLocaleString()} products
                            {copyNeed > 0 ? ` - ${copyNeed.toLocaleString()} need copy` : ""}
                            {photoNeed > 0 ? ` - ${photoNeed.toLocaleString()} need photos` : ""}
                          </p>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                      {canLoadCopy || canPreload ? (
                        <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                          {canLoadCopy ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isCopyingThis}
                              onClick={() => onPreloadCopy(category.id, category.name)}
                            >
                              {isCopyingThis ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Type className="size-4" />
                              )}
                              Load copy
                            </Button>
                          ) : null}
                          {canPreload ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isPreloadingThis}
                              onClick={() => onPreloadCategory(category.id, category.name)}
                            >
                              {isPreloadingThis ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <ImageIcon className="size-4" />
                              )}
                              Load images
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GoalStep({
  category,
  pinnedProduct,
  loading,
  counts,
  onSelect,
}: {
  category: CategoryOption | null;
  pinnedProduct: OptimizerProduct | null;
  loading: boolean;
  counts: Record<OptimiseGoal, number>;
  onSelect: (goal: OptimiseGoal) => void;
}) {
  const goals = [
    {
      id: "copy" as const,
      title: "Fix copy",
      description: "Clean titles and write descriptions.",
      icon: Type,
      count: counts.copy,
    },
    {
      id: "photos" as const,
      title: "Add photos",
      description: "Find and approve product images.",
      icon: ImageIcon,
      count: counts.photos,
    },
    {
      id: "both" as const,
      title: "Copy + photos",
      description: "Complete each product in one pass.",
      icon: Sparkles,
      count: counts.both,
    },
  ];

  return (
    <div className="flex w-full flex-col gap-4 px-5 py-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Choose job</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {pinnedProduct
            ? productLabel(pinnedProduct)
            : category?.name ?? "Catalogue"}
          {pinnedProduct
            ? ""
            : category
              ? ` - ${category.count.toLocaleString()} products`
              : ""}
        </p>
      </div>

      {loading ? (
        <CenteredState label="Loading products" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {goals.map((goal) => {
            const Icon = goal.icon;
            const disabled = goal.count === 0;
            return (
              <button
                key={goal.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(goal.id)}
                className={cn(
                  "flex min-h-44 flex-col rounded-md border border-border bg-background p-4 text-left transition",
                  "hover:border-foreground/25 hover:shadow-sm",
                  disabled && "cursor-not-allowed opacity-45 hover:border-border hover:shadow-none",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-5 text-foreground" />
                </span>
                <span className="mt-4 text-base font-semibold text-foreground">
                  {goal.title}
                </span>
                <span className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {goal.description}
                </span>
                <span className="mt-auto pt-4 text-xs font-medium text-muted-foreground">
                  {goal.count.toLocaleString()} product{goal.count === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BatchStep({
  totalAvailable,
  goal,
  selected,
  onSelect,
}: {
  totalAvailable: number;
  goal: OptimiseGoal;
  selected: BatchSize | null;
  onSelect: (size: BatchSize) => void;
}) {
  const options: Array<{
    id: BatchSize;
    title: string;
    description: string;
    count: number;
    risky?: boolean;
  }> = [
    {
      id: "individual",
      title: "Individual",
      description: "Pick one product at a time and run full AI optimisation.",
      count: totalAvailable,
    },
    {
      id: 10,
      title: "10 products",
      description: "A focused batch to review without fatigue.",
      count: Math.min(10, totalAvailable),
    },
    {
      id: 20,
      title: "20 products",
      description: "A medium batch for steady progress.",
      count: Math.min(20, totalAvailable),
    },
    {
      id: 30,
      title: "30 products",
      description: "A larger batch when you want momentum.",
      count: Math.min(30, totalAvailable),
    },
    {
      id: "all",
      title: "All products",
      description: "Process every matching product in this category.",
      count: totalAvailable,
      risky: true,
    },
  ];

  return (
    <div className="flex w-full flex-col gap-4 px-5 py-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">How many at a time?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalAvailable.toLocaleString()} product{totalAvailable === 1 ? "" : "s"} need{" "}
          {goalLabel(goal).toLowerCase()}. Choose a batch size for this run.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const disabled = option.count === 0;
          const isSelected = selected === option.id;
          return (
            <button
              key={String(option.id)}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option.id)}
              className={cn(
                "flex min-h-32 flex-col rounded-md border bg-background p-4 text-left transition",
                isSelected
                  ? "border-foreground ring-1 ring-foreground/10"
                  : "border-border hover:border-foreground/25 hover:shadow-sm",
                disabled && "cursor-not-allowed opacity-45 hover:border-border hover:shadow-none",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-base font-semibold text-foreground">{option.title}</span>
                {option.risky && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                    <AlertTriangle className="size-3" />
                    Risk
                  </span>
                )}
              </div>
              <span className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {option.description}
              </span>
              <span className="mt-auto pt-3 text-xs font-medium text-muted-foreground">
                {option.id === "individual"
                  ? `${option.count.toLocaleString()} to choose from`
                  : `${option.count.toLocaleString()} in this batch`}
              </span>
            </button>
          );
        })}
      </div>

      {goal === "photos" && selected && selected !== "individual" && (
        <div className="rounded-md border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          When you continue, Serper images for this batch will preload in the background so
          each product opens with photos ready to review.
        </div>
      )}
    </div>
  );
}

function IndividualPickStep({
  products,
  totalCount,
  completedIds,
  skippedIds,
  goal,
  search,
  onSearchChange,
  onSelect,
}: {
  products: OptimizerProduct[];
  totalCount: number;
  completedIds: Set<string>;
  skippedIds: Set<string>;
  goal: OptimiseGoal;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (productId: string) => void;
}) {
  const doneCount = completedIds.size + skippedIds.size;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 px-5 py-6">
      <div className="shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Choose a product</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Work through products one at a time with full {goalLabel(goal).toLowerCase()}.
          {doneCount > 0
            ? ` ${doneCount.toLocaleString()} done, ${totalCount.toLocaleString()} remaining.`
            : ` ${totalCount.toLocaleString()} product${totalCount === 1 ? "" : "s"} to go.`}
        </p>
      </div>

      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search products"
          className="pl-9"
        />
      </div>

      {totalCount === 0 ? (
        <div className="rounded-md border border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          All products in this run are complete.
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-md border border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          No products match your search.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-background">
          <div className="divide-y divide-border">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect(product.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {productLabel(product)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {product.brand || "No brand"}
                    {product.upc ? ` · ${product.upc}` : ""}
                    {typeof product.qoh === "number" ? ` · SOH ${product.qoh}` : ""}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IndividualWorkStep({
  product,
  goal,
  loading,
  copyRun,
  copyFields,
  copyRunning,
  imageRun,
  imageRunning,
  preloadingImages,
  preloadProgress,
  bicycleOverrides,
  bicycleSaving,
  aiBicycleHints,
  bicycleDetectingIds,
  onCopyFieldsChange,
  onToggleBicycle,
  onRunImages,
  onImageUpdate,
  onApproveImages,
  onLightbox,
}: {
  product: OptimizerProduct | null;
  goal: OptimiseGoal;
  loading: boolean;
  copyRun: CopyRun | undefined;
  copyFields: Record<CopyField, boolean>;
  copyRunning: boolean;
  imageRun: ImageRun;
  imageRunning: boolean;
  preloadingImages: boolean;
  preloadProgress: { done: number; total: number };
  bicycleOverrides: Record<string, boolean>;
  bicycleSaving: Set<string>;
  aiBicycleHints: Record<string, "high" | "medium" | "low">;
  bicycleDetectingIds: Set<string>;
  onCopyFieldsChange: (fields: Record<CopyField, boolean>) => void;
  onToggleBicycle: (product: OptimizerProduct, nextValue: boolean) => void;
  onRunImages: () => void;
  onImageUpdate: (patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) => void;
  onApproveImages: () => void;
  onLightbox: (url: string) => void;
}) {
  const showCopy = needsCopyStep(goal);
  const showPhotos = goal === "photos" || goal === "both";

  if (loading || !product) {
    return <CenteredState label="Loading product" />;
  }

  const copyStatus = copyRunStatus(copyRun);
  const bicycleChecked = isProductBicycle(product, bicycleOverrides);
  const bicycleBusy = bicycleSaving.has(product.id);
  const bicycleDetecting = bicycleDetectingIds.has(product.id);
  const aiHint = aiBicycleHints[product.id];
  const bikeSpecsText = bicycleChecked ? bikeSpecsPreview(product.bike_specs) : null;

  const fieldOptions: Array<{
    key: CopyField;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: "title", label: "Title", icon: Type },
    { key: "description", label: "Description", icon: FileText },
    { key: "specs", label: "Specs", icon: ListChecks },
    { key: "subDescription", label: "Sub description", icon: Layers },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border px-5 py-5">
        <h2 className="text-lg font-semibold text-foreground">Review & optimise</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate copy and select photos for this product on one page, then move to the next.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-muted/25 p-5 lg:border-b-0 lg:border-r">
          <ProductSummary product={product} onLightbox={onLightbox} />

          {preloadingImages && preloadProgress.total > 0 && (
            <div className="mt-4 rounded-md border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Preloading photos {preloadProgress.done}/{preloadProgress.total}
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0 space-y-5 p-5">
          {showCopy ? (
            <section className="rounded-md border border-border bg-background p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Copy</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose fields to generate, then review the results below.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {fieldOptions.map(({ key, label, icon: Icon }) => (
                    <label
                      key={key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground",
                        copyRunning && "pointer-events-none opacity-60",
                      )}
                    >
                      <Checkbox
                        checked={copyFields[key]}
                        disabled={copyRunning}
                        onCheckedChange={(checked) =>
                          onCopyFieldsChange({
                            ...copyFields,
                            [key]: checked === true,
                          })
                        }
                        aria-label={label}
                      />
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3 border-b border-border pb-3">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Checkbox
                    checked={bicycleChecked}
                    disabled={copyRunning || bicycleBusy || bicycleDetecting}
                    onCheckedChange={(checked) => onToggleBicycle(product, checked === true)}
                    aria-label={bicycleChecked ? "Mark as not a bicycle" : "Mark as bicycle"}
                  />
                  Bicycle
                </label>
                {bicycleDetecting ? (
                  <span className="text-xs text-muted-foreground">AI detecting…</span>
                ) : aiHint ? (
                  <span className="text-xs text-muted-foreground">AI confidence: {aiHint}</span>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  {copyStatus === "running" && (
                    <StatusBadge label="Generating…" tone="neutral" />
                  )}
                  {copyStatus === "done" && <StatusBadge label="Updated" tone="success" />}
                  {copyStatus === "error" && <StatusBadge label="Failed" tone="danger" />}
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Title</p>
                  <CopyBatchCell
                    text={product.display_name || product.description}
                    running={copyRun?.title === "running" || copyRun?.title === "queued"}
                    error={copyRun?.title === "error"}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sub description</p>
                  <CopyBatchCell
                    text={product.sub_description}
                    running={
                      copyRun?.subDescription === "running" ||
                      copyRun?.subDescription === "queued"
                    }
                    error={copyRun?.subDescription === "error"}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Description</p>
                  <CopyBatchCell
                    text={product.product_description}
                    running={copyRun?.description === "running" || copyRun?.description === "queued"}
                    error={copyRun?.description === "error"}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Specs</p>
                  <CopyBatchCell
                    text={product.product_specs}
                    running={copyRun?.specs === "running" || copyRun?.specs === "queued"}
                    error={copyRun?.specs === "error"}
                  />
                </div>
              </div>

              {bicycleChecked && bikeSpecsText ? (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Bike specs</p>
                  <CopyBatchCell text={bikeSpecsText} />
                </div>
              ) : null}
            </section>
          ) : null}

          {showPhotos ? (
            <section className="rounded-md border border-border bg-background p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Photos</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Find images, pick a primary photo, and approve when ready.
                </p>
              </div>
              <PhotoPanel
                product={product}
                imageRun={imageRun}
                running={imageRunning}
                onRunImages={onRunImages}
                onImageUpdate={onImageUpdate}
                onApproveImages={onApproveImages}
                onLightbox={onLightbox}
              />
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function CopyBatchStep({
  products,
  totalCount,
  copyRuns,
  copyFields,
  selectedIds,
  search,
  running,
  onSearchChange,
  onCopyFieldsChange,
  onToggleSelect,
  onToggleSelectAll,
  bicycleOverrides,
  bicycleSaving,
  aiBicycleHints,
  bicycleDetectingIds,
  onToggleBicycle,
}: {
  products: OptimizerProduct[];
  totalCount: number;
  copyRuns: Record<string, CopyRun>;
  copyFields: Record<CopyField, boolean>;
  selectedIds: Set<string>;
  search: string;
  running: boolean;
  onSearchChange: (value: string) => void;
  onCopyFieldsChange: (fields: Record<CopyField, boolean>) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  bicycleOverrides: Record<string, boolean>;
  bicycleSaving: Set<string>;
  aiBicycleHints: Record<string, "high" | "medium" | "low">;
  bicycleDetectingIds: Set<string>;
  onToggleBicycle: (product: OptimizerProduct, nextValue: boolean) => void;
}) {
  const fieldOptions: Array<{
    key: CopyField;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: "title", label: "Title", icon: Type },
    { key: "description", label: "Description", icon: FileText },
    { key: "specs", label: "Specs", icon: ListChecks },
    { key: "subDescription", label: "Sub description", icon: Layers },
  ];

  const allVisibleSelected =
    products.length > 0 && products.every((product) => selectedIds.has(product.id));

  const showBikeSpecsColumn = products.some(
    (product) =>
      isProductBicycle(product, bicycleOverrides) ||
      !!product.bike_specs ||
      !!aiBicycleHints[product.id] ||
      bicycleDetectingIds.has(product.id),
  );

  const rowGridClass = showBikeSpecsColumn
    ? "grid-cols-[40px_minmax(140px,1fr)_56px_64px_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_88px]"
    : "grid-cols-[40px_minmax(140px,1fr)_56px_64px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_88px]";

  return (
    <div className="flex h-full min-h-0 flex-col px-5 py-5">
      <div className="mb-4 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Review & generate copy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select products, choose fields to generate, then run AI on the batch. You can continue
            to photos while copy finishes in the background.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Generate:</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {fieldOptions.map(({ key, label, icon: Icon }) => (
                <label
                  key={key}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground",
                    running && "pointer-events-none opacity-60",
                  )}
                >
                  <Checkbox
                    checked={copyFields[key]}
                    disabled={running}
                    onCheckedChange={(checked) =>
                      onCopyFieldsChange({
                        ...copyFields,
                        [key]: checked === true,
                      })
                    }
                    aria-label={label}
                  />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search products"
              className="pl-9"
              disabled={running}
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-background">
        <div
          className={cn(
            "sticky top-0 z-10 grid gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground",
            rowGridClass,
          )}
        >
          <div className="flex items-center">
            <Checkbox
              checked={allVisibleSelected}
              disabled={running || products.length === 0}
              onCheckedChange={onToggleSelectAll}
              aria-label="Select all products"
            />
          </div>
          <span>Product</span>
          <span className="text-center">Bike</span>
          <span className="text-center">SOH</span>
          <span>Title</span>
          <span>Sub description</span>
          <span>Description</span>
          <span>Specs</span>
          {showBikeSpecsColumn ? <span>Bike specs</span> : null}
          <span className="text-right">Status</span>
        </div>

        <div className="max-h-[min(520px,calc(100vh-22rem))] overflow-y-auto divide-y divide-border">
          {products.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No products match your search.
            </div>
          ) : (
            products.map((product) => {
              const run = copyRuns[product.id];
              const status = copyRunStatus(run);
              const name = productLabel(product);
              const bicycleChecked = isProductBicycle(product, bicycleOverrides);
              const bicycleBusy = bicycleSaving.has(product.id);
              const bicycleDetecting = bicycleDetectingIds.has(product.id);
              const aiHint = aiBicycleHints[product.id];
              const bikeSpecsText = bicycleChecked ? bikeSpecsPreview(product.bike_specs) : null;

              return (
                <div
                  key={product.id}
                  className={cn("grid gap-3 px-4 py-3 text-sm", rowGridClass)}
                >
                  <div className="flex items-start pt-0.5">
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      disabled={running}
                      onCheckedChange={() => onToggleSelect(product.id)}
                      aria-label={`Select ${name}`}
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="font-medium text-foreground line-clamp-2">{name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {product.brand || "No brand"}
                    </p>
                  </div>

                  <div className="flex flex-col items-center justify-start gap-1 pt-0.5">
                    <Checkbox
                      checked={bicycleChecked}
                      disabled={running || bicycleBusy || bicycleDetecting}
                      onCheckedChange={(checked) =>
                        onToggleBicycle(product, checked === true)
                      }
                      aria-label={bicycleChecked ? "Mark as not a bicycle" : "Mark as bicycle"}
                    />
                    {bicycleDetecting ? (
                      <span className="text-[10px] text-muted-foreground">Detecting…</span>
                    ) : aiHint ? (
                      <span className="text-[10px] text-muted-foreground">AI {aiHint}</span>
                    ) : null}
                  </div>

                  <CopyBatchSoh qoh={product.qoh} />

                  <CopyBatchCell
                    text={product.display_name || product.description}
                    running={run?.title === "running" || run?.title === "queued"}
                    error={run?.title === "error"}
                  />
                  <CopyBatchCell
                    text={product.sub_description}
                    running={
                      run?.subDescription === "running" || run?.subDescription === "queued"
                    }
                    error={run?.subDescription === "error"}
                  />
                  <CopyBatchCell
                    text={product.product_description}
                    running={run?.description === "running" || run?.description === "queued"}
                    error={run?.description === "error"}
                  />
                  <CopyBatchCell
                    text={product.product_specs}
                    running={run?.specs === "running" || run?.specs === "queued"}
                    error={run?.specs === "error"}
                  />

                  {showBikeSpecsColumn ? (
                    bicycleDetecting ? (
                      <p className="pt-0.5 text-xs text-muted-foreground">Detecting…</p>
                    ) : bicycleChecked ? (
                      <CopyBatchCell text={bikeSpecsText} />
                    ) : (
                      <p className="pt-0.5 text-xs text-muted-foreground">—</p>
                    )
                  ) : null}

                  <div className="flex items-start justify-end">
                    {status === "running" && (
                      <StatusBadge label="Generating…" tone="neutral" />
                    )}
                    {status === "done" && <StatusBadge label="Updated" tone="success" />}
                    {status === "error" && <StatusBadge label="Failed" tone="danger" />}
                    {status === "idle" && (
                      <span className="text-xs text-muted-foreground">Ready</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {selectedIds.size} of {totalCount} selected
        {search.trim() ? ` · ${products.length} shown` : ""}
      </p>
    </div>
  );
}

function CopyBatchSoh({ qoh }: { qoh: number }) {
  const value = Math.max(0, Number(qoh) || 0);

  return (
    <div className="flex items-start justify-center pt-0.5">
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          value <= 0 ? "text-amber-600" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CopyBatchCell({
  text,
  running,
  error,
}: {
  text: string | null | undefined;
  running?: boolean;
  error?: boolean;
}) {
  if (running) {
    return (
      <div className="flex items-start pt-0.5">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start pt-0.5">
        <AlertCircle className="size-4 text-destructive" />
      </div>
    );
  }

  if (!text?.trim()) {
    return <p className="text-xs text-muted-foreground italic">Not set</p>;
  }

  return (
    <p className="text-xs leading-relaxed text-foreground line-clamp-4 whitespace-pre-wrap">
      {text}
    </p>
  );
}

function PhotosBatchStep({
  products,
  pageIndex,
  pageCount,
  totalCount,
  imageRuns,
  loading,
  preloadingImages,
  preloadProgress,
  onRunImages,
  onImageUpdate,
  onApproveImages,
  onLightbox,
}: {
  products: OptimizerProduct[];
  pageIndex: number;
  pageCount: number;
  totalCount: number;
  imageRuns: Record<string, ImageRun>;
  loading: boolean;
  preloadingImages: boolean;
  preloadProgress: { done: number; total: number };
  onRunImages: (product: OptimizerProduct) => void;
  onImageUpdate: (
    productId: string,
  ) => (patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) => void;
  onApproveImages: (product: OptimizerProduct) => void;
  onLightbox: (url: string) => void;
}) {
  const pageStart = pageIndex * PHOTOS_PAGE_SIZE + 1;
  const pageEnd = Math.min((pageIndex + 1) * PHOTOS_PAGE_SIZE, totalCount);

  if (loading && products.length === 0) {
    return <CenteredState label="Loading products" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-5 py-5">
      <div className="mb-4 shrink-0 space-y-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Review & approve photos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Page {pageIndex + 1} of {pageCount} · products {pageStart}–{pageEnd} of{" "}
            {totalCount}. Images are preloaded for this page so you can approve in bulk.
          </p>
        </div>

        {preloadingImages && preloadProgress.total > 0 && (
          <div className="rounded-md border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Loading images for this page ({preloadProgress.done}/{preloadProgress.total})
            </div>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className="rounded-md border border-border bg-white px-4 py-12 text-center text-sm text-muted-foreground">
          No products on this page.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-4 xl:grid-cols-2">
            {products.map((product) => {
              const imageRun = imageRuns[product.id] ?? emptyImageRun();
              const imageRunning = IMG_BUSY.includes(imageRun.phase);

              return (
                <div
                  key={product.id}
                  className="rounded-md border border-border bg-background p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {productLabel(product)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {product.brand || "No brand"}
                        {typeof product.qoh === "number" ? ` · SOH ${product.qoh}` : ""}
                      </p>
                    </div>
                    {imageRun.phase === "done" ? (
                      <StatusBadge label="Approved" tone="success" />
                    ) : imageRun.phase === "ready" ? (
                      <StatusBadge label="Ready" tone="info" />
                    ) : imageRunning ? (
                      <StatusBadge label="Loading…" tone="neutral" />
                    ) : null}
                  </div>

                  <PhotoPanel
                    product={product}
                    imageRun={imageRun}
                    running={imageRunning}
                    onRunImages={() => onRunImages(product)}
                    onImageUpdate={onImageUpdate(product.id)}
                    onApproveImages={() => onApproveImages(product)}
                    onLightbox={onLightbox}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductSummary({
  product,
  onLightbox,
}: {
  product: OptimizerProduct;
  onLightbox: (url: string) => void;
}) {
  const image = product.resolved_image_url || product.primary_image_url;
  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={!image}
        onClick={() => image && onLightbox(image)}
        className="relative aspect-square w-full overflow-hidden rounded-md bg-background ring-1 ring-border"
      >
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            unoptimized
            sizes="330px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="size-12 text-muted-foreground/35" />
          </div>
        )}
      </button>

      <div>
        <p className="text-base font-semibold leading-snug text-foreground">
          {productLabel(product)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {product.brand || "No brand"} - {formatMoney(product.price)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <StatusBadge
          label={hasTitle(product) ? "Title ready" : "Needs title"}
          tone={hasTitle(product) ? "success" : "warning"}
        />
        <StatusBadge
          label={hasDesc(product) ? "Copy ready" : "Needs copy"}
          tone={hasDesc(product) ? "success" : "warning"}
        />
        <StatusBadge
          label={hasSerperImage(product) ? "Photos ready" : "Needs photos"}
          tone={hasSerperImage(product) ? "success" : "warning"}
        />
        <StatusBadge
          label={`${Math.max(0, Number(product.qoh) || 0)} in stock`}
          tone={Number(product.qoh) > 0 ? "info" : "warning"}
        />
      </div>
    </div>
  );
}

function PhotoPanel({
  product,
  imageRun,
  running,
  onRunImages,
  onImageUpdate,
  onApproveImages,
  onLightbox,
}: {
  product: OptimizerProduct;
  imageRun: ImageRun;
  running: boolean;
  onRunImages: () => void;
  onImageUpdate: (patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) => void;
  onApproveImages: () => void;
  onLightbox: (url: string) => void;
}) {
  const canShowReview =
    imageRun.phase !== "idle" ||
    imageRun.selectedUrls.length > 0 ||
    hasSerperImage(product);

  const enhanceImage = async (url: string) => {
    if (!product.canonical_product_id) return;
    onImageUpdate((prev) => ({
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
        throw new Error(json.error || "Enhancement failed");
      }

      const enhancedUrl = json.url as string;
      onImageUpdate((prev) => ({
        selectedUrls: prev.selectedUrls.map((item) =>
          item === url ? enhancedUrl : item,
        ),
        selectedCandidates: prev.selectedCandidates.map((candidate) =>
          candidate.url === url
            ? {
                ...candidate,
                url: enhancedUrl,
                thumbnailUrl: json.thumbnailUrl ?? enhancedUrl,
              }
            : candidate,
        ),
        primaryUrl: prev.primaryUrl === url ? enhancedUrl : prev.primaryUrl,
        enhancedUrls: { ...(prev.enhancedUrls ?? {}), [url]: enhancedUrl },
        enhancingUrls: (prev.enhancingUrls ?? []).filter((item) => item !== url),
      }));
    } catch {
      onImageUpdate((prev) => ({
        enhancingUrls: (prev.enhancingUrls ?? []).filter((item) => item !== url),
      }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {!canShowReview && (
          <Button type="button" size="sm" disabled={running} onClick={onRunImages}>
            <ImageIcon className="size-4" />
            Find photos
          </Button>
        )}
      </div>

      {hasSerperImage(product) && imageRun.phase === "idle" ? (
        <ExistingPhotos product={product} onLightbox={onLightbox} />
      ) : (
        <OptimizerImageReview
          img={imageRun}
          hasCanonical={!!product.canonical_product_id}
          saving={imageRun.phase === "saving"}
          hideApproveAction={false}
          size="large"
          onSetPrimary={(url) => onImageUpdate((prev) => ({ ...prev, primaryUrl: url }))}
          onRemove={(url) =>
            onImageUpdate((prev) => {
              if (prev.selectedUrls.length <= 1) return {};
              const selectedUrls = prev.selectedUrls.filter((item) => item !== url);
              const selectedCandidates = prev.selectedCandidates.filter(
                (candidate) => candidate.url !== url,
              );
              return {
                selectedUrls,
                selectedCandidates,
                primaryUrl: prev.primaryUrl === url ? selectedUrls[0] ?? null : prev.primaryUrl,
              };
            })
          }
          onAdd={(candidate) =>
            onImageUpdate((prev) => {
              if (prev.selectedUrls.includes(candidate.url) || prev.selectedUrls.length >= 6) {
                return {};
              }
              return {
                selectedUrls: [...prev.selectedUrls, candidate.url],
                selectedCandidates: [...prev.selectedCandidates, candidate],
                primaryUrl: prev.primaryUrl ?? candidate.url,
              };
            })
          }
          onEnhance={(url) => void enhanceImage(url)}
          onToggleAdditional={() =>
            onImageUpdate((prev) => ({ showAdditional: !prev.showAdditional }))
          }
          onApprove={onApproveImages}
          onLightbox={onLightbox}
        />
      )}
    </div>
  );
}

function ExistingPhotos({
  product,
  onLightbox,
}: {
  product: OptimizerProduct;
  onLightbox: (url: string) => void;
}) {
  const images = product.canonical_images
    .map((image) => ({
      id: image.id,
      url: image.cloudinary_url || image.external_url,
      primary: image.is_primary,
    }))
    .filter((image): image is { id: string; url: string; primary: boolean | null } =>
      Boolean(image.url),
    );

  if (images.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        Photos are already marked ready.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {images.map((image) => (
        <button
          key={image.id}
          type="button"
          onClick={() => onLightbox(image.url)}
          className={cn(
            "relative aspect-square overflow-hidden rounded-md border bg-muted",
            image.primary && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          )}
        >
          <Image src={image.url} alt="" fill unoptimized className="object-cover" />
          {image.primary && (
            <span className="absolute left-2 top-2 rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">
              Primary
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function DoneStep({
  category,
  goal,
  completed,
  skipped,
  failed,
  onChooseAnother,
}: {
  category: CategoryOption | null;
  goal: OptimiseGoal | null;
  completed: number;
  skipped: number;
  failed: number;
  onChooseAnother: () => void;
}) {
  return (
    <div className="flex w-full flex-col px-5 py-6">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="size-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-foreground">Finished</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {category?.name ?? "Catalogue"} · {goalLabel(goal)}
      </p>
      <div className="mt-6 grid w-full max-w-md grid-cols-3 gap-2">
        <SummaryStat label="Optimised" value={completed} />
        <SummaryStat label="Skipped" value={skipped} />
        <SummaryStat label="Failed" value={failed} />
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-6 w-fit" onClick={onChooseAnother}>
        Choose another category
      </Button>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-4">
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CenteredState({ label }: { label: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      {label}
    </div>
  );
}

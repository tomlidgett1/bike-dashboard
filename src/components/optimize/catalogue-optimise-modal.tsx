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
  Search,
  Sparkles,
  StopCircle,
  Type,
  X,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  emptyImageRun,
  hasDesc,
  hasSerperImage,
  hasSpecs,
  hasTitle,
  IMG_BUSY,
  IMAGE_CONCURRENCY,
  LightboxOverlay,
  productLabel,
  readSSE,
  toSpeedProduct,
  type CategoryOption,
  type CopyField,
  type ImageRun,
  type OptimizerProduct,
  type TextStatus,
  fetchOptimizerProductsBySearch,
  useOptimizerCategories,
  useOptimizerProducts,
} from "@/components/optimize/optimizer-shared";

type WizardStep = "category" | "goal" | "batch" | "copy_batch" | "photos" | "done";
type OptimiseGoal = "copy" | "photos" | "both";
type BatchSize = "individual" | 10 | 20 | 30 | "all";

type CopyRun = Record<CopyField, TextStatus> & {
  error?: string;
};

const emptyCopyRun = (): CopyRun => ({
  title: "idle",
  description: "idle",
  specs: "idle",
});

const DEFAULT_COPY_FIELDS: Record<CopyField, boolean> = {
  title: true,
  description: true,
  specs: false,
};

function sliceQueueIds(ids: string[], batchSize: BatchSize): string[] {
  if (batchSize === "all") return ids;
  if (batchSize === "individual") return ids.slice(0, 1);
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

function copyRunStatus(run: CopyRun | undefined): "idle" | "running" | "done" | "error" {
  if (!run) return "idle";
  const steps = [run.title, run.description, run.specs];
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
  const [selectedCopyIds, setSelectedCopyIds] = React.useState<Set<string>>(new Set());
  const [copySearch, setCopySearch] = React.useState("");
  const [copyFields, setCopyFields] = React.useState<Record<CopyField, boolean>>(DEFAULT_COPY_FIELDS);
  const [preloadingImages, setPreloadingImages] = React.useState(false);
  const [preloadProgress, setPreloadProgress] = React.useState({ done: 0, total: 0 });
  const [completedIds, setCompletedIds] = React.useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = React.useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = React.useState<Set<string>>(new Set());
  const [copyRuns, setCopyRuns] = React.useState<Record<string, CopyRun>>({});
  const [imageRuns, setImageRuns] = React.useState<Record<string, ImageRun>>({});
  const [copyRunning, setCopyRunning] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<string | null>(null);

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

  const copyAbortRef = React.useRef<AbortController | null>(null);
  const imageAbortRef = React.useRef<AbortController | null>(null);
  const imageCancelledRef = React.useRef(false);
  const preloadQueueImagesRef = React.useRef<
    ((ids: string[], selectedGoal: OptimiseGoal) => Promise<void>) | null
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
    setSelectedCopyIds(new Set());
    setCopySearch("");
    setCopyFields(DEFAULT_COPY_FIELDS);
    setPreloadingImages(false);
    setPreloadProgress({ done: 0, total: 0 });
    setCompletedIds(new Set());
    setSkippedIds(new Set());
    setFailedIds(new Set());
    setCopyRuns({});
    setImageRuns({});
    setCopyRunning(false);
    setLightbox(null);
    copyAbortRef.current?.abort();
    imageAbortRef.current?.abort();
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

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

  const currentProduct = React.useMemo(() => {
    const id = photoQueueIds[currentIndex];
    if (!id) return null;
    return catalogueProducts.find((product) => product.id === id) ?? null;
  }, [currentIndex, photoQueueIds, catalogueProducts]);

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

      if (nextGoal === "photos") {
        const nextPhotoIds = pinnedProduct
          ? ids
          : photoIdsFromQueue(ids, catalogueProducts);
        setPhotoQueueIds(nextPhotoIds);
        setStep(nextPhotoIds.length > 0 ? "photos" : "done");
        if (nextPhotoIds.length > 0) {
          void preloadQueueImagesRef.current?.(nextPhotoIds, "photos");
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
      beginBatch(nextGoal, ids, "individual");
      return;
    }

    setStep("batch");
  };

  const handleBatchConfirm = (size: BatchSize) => {
    if (!goal) return;
    const ids = sliceQueueIds(pendingQueueIds, size);
    beginBatch(goal, ids, size);
  };

  const startPhotosFlow = React.useCallback(() => {
    const nextPhotoIds = pinnedProduct
      ? queueIds
      : photoIdsFromQueue(queueIds, catalogueProducts);
    setPhotoQueueIds(nextPhotoIds);
    setCurrentIndex(0);
    if (nextPhotoIds.length === 0) {
      setStep("done");
      return;
    }
    setStep("photos");
    void preloadQueueImagesRef.current?.(nextPhotoIds, goal ?? "photos");
  }, [goal, catalogueProducts, pinnedProduct, queueIds]);

  const advance = React.useCallback(
    (id: string, kind: "completed" | "skipped" = "completed") => {
      if (kind === "completed") {
        setCompletedIds((prev) => new Set([...prev, id]));
      } else {
        setSkippedIds((prev) => new Set([...prev, id]));
      }

      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= photoQueueIds.length) {
          setStep("done");
          return prev;
        }
        return next;
      });
    },
    [photoQueueIds.length],
  );

  const runTitlesBatch = React.useCallback(
    async (ids: string[]) => {
      ids.forEach((id) => patchCopyRun(id, { title: "running", error: undefined }));
      const response = await fetch("/api/products/generate-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: ids }),
        signal: copyAbortRef.current?.signal,
      });

      if (!response.ok || !response.body) throw new Error("Title generation failed");

      await readSSE(response.body, (event) => {
        const id = event.productId as string;
        if (!id || event.event !== "product_complete") return;
        if (event.success && event.title) {
          patchProduct(id, { display_name: event.title as string });
          patchCopyRun(id, { title: "done" });
        } else {
          patchCopyRun(id, {
            title: "error",
            error: (event.error as string) || "Title generation failed",
          });
          setFailedIds((prev) => new Set([...prev, id]));
        }
      });
    },
    [patchCopyRun, patchProduct],
  );

  const runDescriptionsBatch = React.useCallback(
    async (ids: string[], mode: "description" | "specs" | "both") => {
      const doDesc = mode === "both" || mode === "description";
      const doSpecs = mode === "both" || mode === "specs";
      ids.forEach((id) => {
        if (doDesc) patchCopyRun(id, { description: "running", error: undefined });
        if (doSpecs) patchCopyRun(id, { specs: "running", error: undefined });
      });

      const response = await fetch("/api/products/generate-product-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: ids, mode }),
        signal: copyAbortRef.current?.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Description generation failed");
      }

      await readSSE(response.body, (event) => {
        const id = event.productId as string;
        if (!id || event.event !== "product_complete") return;
        if (event.success) {
          patchProduct(id, {
            ...(doDesc && event.description
              ? { product_description: event.description as string }
              : {}),
            ...(doSpecs && event.specs ? { product_specs: event.specs as string } : {}),
            ...(typeof event.is_bicycle === "boolean"
              ? { is_bicycle: event.is_bicycle as boolean }
              : {}),
            ...(event.bike_specs ? { bike_specs: event.bike_specs } : {}),
          });
          if (doDesc) patchCopyRun(id, { description: "done" });
          if (doSpecs) patchCopyRun(id, { specs: "done" });
        } else {
          const message = (event.error as string) || "Generation failed";
          if (doDesc) patchCopyRun(id, { description: "error", error: message });
          if (doSpecs) patchCopyRun(id, { specs: "error", error: message });
          setFailedIds((prev) => new Set([...prev, id]));
        }
      });
    },
    [patchCopyRun, patchProduct],
  );

  const runBulkCopy = React.useCallback(
    async (ids: string[]) => {
      const fields = (Object.keys(copyFields) as CopyField[]).filter(
        (field) => copyFields[field],
      );
      if (ids.length === 0 || fields.length === 0) return;

      setCopyRunning(true);
      copyAbortRef.current = new AbortController();

      ids.forEach((id) => {
        patchCopyRun(id, {
          ...(copyFields.title ? { title: "queued" as const } : {}),
          ...(copyFields.description ? { description: "queued" as const } : {}),
          ...(copyFields.specs ? { specs: "queued" as const } : {}),
          error: undefined,
        });
      });

      try {
        const jobs: Promise<void>[] = [];
        if (copyFields.title) jobs.push(runTitlesBatch(ids));
        if (copyFields.description && copyFields.specs) {
          jobs.push(runDescriptionsBatch(ids, "both"));
        } else if (copyFields.description) {
          jobs.push(runDescriptionsBatch(ids, "description"));
        } else if (copyFields.specs) {
          jobs.push(runDescriptionsBatch(ids, "specs"));
        }
        await Promise.all(jobs);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          ids.forEach((id) =>
            patchCopyRun(id, {
              error: error instanceof Error ? error.message : "Copy generation failed",
            }),
          );
        }
      } finally {
        setCopyRunning(false);
        copyAbortRef.current = null;
      }
    },
    [
      copyFields,
      patchCopyRun,
      runDescriptionsBatch,
      runTitlesBatch,
    ],
  );

  const runImageSearch = React.useCallback(
    async (product: OptimizerProduct, options?: { background?: boolean }) => {
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
      patchImageRun(product.id, { ...emptyImageRun(), phase: "searching" });

      try {
        const speedProduct = toSpeedProduct(product);
        const searchQuery = buildSpeedSearchQuery(speedProduct);
        const candidates = await fetchSerperCandidates(speedProduct, searchQuery);
        if (!background && imageCancelledRef.current) return false;
        if (candidates.length === 0) {
          patchImageRun(product.id, {
            phase: "no_results",
            error: "No images found",
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

  preloadQueueImagesRef.current = async (ids: string[], selectedGoal: OptimiseGoal) => {
    if (!shouldPreloadImages(selectedGoal)) return;

    const targets = ids
      .map((id) => catalogueProducts.find((product) => product.id === id))
      .filter((product): product is OptimizerProduct => !!product && needsPhotos(product));

    if (targets.length === 0) return;

    setPreloadingImages(true);
    setPreloadProgress({ done: 0, total: targets.length });

    let completed = 0;
    for (let index = 0; index < targets.length; index += IMAGE_CONCURRENCY) {
      const chunk = targets.slice(index, index + IMAGE_CONCURRENCY);
      await Promise.all(
        chunk.map(async (product) => {
          await runImageSearch(product, { background: true });
          completed += 1;
          setPreloadProgress({ done: completed, total: targets.length });
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

  const approveAndAdvance = React.useCallback(
    (product: OptimizerProduct) => {
      const run = imageRuns[product.id] ?? emptyImageRun();
      if (product.canonical_product_id && run.phase === "ready" && run.primaryUrl) {
        void approveImages(product, { ...run });
      }
      advance(product.id);
    },
    [advance, approveImages, imageRuns],
  );

  const updateImageRun = React.useCallback(
    (productId: string) =>
      (patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) =>
        patchImageRun(productId, patch),
    [patchImageRun],
  );

  const stopCurrent = () => {
    copyAbortRef.current?.abort();
    imageCancelledRef.current = true;
    imageAbortRef.current?.abort();
    setCopyRunning(false);
  };

  const activeCopyFields = React.useMemo(
    () => (Object.keys(copyFields) as CopyField[]).filter((field) => copyFields[field]),
    [copyFields],
  );

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

  const handlePrimary = () => {
    if (!currentProduct || step !== "photos") return;

    const run = imageRuns[currentProduct.id] ?? emptyImageRun();
    if (!needsPhotos(currentProduct) || run.phase === "done") {
      advance(currentProduct.id);
      return;
    }
    if (run.phase === "ready") {
      approveAndAdvance(currentProduct);
      return;
    }
    if (run.phase === "idle" || run.phase === "error" || run.phase === "no_results") {
      void runImageSearch(currentProduct, { background: true });
      return;
    }
    if (IMG_BUSY.includes(run.phase)) {
      advance(currentProduct.id, "skipped");
    }
  };

  const currentImageRun = currentProduct
    ? imageRuns[currentProduct.id] ?? emptyImageRun()
    : emptyImageRun();

  const primaryLabel = (() => {
    if (copyRunning) return "Stop";
    if (!currentProduct || step !== "photos") return "Continue";

    const run = currentImageRun;
    if (!needsPhotos(currentProduct) || run.phase === "done") return "Next";
    if (run.phase === "ready") return "Approve & next";
    if (IMG_BUSY.includes(run.phase)) return "Next";
    return "Find photos";
  })();

  const primaryDisabled = step === "photos" && !currentProduct;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "grid h-[min(820px,calc(100vh-1.5rem))] max-w-[calc(100vw-1.5rem)] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-lg p-0",
          step === "copy_batch" || step === "photos" ? "sm:max-w-6xl" : "sm:max-w-5xl",
        )}
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

        <div className="min-h-0 overflow-y-auto">
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
              onSelect={setBatchSize}
            />
          )}

          {step === "copy_batch" && goal && (
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
            />
          )}

          {step === "photos" && goal && (
            <PhotosStep
              product={currentProduct}
              imageRun={currentProduct ? imageRuns[currentProduct.id] ?? emptyImageRun() : emptyImageRun()}
              loading={loading}
              index={currentIndex}
              total={photoQueueIds.length}
              imageRunning={IMG_BUSY.includes(currentImageRun.phase)}
              preloadingImages={preloadingImages}
              preloadProgress={preloadProgress}
              onRunImages={() =>
                currentProduct && void runImageSearch(currentProduct, { background: true })
              }
              onImageUpdate={
                currentProduct ? updateImageRun(currentProduct.id) : () => undefined
              }
              onApproveImages={() => currentProduct && approveAndAdvance(currentProduct)}
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
                disabled={copyRunning}
                onClick={() => {
                  if (step === "photos") {
                    setStep(
                      needsCopyStep(goal) ? "copy_batch" : pinnedProduct ? "goal" : "batch",
                    );
                  } else if (step === "copy_batch") {
                    setStep(pinnedProduct ? "goal" : "batch");
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
            {step === "photos" && currentProduct && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={copyRunning}
                onClick={() => advance(currentProduct.id, "skipped")}
              >
                Skip
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === "done" ? (
              <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            ) : step === "batch" ? (
              <Button
                type="button"
                size="sm"
                disabled={!batchSize || pendingQueueIds.length === 0}
                onClick={() => batchSize && handleBatchConfirm(batchSize)}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
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
                  <Button
                    type="button"
                    size="sm"
                    disabled={copyRunning}
                    onClick={startPhotosFlow}
                  >
                    Continue to photos
                    <ChevronRight className="size-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={copyRunning}
                    onClick={() => setStep("done")}
                  >
                    Finish
                  </Button>
                )}
              </>
            ) : step === "photos" ? (
              <Button
                type="button"
                size="sm"
                disabled={primaryDisabled}
                onClick={() => handlePrimary()}
              >
                {currentImageRun.phase === "ready" ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                {primaryLabel}
              </Button>
            ) : null}
          </div>
        </div>

        <LightboxOverlay url={lightbox} onClose={() => setLightbox(null)} />
      </DialogContent>
    </Dialog>
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
}) {
  const showProductResults = productSearch.trim().length > 0;

  return (
    <div className="flex w-full flex-col gap-4 px-5 py-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">What do you want to optimise?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search for a product, or choose a category to work through in batches.
        </p>
      </div>

      <div className="rounded-md border border-border bg-white p-4">
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
          <div className="mt-3">
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
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground">or browse by category</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search categories"
              className="pl-9"
            />
          </div>

          {loading ? (
            <CenteredState label="Loading categories" />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
              {categories.map((category) => {
                const photoNeed = category.missingSerperImages || category.missingImages;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => onSelect(category.id)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-muted/60"
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
                        {photoNeed > 0 ? ` - ${photoNeed.toLocaleString()} need photos` : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </>
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
      description: "Work through one product at a time.",
      count: Math.min(1, totalAvailable),
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
                {option.count.toLocaleString()} in this batch
              </span>
            </button>
          );
        })}
      </div>

      {goal === "photos" && selected && (
        <div className="rounded-md border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          When you continue, Serper images for this batch will preload in the background so
          each product opens with photos ready to review.
        </div>
      )}
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
}) {
  const fieldOptions: Array<{
    key: CopyField;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: "title", label: "Title", icon: Type },
    { key: "description", label: "Description", icon: FileText },
    { key: "specs", label: "Specs", icon: ListChecks },
  ];

  const toggleField = (key: CopyField) => {
    onCopyFieldsChange({ ...copyFields, [key]: !copyFields[key] });
  };

  const allVisibleSelected =
    products.length > 0 && products.every((product) => selectedIds.has(product.id));

  return (
    <div className="flex h-full min-h-0 flex-col px-5 py-5">
      <div className="mb-4 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Review & generate copy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select products, choose fields to generate, then run AI on the batch. Preview every
            title, description, and spec before continuing to photos.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Generate:</span>
            <div className="flex flex-wrap items-center bg-gray-100 p-0.5 rounded-md w-fit">
              {fieldOptions.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  disabled={running}
                  onClick={() => toggleField(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    copyFields[key]
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                    running && "pointer-events-none opacity-60",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
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
        <div className="sticky top-0 z-10 grid grid-cols-[40px_minmax(140px,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_88px] gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <div className="flex items-center">
            <Checkbox
              checked={allVisibleSelected}
              disabled={running || products.length === 0}
              onCheckedChange={onToggleSelectAll}
              aria-label="Select all products"
            />
          </div>
          <span>Product</span>
          <span>Title</span>
          <span>Description</span>
          <span>Specs</span>
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

              return (
                <div
                  key={product.id}
                  className="grid grid-cols-[40px_minmax(140px,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_88px] gap-3 px-4 py-3 text-sm"
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

                  <CopyBatchCell
                    text={product.display_name || product.description}
                    running={run?.title === "running" || run?.title === "queued"}
                    error={run?.title === "error"}
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

function PhotosStep({
  product,
  imageRun,
  loading,
  index,
  total,
  imageRunning,
  preloadingImages,
  preloadProgress,
  onRunImages,
  onImageUpdate,
  onApproveImages,
  onLightbox,
}: {
  product: OptimizerProduct | null;
  imageRun: ImageRun;
  loading: boolean;
  index: number;
  total: number;
  imageRunning: boolean;
  preloadingImages: boolean;
  preloadProgress: { done: number; total: number };
  onRunImages: () => void;
  onImageUpdate: (patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) => void;
  onApproveImages: () => void;
  onLightbox: (url: string) => void;
}) {
  if (loading || !product) {
    return <CenteredState label="Loading product" />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border px-5 py-5">
        <h2 className="text-lg font-semibold text-foreground">Review & approve photos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Photo {index + 1} of {total}. Pick a primary image, remove any you don&apos;t want, then
          approve.
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

        <main className="min-w-0 p-5">
          <PhotoPanel
            product={product}
            imageRun={imageRun}
            running={imageRunning}
            onRunImages={onRunImages}
            onImageUpdate={onImageUpdate}
            onApproveImages={onApproveImages}
            onLightbox={onLightbox}
          />
        </main>
      </div>
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

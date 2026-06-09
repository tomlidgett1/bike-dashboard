"use client";

import * as React from "react";
import Image from "next/image";
import {
  buildSpeedSearchQuery,
  fetchSerperCandidates,
  type SpeedSearchCandidate,
} from "@/lib/admin/image-qa-speed";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  ListChecks,
  Loader2,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OptimizerImageReview } from "@/components/optimize/optimizer-image-review";
import {
  emptyImageRun,
  imageRunWithEnhancedUrls,
  readSSE,
  type CopyField,
  type ImageRun,
  type OptimizerProduct,
  type TextStep,
  toSpeedProduct,
  IMG_BUSY,
  MAX_SELECTED_IMAGES,
} from "@/components/optimize/optimizer-shared";
import {
  fetchSerperCaches,
  lightspeedProductName,
  lightspeedSku,
  productLabel,
  type ImageApprovalProduct,
} from "@/lib/optimize/image-approval-queue";
import { imageRunFromSerperCache } from "@/lib/optimize/serper-image-cache";
import { cn } from "@/lib/utils";

type CopyRunState = Record<CopyField, TextStep>;

const emptyCopyRun = (): CopyRunState => ({
  title: { status: "idle" },
  description: { status: "idle" },
  specs: { status: "idle" },
});

function LightspeedSkuHint({ product }: { product: ImageApprovalProduct }) {
  const sku = lightspeedSku(product);
  const name = lightspeedProductName(product);
  if (!sku) return null;

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-gray-500">
      <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] font-medium text-gray-600">
        SKU {sku}
      </span>
      {name ? (
        <span className="min-w-0 truncate text-gray-600" title={name}>
          {name}
        </span>
      ) : null}
    </div>
  );
}

const COPY_FIELD_META: Array<{
  key: CopyField;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "title", label: "Title", icon: Type },
  { key: "description", label: "Description", icon: FileText },
  { key: "specs", label: "Specs", icon: ListChecks },
];

function CopyScrollField({
  label,
  icon: Icon,
  text,
  running,
  saving,
  error,
  errorDetail,
  onRegenerate,
  onSave,
  multiline = false,
  className,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string | null | undefined;
  running?: boolean;
  saving?: boolean;
  error?: boolean;
  errorDetail?: string;
  onRegenerate: () => void;
  onSave?: (value: string) => Promise<void>;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLTextAreaElement) {
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  React.useEffect(() => {
    if (!running && !saving) return;
    setEditing(false);
    setDraft("");
  }, [running, saving]);

  const startEditing = () => {
    if (running || saving || !onSave) return;
    setDraft(text?.trim() ?? "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft("");
  };

  const commitEdit = async () => {
    if (!onSave || saving) return;
    const trimmed = draft.trim();
    if (trimmed === (text?.trim() ?? "")) {
      cancelEditing();
      return;
    }
    try {
      await onSave(trimmed);
      setEditing(false);
      setDraft("");
    } catch {
      // Keep edit mode open so the user can retry.
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
      return;
    }
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      void commitEdit();
      return;
    }
    if (multiline && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void commitEdit();
    }
  };

  const inputClassName =
    "w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm leading-relaxed text-gray-800 outline-none ring-gray-300 focus:ring-2 disabled:opacity-50";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-md border border-gray-200 bg-white p-3",
        className,
      )}
    >
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="text-xs font-medium text-gray-600">{label}</span>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={running || saving || editing}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Redo with AI
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md bg-gray-50/80 p-3">
        {running ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </div>
        ) : saving ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </div>
        ) : editing ? (
          multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitEdit()}
              onKeyDown={handleKeyDown}
              rows={6}
              className={cn(inputClassName, "min-h-[8rem] resize-y")}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitEdit()}
              onKeyDown={handleKeyDown}
              className={inputClassName}
            />
          )
        ) : error ? (
          <div
            role="button"
            tabIndex={0}
            onDoubleClick={startEditing}
            onKeyDown={(e) => {
              if (e.key === "Enter") startEditing();
            }}
            className={cn(onSave && "cursor-text")}
          >
            <div className="flex items-start gap-2 text-xs text-gray-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
              <span>{errorDetail || "Generation failed"}</span>
            </div>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onDoubleClick={startEditing}
            onKeyDown={(e) => {
              if (e.key === "Enter") startEditing();
            }}
            className={cn(onSave && !running && "cursor-text")}
          >
            {text?.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{text}</p>
            ) : (
              <p className="text-sm italic text-gray-400">Not set yet — double-click to edit</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function mapToOptimizerProduct(product: ImageApprovalProduct): OptimizerProduct {
  const canonicalImages = (product.canonical_products?.product_images ?? []).filter(
    (img) => img.approval_status === "approved" || img.approval_status === null,
  );

  return {
    id: product.id,
    canonical_product_id: product.canonical_product_id,
    description: product.description,
    display_name: product.display_name,
    product_description: product.product_description,
    product_specs: product.product_specs,
    brand: product.brand,
    upc: product.canonical_products?.upc ?? null,
    category_name: product.category_name,
    marketplace_category: null,
    marketplace_subcategory: null,
    listing_source: product.listing_source,
    price: product.price,
    qoh: product.qoh,
    is_bicycle: product.is_bicycle ?? null,
    resolved_image_url: product.resolved_image_url ?? null,
    primary_image_url: product.primary_image_url ?? null,
    canonical_images: canonicalImages as OptimizerProduct["canonical_images"],
    product_images: product.product_images,
    canonical_products: product.canonical_products
      ? {
          id: product.canonical_products.id,
          upc: product.canonical_products.upc ?? null,
          normalized_name: product.canonical_products.normalized_name ?? null,
          product_images: canonicalImages as OptimizerProduct["canonical_images"],
        }
      : null,
  };
}

export function FloatingImageApprovalCard() {
  const [queue, setQueue] = React.useState<ImageApprovalProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [cardHidden, setCardHidden] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [imageRuns, setImageRuns] = React.useState<Record<string, ImageRun>>({});
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [bicycleOverrides, setBicycleOverrides] = React.useState<Record<string, boolean>>({});
  const [bicycleSaving, setBicycleSaving] = React.useState<Set<string>>(() => new Set());
  const [copyRuns, setCopyRuns] = React.useState<Record<string, CopyRunState>>({});
  const [copySaving, setCopySaving] = React.useState<Set<string>>(() => new Set());
  const copyAbortRef = React.useRef<AbortController | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const isProductBicycle = React.useCallback(
    (product: ImageApprovalProduct) =>
      product.id in bicycleOverrides
        ? bicycleOverrides[product.id]
        : !!product.is_bicycle,
    [bicycleOverrides],
  );

  const patchQueueProduct = React.useCallback(
    (productId: string, patch: Partial<ImageApprovalProduct>) => {
      setQueue((prev) =>
        prev.map((item) => (item.id === productId ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const toggleBicycle = React.useCallback(
    async (product: ImageApprovalProduct, nextValue: boolean) => {
      if (bicycleSaving.has(product.id)) return;

      setBicycleSaving((prev) => new Set(prev).add(product.id));
      setBicycleOverrides((prev) => ({ ...prev, [product.id]: nextValue }));
      patchQueueProduct(product.id, { is_bicycle: nextValue });

      try {
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_bicycle: nextValue }),
        });
        if (!response.ok) throw new Error("Failed to update bicycle flag");
        const data = (await response.json()) as { product?: { is_bicycle?: boolean } };
        if (data.product) {
          patchQueueProduct(product.id, { is_bicycle: !!data.product.is_bicycle });
        }
      } catch {
        patchQueueProduct(product.id, { is_bicycle: !!product.is_bicycle });
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
    [bicycleSaving, patchQueueProduct],
  );

  const refreshQueue = React.useCallback(async () => {
    try {
      const response = await fetch("/api/optimize/image-approval-queue");
      if (!response.ok) return;
      const json = (await response.json()) as { products?: ImageApprovalProduct[] };
      const products = json.products ?? [];
      setQueue(products);
      setIndex((prev) => Math.min(prev, Math.max(0, products.length - 1)));
    } catch {
      // Ignore polling errors
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshQueue();
    pollRef.current = setInterval(() => {
      void refreshQueue();
    }, 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshQueue]);

  const queueRef = React.useRef(queue);
  queueRef.current = queue;

  const current = queue[index] ?? null;
  const currentProduct = current ? mapToOptimizerProduct(current) : null;
  const currentRun = current ? imageRuns[current.id] ?? emptyImageRun() : emptyImageRun();
  const currentCopyRun = current ? copyRuns[current.id] ?? emptyCopyRun() : emptyCopyRun();

  const setCopyField = React.useCallback(
    (productId: string, field: CopyField, patch: Partial<TextStep>) => {
      setCopyRuns((prev) => {
        const base = prev[productId] ?? emptyCopyRun();
        return {
          ...prev,
          [productId]: {
            ...base,
            [field]: { ...base[field], ...patch },
          },
        };
      });
    },
    [],
  );

  const copySavingKey = React.useCallback(
    (productId: string, field: CopyField) => `${productId}:${field}`,
    [],
  );

  const isCopySaving = React.useCallback(
    (productId: string, field: CopyField) => copySaving.has(copySavingKey(productId, field)),
    [copySaving, copySavingKey],
  );

  const saveCopyField = React.useCallback(
    async (product: ImageApprovalProduct, field: CopyField, value: string) => {
      const key = copySavingKey(product.id, field);
      if (copySaving.has(key)) return;

      const payload: Record<string, string | null> = {};
      const revert: Partial<ImageApprovalProduct> = {};

      if (field === "title") {
        payload.display_name = value || null;
        revert.display_name = product.display_name;
        patchQueueProduct(product.id, { display_name: value || null });
      } else if (field === "description") {
        payload.product_description = value || null;
        revert.product_description = product.product_description;
        patchQueueProduct(product.id, { product_description: value || null });
      } else {
        payload.product_specs = value || null;
        revert.product_specs = product.product_specs;
        patchQueueProduct(product.id, { product_specs: value || null });
      }

      setCopySaving((prev) => new Set(prev).add(key));

      try {
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Failed to save");
        setCopyField(product.id, field, { status: "idle" });
      } catch {
        patchQueueProduct(product.id, revert);
        throw new Error("Failed to save");
      } finally {
        setCopySaving((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [copySaving, copySavingKey, patchQueueProduct, setCopyField],
  );

  const regenerateTitle = React.useCallback(
    async (product: ImageApprovalProduct) => {
      const productId = product.id;
      setCopyField(productId, "title", { status: "running", detail: "Cleaning title" });
      copyAbortRef.current?.abort();
      copyAbortRef.current = new AbortController();

      try {
        const response = await fetch("/api/products/generate-titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: [productId] }),
          signal: copyAbortRef.current.signal,
        });
        if (!response.ok || !response.body) throw new Error("Failed to start title generation");

        await readSSE(response.body, (event) => {
          if (event.productId !== productId || event.event !== "product_complete") return;
          const title = (event.title as string | null) ?? null;
          if (event.success && title) {
            patchQueueProduct(productId, { display_name: title });
            setCopyField(productId, "title", { status: "done" });
          } else {
            setCopyField(productId, "title", {
              status: "error",
              detail: (event.error as string) || "Failed",
            });
          }
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setCopyField(productId, "title", { status: "error", detail: "Generation failed" });
      }
    },
    [patchQueueProduct, setCopyField],
  );

  const regenerateCopyField = React.useCallback(
    async (product: ImageApprovalProduct, mode: "description" | "specs") => {
      const productId = product.id;
      const field: CopyField = mode;
      setCopyField(productId, field, { status: "running", detail: "Writing" });
      copyAbortRef.current?.abort();
      copyAbortRef.current = new AbortController();

      const bicycleOverridesPayload =
        productId in bicycleOverrides
          ? { [productId]: bicycleOverrides[productId] }
          : {};

      try {
        const response = await fetch("/api/products/generate-product-descriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productIds: [productId],
            mode,
            bicycleOverrides: bicycleOverridesPayload,
          }),
          signal: copyAbortRef.current.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error("Failed to start generation");
        }

        await readSSE(response.body, (event) => {
          if (event.productId !== productId || event.event !== "product_complete") return;

          if (event.success) {
            const description = (event.description as string | null) ?? null;
            const specs = (event.specs as string | null) ?? null;
            const patch: Partial<ImageApprovalProduct> = {};
            if (mode === "description" && description) {
              patch.product_description = description;
            }
            if (mode === "specs" && specs) {
              patch.product_specs = specs;
            }
            if (Object.keys(patch).length > 0) {
              patchQueueProduct(productId, patch);
            }
            setCopyField(productId, field, { status: "done" });
          } else {
            setCopyField(productId, field, {
              status: "error",
              detail: (event.error as string) || "Failed",
            });
          }
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setCopyField(productId, field, { status: "error", detail: "Generation failed" });
      }
    },
    [bicycleOverrides, patchQueueProduct, setCopyField],
  );

  const hydrateRun = React.useCallback(async (product: ImageApprovalProduct) => {
    if (!product.canonical_product_id) return;

    const caches = await fetchSerperCaches([product.canonical_product_id]);
    const cached = imageRunFromSerperCache(caches[product.canonical_product_id]);
    if (!cached || cached.phase !== "ready") return;

    setImageRuns((prev) => {
      const existing = prev[product.id];
      if (existing && existing.phase !== "idle") {
        return prev;
      }
      return {
        ...prev,
        [product.id]: { ...emptyImageRun(), ...cached },
      };
    });
  }, []);

  const currentProductId = current?.id ?? null;

  React.useEffect(() => {
    if (!currentProductId || cardHidden) return;
    const product = queueRef.current.find((item) => item.id === currentProductId);
    if (!product) return;
    void hydrateRun(product);
  }, [cardHidden, currentProductId, hydrateRun]);

  const patchImageRun = React.useCallback(
    (productId: string, patch: Partial<ImageRun> | ((prev: ImageRun) => Partial<ImageRun>)) => {
      setImageRuns((prev) => {
        const base = prev[productId] ?? emptyImageRun();
        const nextPatch = typeof patch === "function" ? patch(base) : patch;
        return { ...prev, [productId]: { ...base, ...nextPatch } };
      });
    },
    [],
  );

  const goNext = React.useCallback(() => {
    setIndex((prev) => Math.min(prev + 1, Math.max(0, queue.length - 1)));
  }, [queue.length]);

  const goPrev = React.useCallback(() => {
    setIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const removeFromQueue = React.useCallback((productId: string) => {
    setQueue((prev) => {
      const next = prev.filter((item) => item.id !== productId);
      setIndex((currentIndex) => Math.min(currentIndex, Math.max(0, next.length - 1)));
      return next;
    });
    setImageRuns((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setCopyRuns((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const approveProductInBackground = React.useCallback(
    async (
      product: ImageApprovalProduct,
      optimizerProduct: OptimizerProduct,
      run: ImageRun,
    ) => {
      try {
        const speedProduct = toSpeedProduct(optimizerProduct);
        const resolved = imageRunWithEnhancedUrls(run);
        const response = await fetch("/api/admin/images/approve-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonicalProductId: optimizerProduct.canonical_product_id,
            selectedCandidates: resolved.selectedCandidates,
            primaryCandidateUrl: resolved.primaryCandidateUrl,
            searchQuery: buildSpeedSearchQuery(speedProduct),
            rejectPending: true,
            quickMode: true,
          }),
        });

        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || "Failed to save images");
        }

        void refreshQueue();
      } catch {
        void refreshQueue();
      }
    },
    [refreshQueue],
  );

  const approveAndNext = React.useCallback(() => {
    if (!current || !currentProduct?.canonical_product_id) return;
    const run = imageRuns[current.id] ?? emptyImageRun();
    if (run.phase !== "ready" || !run.primaryUrl) return;

    const productSnapshot = current;
    const optimizerSnapshot = currentProduct;
    const runSnapshot = run;

    removeFromQueue(current.id);
    void approveProductInBackground(productSnapshot, optimizerSnapshot, runSnapshot);
  }, [
    approveProductInBackground,
    current,
    currentProduct,
    imageRuns,
    removeFromQueue,
  ]);

  const reloadCandidates = React.useCallback(async () => {
    if (!currentProduct) return;
    patchImageRun(current.id, { reloading: true });
    try {
      const speedProduct = toSpeedProduct(currentProduct);
      const fresh = await fetchSerperCandidates(speedProduct, buildSpeedSearchQuery(speedProduct));
      patchImageRun(current.id, (prev) => {
        const existing = new Set(prev.candidates.map((candidate) => candidate.url));
        return {
          candidates: [...prev.candidates, ...fresh.filter((candidate) => !existing.has(candidate.url))],
          showAdditional: true,
          reloading: false,
        };
      });
    } catch {
      patchImageRun(current.id, { reloading: false });
    }
  }, [current?.id, currentProduct, patchImageRun]);

  const toggleAdditional = React.useCallback(() => {
    if (!current) return;
    patchImageRun(current.id, (prev) => {
      if (prev.showAdditional) return { showAdditional: false };
      if (prev.candidates.length <= prev.selectedUrls.length) {
        void reloadCandidates();
        return {};
      }
      return { showAdditional: true };
    });
  }, [current, patchImageRun, reloadCandidates]);

  const enhanceImage = React.useCallback(
    async (url: string) => {
      const productId = current?.id;
      const canonicalProductId = currentProduct?.canonical_product_id;
      if (!productId || !canonicalProductId) return;

      let alreadyEnhancing = false;
      setImageRuns((prev) => {
        const run = prev[productId];
        if ((run?.enhancingUrls ?? []).includes(url)) {
          alreadyEnhancing = true;
          return prev;
        }
        const base = run ?? emptyImageRun();
        return {
          ...prev,
          [productId]: {
            ...base,
            enhancingUrls: [...(base.enhancingUrls ?? []), url],
          },
        };
      });
      if (alreadyEnhancing) return;

      try {
        const response = await fetch("/api/admin/images/enhance-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: url,
            canonicalProductId,
          }),
        });
        const json = await response.json();
        if (!response.ok || !json.success || !json.url) {
          throw new Error(json.error || "Enhancement failed");
        }

        const enhancedUrl = json.url as string;
        patchImageRun(productId, (prev) => ({
          enhancedUrls: { ...(prev.enhancedUrls ?? {}), [url]: enhancedUrl },
        }));
      } catch {
        patchImageRun(productId, (prev) => ({
          enhancingUrls: (prev.enhancingUrls ?? []).filter((item) => item !== url),
        }));
      }
    },
    [current?.id, currentProduct?.canonical_product_id, patchImageRun],
  );

  const onEnhanceDisplayReady = React.useCallback(
    (originalUrl: string) => {
      if (!current?.id) return;
      patchImageRun(current.id, (prev) => ({
        enhancingUrls: (prev.enhancingUrls ?? []).filter((item) => item !== originalUrl),
      }));
    },
    [current?.id, patchImageRun],
  );

  const enhanceBusy = (currentRun.enhancingUrls?.length ?? 0) > 0;

  React.useEffect(() => {
    if (cardHidden || !current) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (lightbox) {
        if (event.key === "Escape") setLightbox(null);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !enhanceBusy) {
        event.preventDefault();
        approveAndNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [approveAndNext, cardHidden, current, enhanceBusy, goNext, goPrev, lightbox]);

  if (loading && queue.length === 0) {
    return null;
  }

  if (queue.length === 0) {
    return null;
  }

  const readyCount = queue.length;
  const positionLabel = `${index + 1} of ${readyCount}`;
  const imageBusy = IMG_BUSY.includes(currentRun.phase);
  const canApprove =
    currentRun.phase === "ready" && !!currentRun.primaryUrl && !enhanceBusy;

  if (cardHidden) {
    return (
      <button
        type="button"
        onClick={() => setCardHidden(false)}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-lg transition hover:bg-gray-50"
        aria-label="Show image approval queue"
      >
        <ImageIcon className="h-4 w-4 text-gray-500" />
        Approve image
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
          {readyCount}
        </span>
      </button>
    );
  }

  const panelMaxHeight = "max-h-[min(82vh,40rem)]";

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="image-approval-cards"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex max-w-[calc(100vw-2rem)] items-stretch gap-3"
        >
          {currentProduct ? (
            <div
              className={cn(
                "flex w-[min(100vw-2rem,22rem)] shrink-0 flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-xl",
                panelMaxHeight,
              )}
            >
              <div className="shrink-0 border-b border-gray-100 px-5 py-4">
                <p className="text-sm font-medium text-gray-800">Product copy</p>
                <p className="mt-0.5 truncate text-xs text-gray-500">{productLabel(current)}</p>
                <div className="mt-1.5">
                  <LightspeedSkuHint product={current} />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
                {(() => {
                  const titleStep = currentCopyRun.title;
                  const titleRunning =
                    titleStep.status === "running" || titleStep.status === "queued";
                  return (
                    <CopyScrollField
                      label="Title"
                      icon={Type}
                      text={current.display_name || current.description}
                      running={titleRunning}
                      saving={isCopySaving(current.id, "title")}
                      error={titleStep.status === "error"}
                      errorDetail={titleStep.detail}
                      className="max-h-28 shrink-0"
                      onRegenerate={() => void regenerateTitle(current)}
                      onSave={(value) => saveCopyField(current, "title", value)}
                    />
                  );
                })()}

                {(["description", "specs"] as const).map((key) => {
                  const meta = COPY_FIELD_META.find((item) => item.key === key)!;
                  const step = currentCopyRun[key];
                  const running = step.status === "running" || step.status === "queued";
                  const text =
                    key === "description"
                      ? current.product_description
                      : current.product_specs;

                  return (
                    <CopyScrollField
                      key={key}
                      label={meta.label}
                      icon={meta.icon}
                      text={text}
                      running={running}
                      saving={isCopySaving(current.id, key)}
                      error={step.status === "error"}
                      errorDetail={step.detail}
                      className="min-h-0 flex-1"
                      multiline
                      onRegenerate={() => void regenerateCopyField(current, key)}
                      onSave={(value) => saveCopyField(current, key, value)}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="w-[min(100vw-2rem,44rem)] shrink-0">
            <div
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-xl",
                panelMaxHeight,
              )}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">Approve image</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {readyCount} ready · Serper cached with copy loaded
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCardHidden(true)}
                  className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Hide image approval"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {currentProduct ? (
                <>
                  <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain">
                    <div className="border-b border-gray-100 px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-gray-900">
                            {productLabel(current)}
                          </p>
                          <div className="mt-1">
                            <LightspeedSkuHint product={current} />
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {current.brand || "No brand"}
                            {current.category_name ? ` · ${current.category_name}` : ""}
                            {typeof current.qoh === "number" ? ` · SOH ${current.qoh}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700",
                              bicycleSaving.has(current.id) && "pointer-events-none opacity-60",
                            )}
                          >
                            <Checkbox
                              checked={isProductBicycle(current)}
                              disabled={bicycleSaving.has(current.id)}
                              onCheckedChange={(checked) =>
                                void toggleBicycle(current, checked === true)
                              }
                              aria-label={
                                isProductBicycle(current)
                                  ? "Mark as not a bicycle"
                                  : "Mark as bicycle"
                              }
                            />
                            Bicycle
                          </label>
                          <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                            {positionLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full min-w-0 p-5">
                      {currentRun.phase === "idle" ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading cached images…
                        </div>
                      ) : (
                        <OptimizerImageReview
                          img={currentRun}
                          hasCanonical={!!currentProduct.canonical_product_id}
                          saving={currentRun.phase === "saving"}
                          hideApproveAction
                          size="large"
                          onSetPrimary={(url) =>
                            patchImageRun(current.id, { primaryUrl: url })
                          }
                          onRemove={(url) =>
                            patchImageRun(current.id, (prev) => {
                              if (prev.selectedUrls.length <= 1) return {};
                              const selectedUrls = prev.selectedUrls.filter((item) => item !== url);
                              const selectedCandidates = prev.selectedCandidates.filter(
                                (candidate) => candidate.url !== url,
                              );
                              return {
                                selectedUrls,
                                selectedCandidates,
                                primaryUrl:
                                  prev.primaryUrl === url
                                    ? selectedUrls[0] ?? null
                                    : prev.primaryUrl,
                              };
                            })
                          }
                          onAdd={(candidate: SpeedSearchCandidate) =>
                            patchImageRun(current.id, (prev) => {
                              if (
                                prev.selectedUrls.includes(candidate.url) ||
                                prev.selectedUrls.length >= MAX_SELECTED_IMAGES
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
                          onEnhance={(url) => void enhanceImage(url)}
                          onToggleAdditional={toggleAdditional}
                          onApprove={() => void approveAndNext()}
                          onEnhanceDisplayReady={onEnhanceDisplayReady}
                          onLightbox={setLightbox}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/80 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={goPrev}
                        disabled={index === 0}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        disabled={index >= queue.length - 1}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canApprove || imageBusy}
                        onClick={approveAndNext}
                      >
                        {enhanceBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Approve &amp; next
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="px-5 py-10 text-center text-sm text-gray-500">
                  Queue is empty.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {lightbox ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-6"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.95 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative h-[min(80vh,640px)] w-full max-w-3xl overflow-hidden rounded-md bg-white"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-gray-600 shadow-sm"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
              <Image src={lightbox} alt="" fill unoptimized className="object-contain" />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

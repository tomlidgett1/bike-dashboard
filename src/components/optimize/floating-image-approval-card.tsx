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
  Check,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OptimizerImageReview } from "@/components/optimize/optimizer-image-review";
import {
  emptyImageRun,
  imageRunWithEnhancedUrls,
  type ImageRun,
  type OptimizerProduct,
  toSpeedProduct,
  IMG_BUSY,
  MAX_SELECTED_IMAGES,
} from "@/components/optimize/optimizer-shared";
import {
  fetchSerperCaches,
  productLabel,
  type ImageApprovalProduct,
} from "@/lib/optimize/image-approval-queue";
import { imageRunFromSerperCache } from "@/lib/optimize/serper-image-cache";
import { cn } from "@/lib/utils";

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

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-[min(100vw-2rem,44rem)]"
        >
          <div className="flex max-h-[min(82vh,40rem)] flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-xl">
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
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <div className="border-b border-gray-100 px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-gray-900">
                          {productLabel(current)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
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

                  <div className="p-5">
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

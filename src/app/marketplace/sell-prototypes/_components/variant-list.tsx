"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  MOCK_PHOTOS,
  MOCK_PRODUCTS,
  formatAUD,
  typeLabel,
  type MockProduct,
} from "./mock-data";
import {
  PButton,
  ProductEditor,
  ConfidenceTag,
  Spinner,
  CameraIcon,
  GalleryIcon,
  CheckIcon,
  ChevronIcon,
  SparkleIcon,
  TrashIcon,
  BRAND,
} from "./shared";

type Stage = "idle" | "ready" | "analysing" | "list" | "publishing" | "success";

export function VariantList() {
  const [stage, setStage] = React.useState<Stage>("idle");
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [products, setProducts] = React.useState<MockProduct[]>([]);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [reviewed, setReviewed] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (stage !== "analysing") return;
    const t = window.setTimeout(() => {
      setProducts(MOCK_PRODUCTS.map((p) => ({ ...p })));
      setStage("list");
    }, 2600);
    return () => window.clearTimeout(t);
  }, [stage]);

  React.useEffect(() => {
    if (stage !== "publishing") return;
    const t = window.setTimeout(() => setStage("success"), 1800);
    return () => window.clearTimeout(t);
  }, [stage]);

  const addPhotos = () => {
    setPhotos(MOCK_PHOTOS);
    setStage("ready");
  };

  const patch = (id: string, p: Partial<MockProduct>) =>
    setProducts((prev) => prev.map((pr) => (pr.id === id ? { ...pr, ...p } : pr)));
  const removeProduct = (id: string) => {
    setProducts((prev) => prev.filter((pr) => pr.id !== id));
    setReviewed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const toggleExpand = (id: string) =>
    setExpanded((cur) => (cur === id ? null : id));
  const markReviewed = (id: string) => {
    setReviewed((prev) => new Set(prev).add(id));
    setExpanded(null);
  };

  const total = products.reduce((s, p) => s + (p.price || 0), 0);

  if (stage === "success") {
    return (
      <div className="grid place-items-center px-4 py-24 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="grid h-20 w-20 place-items-center rounded-full text-gray-900"
          style={{ backgroundColor: BRAND }}
        >
          <CheckIcon className="h-10 w-10" />
        </motion.div>
        <h2 className="mt-6 text-[24px] font-bold text-gray-900">All published</h2>
        <p className="mt-1.5 text-[15px] text-gray-500">
          {products.length} listings · {formatAUD(total)} total
        </p>
        <div className="mt-6 w-full max-w-[320px]">
          <PButton full>View my listings</PButton>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[78dvh] pb-28">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-[18px] font-bold text-gray-900">Bulk upload</h1>
        <p className="text-[13px] text-gray-500">
          {stage === "list"
            ? `${products.length} items · ${reviewed.size} reviewed`
            : "Add photos, we sort the rest"}
        </p>
      </div>

      <div className="px-4">
        {/* Photo zone */}
        {stage === "idle" && (
          <div className="pt-4">
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
              <p className="text-[15px] font-semibold text-gray-900">
                Add photos of everything
              </p>
              <p className="mx-auto mt-1 max-w-[260px] text-[13px] text-gray-500">
                Mix bikes, parts and gear together — we&apos;ll split them into
                listings automatically.
              </p>
              <div className="mt-4 flex justify-center gap-2.5">
                <PButton variant="secondary" onClick={addPhotos}>
                  <CameraIcon className="h-5 w-5" />
                  Camera
                </PButton>
                <PButton variant="secondary" onClick={addPhotos}>
                  <GalleryIcon className="h-5 w-5" />
                  Library
                </PButton>
              </div>
            </div>
          </div>
        )}

        {/* Photos added, awaiting analyse */}
        {(stage === "ready" || stage === "analysing") && (
          <div className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-semibold text-gray-900">
                {photos.length} photos
              </p>
              <button
                type="button"
                onClick={addPhotos}
                className="text-[13px] font-medium text-gray-500 hover:text-gray-900"
              >
                Add more
              </button>
            </div>
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
              {photos.map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>

            {stage === "analysing" ? (
              <div className="mt-5 flex items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-4">
                <Spinner size={20} />
                <div>
                  <p className="text-[14px] font-semibold text-gray-900">
                    Analysing photos…
                  </p>
                  <p className="text-[12px] text-gray-500">
                    Grouping & identifying your items
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <PButton full onClick={() => setStage("analysing")}>
                  <SparkleIcon className="h-5 w-5" />
                  Analyse & create listings
                </PButton>
              </div>
            )}
          </div>
        )}

        {/* The list */}
        {stage === "list" && (
          <div className="space-y-2.5 pt-4">
            {products.map((p) => {
              const isOpen = expanded === p.id;
              const isReviewed = reviewed.has(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "overflow-hidden rounded-md border bg-white transition-colors",
                    isOpen ? "border-gray-900" : "border-gray-200",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(p.id)}
                    className="flex w-full items-center gap-3 p-2.5 text-left"
                  >
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.images[0]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {isReviewed && (
                        <div
                          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-gray-900"
                          style={{ backgroundColor: BRAND }}
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-gray-900">
                        {p.title}
                      </p>
                      <p className="text-[13px] font-medium text-gray-700">
                        {formatAUD(p.price)}
                        <span className="font-normal text-gray-400">
                          {" "}
                          · {typeLabel(p.type)}
                        </span>
                      </p>
                      <div className="mt-1">
                        <ConfidenceTag confidence={p.confidence} />
                      </div>
                    </div>
                    <ChevronIcon
                      className={cn(
                        "h-5 w-5 flex-shrink-0 rotate-90 text-gray-400 transition-transform duration-200",
                        isOpen && "-rotate-90",
                      )}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-gray-100 p-3">
                          <ProductEditor
                            product={p}
                            onPatch={(patchData) => patch(p.id, patchData)}
                            onDelete={() => removeProduct(p.id)}
                            showImages={false}
                          />
                          <div className="mt-4">
                            <PButton full onClick={() => markReviewed(p.id)}>
                              <CheckIcon className="h-5 w-5" />
                              Done — looks good
                            </PButton>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addPhotos}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 bg-white py-3 text-[14px] font-medium text-gray-600"
            >
              <GalleryIcon className="h-5 w-5" />
              Add more photos
            </button>
          </div>
        )}

        {stage === "publishing" && (
          <div className="grid place-items-center py-24">
            <Spinner size={28} />
            <p className="mt-4 text-[15px] font-medium text-gray-700">
              Publishing {products.length} listings…
            </p>
          </div>
        )}
      </div>

      {/* Sticky publish bar */}
      {stage === "list" && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[460px] border-t border-gray-100 bg-white/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="text-gray-500">{products.length} listings</span>
            <span className="font-semibold text-gray-900">
              {formatAUD(total)} total value
            </span>
          </div>
          <PButton full onClick={() => setStage("publishing")}>
            Publish all {products.length} listings
          </PButton>
        </div>
      )}
    </div>
  );
}

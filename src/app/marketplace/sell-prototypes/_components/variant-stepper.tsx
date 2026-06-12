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
  Spinner,
  CameraIcon,
  GalleryIcon,
  CheckIcon,
  ArrowLeftIcon,
  ChevronIcon,
  SparkleIcon,
  TrashIcon,
  BRAND,
} from "./shared";

type Stage = "photos" | "analysing" | "review" | "summary" | "publishing" | "success";

const STEP_LABELS = ["Photos", "Review", "Publish"];
const ANALYSE_MESSAGES = [
  "Looking at your photos…",
  "Grouping items together…",
  "Identifying makes & models…",
  "Estimating fair prices…",
  "Writing descriptions…",
];

export function VariantStepper() {
  const [stage, setStage] = React.useState<Stage>("photos");
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [products, setProducts] = React.useState<MockProduct[]>([]);
  const [index, setIndex] = React.useState(0);
  const [msgIndex, setMsgIndex] = React.useState(0);

  const stepNumber = stage === "photos" ? 0 : stage === "summary" || stage === "publishing" || stage === "success" ? 2 : 1;

  // Analysing animation
  React.useEffect(() => {
    if (stage !== "analysing") return;
    setMsgIndex(0);
    const msgTimer = window.setInterval(() => {
      setMsgIndex((m) => Math.min(m + 1, ANALYSE_MESSAGES.length - 1));
    }, 700);
    const done = window.setTimeout(() => {
      setProducts(MOCK_PRODUCTS.map((p) => ({ ...p })));
      setIndex(0);
      setStage("review");
    }, 3600);
    return () => {
      window.clearInterval(msgTimer);
      window.clearTimeout(done);
    };
  }, [stage]);

  React.useEffect(() => {
    if (stage !== "publishing") return;
    const t = window.setTimeout(() => setStage("success"), 1800);
    return () => window.clearTimeout(t);
  }, [stage]);

  const addPhotos = () => {
    setPhotos((prev) => (prev.length ? prev : MOCK_PHOTOS));
  };
  const removePhoto = (i: number) =>
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));

  const patch = (id: string, p: Partial<MockProduct>) =>
    setProducts((prev) => prev.map((pr) => (pr.id === id ? { ...pr, ...p } : pr)));
  const removeProduct = (id: string) =>
    setProducts((prev) => prev.filter((pr) => pr.id !== id));

  const total = products.reduce((s, p) => s + (p.price || 0), 0);

  return (
    <div className="flex min-h-[78dvh] flex-col">
      {/* App bar + progress */}
      {stage !== "success" && (
        <div className="sticky top-0 z-10 bg-white px-4 pb-3 pt-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-md text-gray-700 hover:bg-gray-100"
              aria-label="Back"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                {STEP_LABELS.map((label, i) => (
                  <React.Fragment key={label}>
                    <div
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors",
                        i <= stepNumber ? "" : "bg-gray-200",
                      )}
                      style={i <= stepNumber ? { backgroundColor: BRAND } : undefined}
                    />
                  </React.Fragment>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] font-medium text-gray-500">
                Step {stepNumber + 1} of 3 · {STEP_LABELS[stepNumber]}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 pb-28">
        {stage === "photos" && (
          <PhotosStage
            photos={photos}
            onAdd={addPhotos}
            onRemove={removePhoto}
          />
        )}

        {stage === "analysing" && (
          <AnalysingStage message={ANALYSE_MESSAGES[msgIndex]} count={photos.length} />
        )}

        {stage === "review" && products[index] && (
          <ReviewStage
            product={products[index]}
            index={index}
            total={products.length}
            onPatch={(p) => patch(products[index].id, p)}
            onDelete={() => {
              removeProduct(products[index].id);
              setIndex((i) => Math.max(0, Math.min(i, products.length - 2)));
            }}
          />
        )}

        {stage === "summary" && (
          <SummaryStage
            products={products}
            total={total}
            onEdit={(i) => {
              setIndex(i);
              setStage("review");
            }}
            onDelete={removeProduct}
          />
        )}

        {stage === "publishing" && (
          <div className="grid place-items-center py-24">
            <Spinner size={28} />
            <p className="mt-4 text-[15px] font-medium text-gray-700">
              Publishing {products.length} listings…
            </p>
          </div>
        )}

        {stage === "success" && (
          <SuccessStage count={products.length} total={total} />
        )}
      </div>

      {/* Fixed bottom CTA */}
      {stage === "photos" && (
        <BottomBar>
          <PButton full disabled={photos.length === 0} onClick={() => setStage("analysing")}>
            <SparkleIcon className="h-5 w-5" />
            {photos.length === 0
              ? "Add photos to continue"
              : `Analyse ${photos.length} photos`}
          </PButton>
        </BottomBar>
      )}

      {stage === "review" && (
        <BottomBar>
          <div className="flex items-center gap-2">
            <PButton
              variant="secondary"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </PButton>
            {index < products.length - 1 ? (
              <PButton full onClick={() => setIndex((i) => i + 1)}>
                Looks good · Next
                <ChevronIcon className="h-5 w-5" />
              </PButton>
            ) : (
              <PButton full onClick={() => setStage("summary")}>
                Review all
                <ChevronIcon className="h-5 w-5" />
              </PButton>
            )}
          </div>
        </BottomBar>
      )}

      {stage === "summary" && (
        <BottomBar>
          <PButton full onClick={() => setStage("publishing")}>
            Publish {products.length} listings · {formatAUD(total)}
          </PButton>
        </BottomBar>
      )}
    </div>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[460px] border-t border-gray-100 bg-white/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {children}
    </div>
  );
}

function PhotosStage({
  photos,
  onAdd,
  onRemove,
}: {
  photos: string[];
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="pt-2">
      <h1 className="text-[24px] font-bold leading-tight text-gray-900">
        Add your photos
      </h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-gray-500">
        Snap or upload everything you want to sell. We&apos;ll sort them into
        separate listings for you.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onAdd}
          className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-gray-700 transition-colors active:scale-[0.98]"
        >
          <CameraIcon className="h-7 w-7" />
          <span className="text-[14px] font-semibold">Camera</span>
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-gray-700 transition-colors active:scale-[0.98]"
        >
          <GalleryIcon className="h-7 w-7" />
          <span className="text-[14px] font-semibold">Photo library</span>
        </button>
      </div>

      {photos.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-[14px] font-semibold text-gray-900">
              {photos.length} photos added
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-[12px] font-medium text-gray-600">
              <SparkleIcon className="h-3.5 w-3.5" />
              Auto-sorted next
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className="relative aspect-square overflow-hidden rounded-md bg-gray-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white"
                  aria-label="Remove photo"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AnalysingStage({ message, count }: { message: string; count: number }) {
  return (
    <div className="grid place-items-center py-20 text-center">
      <div
        className="grid h-20 w-20 place-items-center rounded-full"
        style={{ backgroundColor: "#fff7d6" }}
      >
        <Spinner size={34} />
      </div>
      <h2 className="mt-6 text-[20px] font-bold text-gray-900">
        Analysing {count} photos
      </h2>
      <AnimatePresence mode="wait">
        <motion.p
          key={message}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="mt-2 text-[15px] text-gray-500"
        >
          {message}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function ReviewStage({
  product,
  index,
  total,
  onPatch,
  onDelete,
}: {
  product: MockProduct;
  index: number;
  total: number;
  onPatch: (p: Partial<MockProduct>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="pt-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-gray-900">
          Item {index + 1} of {total}
        </h2>
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5" : "w-1.5 bg-gray-200",
              )}
              style={i === index ? { backgroundColor: BRAND } : undefined}
            />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={product.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          <ProductEditor product={product} onPatch={onPatch} onDelete={onDelete} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SummaryStage({
  products,
  total,
  onEdit,
  onDelete,
}: {
  products: MockProduct[];
  total: number;
  onEdit: (i: number) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="pt-2">
      <h2 className="text-[22px] font-bold text-gray-900">Ready to publish</h2>
      <p className="mt-1 text-[15px] text-gray-500">
        {products.length} listings · {formatAUD(total)} total value
      </p>
      <div className="mt-4 space-y-2.5">
        {products.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-2.5"
          >
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-gray-900">
                {p.title}
              </p>
              <p className="text-[13px] text-gray-500">
                {formatAUD(p.price)} · {typeLabel(p.type)} · {p.condition}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(i)}
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                className="grid h-8 w-8 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-rose-600"
                aria-label="Delete"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SuccessStage({ count, total }: { count: number; total: number }) {
  return (
    <div className="grid place-items-center py-20 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="grid h-20 w-20 place-items-center rounded-full text-gray-900"
        style={{ backgroundColor: BRAND }}
      >
        <CheckIcon className="h-10 w-10" />
      </motion.div>
      <h2 className="mt-6 text-[24px] font-bold text-gray-900">You&apos;re live!</h2>
      <p className="mt-1.5 text-[15px] text-gray-500">
        {count} listings published · {formatAUD(total)} total
      </p>
      <div className="mt-6 w-full">
        <PButton full>View my listings</PButton>
      </div>
    </div>
  );
}

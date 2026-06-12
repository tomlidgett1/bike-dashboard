"use client";

import * as React from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
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
  Chip,
  Spinner,
  GalleryIcon,
  CheckIcon,
  CloseIcon,
  SparkleIcon,
  BRAND,
} from "./shared";

type Stage = "photos" | "analysing" | "deck" | "publish" | "publishing" | "success";

const cardVariants: Variants = {
  enter: { scale: 0.96, opacity: 0, y: 12 },
  center: { scale: 1, opacity: 1, y: 0 },
  exit: (dir: number) => ({
    x: dir * 360,
    opacity: 0,
    rotate: dir * 12,
    transition: { duration: 0.28 },
  }),
};

export function VariantDeck() {
  const [stage, setStage] = React.useState<Stage>("photos");
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [products, setProducts] = React.useState<MockProduct[]>([]);
  const [cursor, setCursor] = React.useState(0);
  const [confirmed, setConfirmed] = React.useState<MockProduct[]>([]);
  const [exitDir, setExitDir] = React.useState<1 | -1>(1);
  const [editing, setEditing] = React.useState<MockProduct | null>(null);

  React.useEffect(() => {
    if (stage !== "analysing") return;
    const t = window.setTimeout(() => {
      setProducts(MOCK_PRODUCTS.map((p) => ({ ...p })));
      setCursor(0);
      setConfirmed([]);
      setStage("deck");
    }, 2600);
    return () => window.clearTimeout(t);
  }, [stage]);

  React.useEffect(() => {
    if (stage !== "publishing") return;
    const t = window.setTimeout(() => setStage("success"), 1800);
    return () => window.clearTimeout(t);
  }, [stage]);

  const current = products[cursor];
  const advance = () => {
    if (cursor >= products.length - 1) {
      setStage("publish");
    } else {
      setCursor((c) => c + 1);
    }
  };

  const confirmCard = () => {
    if (!current) return;
    setExitDir(1);
    setConfirmed((prev) => [...prev, current]);
    advance();
  };

  const skipCard = () => {
    if (!current) return;
    setExitDir(-1);
    advance();
  };

  const saveEdit = (patch: Partial<MockProduct>) => {
    setProducts((prev) =>
      prev.map((p) => (editing && p.id === editing.id ? { ...p, ...patch } : p)),
    );
    setEditing((e) => (e ? { ...e, ...patch } : e));
  };

  const total = confirmed.reduce((s, p) => s + (p.price || 0), 0);

  // ---- Photos ----
  if (stage === "photos") {
    return (
      <div className="flex min-h-[78dvh] flex-col px-4">
        <div className="flex-1 pt-6">
          <h1 className="text-[24px] font-bold leading-tight text-gray-900">
            Sell in a swipe
          </h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-gray-500">
            Add your photos and review each item one card at a time — quick taps,
            no scrolling.
          </p>
          <button
            type="button"
            onClick={() => {
              setPhotos(MOCK_PHOTOS);
            }}
            className="mt-6 flex h-40 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-gray-300 bg-gray-50 text-gray-700 transition-colors active:scale-[0.99]"
          >
            <GalleryIcon className="h-9 w-9" />
            <span className="text-[15px] font-semibold">
              {photos.length ? `${photos.length} photos selected` : "Add photos"}
            </span>
          </button>
          {photos.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {photos.slice(0, 8).map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  className="aspect-square overflow-hidden rounded-md bg-gray-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-white pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <PButton full disabled={!photos.length} onClick={() => setStage("analysing")}>
            <SparkleIcon className="h-5 w-5" />
            {photos.length ? `Analyse ${photos.length} photos` : "Add photos first"}
          </PButton>
        </div>
      </div>
    );
  }

  // ---- Analysing ----
  if (stage === "analysing") {
    return (
      <div className="grid min-h-[78dvh] place-items-center px-4 text-center">
        <div>
          <div
            className="mx-auto grid h-20 w-20 place-items-center rounded-full"
            style={{ backgroundColor: "#fff7d6" }}
          >
            <Spinner size={34} />
          </div>
          <h2 className="mt-6 text-[20px] font-bold text-gray-900">
            Building your cards
          </h2>
          <p className="mt-2 text-[15px] text-gray-500">
            Sorting {photos.length} photos into items…
          </p>
        </div>
      </div>
    );
  }

  // ---- Success ----
  if (stage === "success") {
    return (
      <div className="grid min-h-[78dvh] place-items-center px-4 text-center">
        <div className="w-full">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="mx-auto grid h-20 w-20 place-items-center rounded-full text-gray-900"
            style={{ backgroundColor: BRAND }}
          >
            <CheckIcon className="h-10 w-10" />
          </motion.div>
          <h2 className="mt-6 text-[24px] font-bold text-gray-900">Done!</h2>
          <p className="mt-1.5 text-[15px] text-gray-500">
            {confirmed.length} listings published · {formatAUD(total)} total
          </p>
          <div className="mx-auto mt-6 max-w-[320px]">
            <PButton full>View my listings</PButton>
          </div>
        </div>
      </div>
    );
  }

  // ---- Publish summary ----
  if (stage === "publish" || stage === "publishing") {
    return (
      <div className="min-h-[78dvh] px-4 pb-28 pt-4">
        <h2 className="text-[22px] font-bold text-gray-900">
          {confirmed.length} ready to go
        </h2>
        <p className="mt-1 text-[15px] text-gray-500">
          {formatAUD(total)} total value
        </p>

        {stage === "publishing" ? (
          <div className="grid place-items-center py-24">
            <Spinner size={28} />
            <p className="mt-4 text-[15px] font-medium text-gray-700">
              Publishing {confirmed.length} listings…
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-2.5">
              {confirmed.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-2.5"
                >
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.images[0]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-gray-900">
                      {p.title}
                    </p>
                    <p className="text-[13px] text-gray-500">
                      {formatAUD(p.price)} · {p.condition}
                    </p>
                  </div>
                  <div
                    className="grid h-6 w-6 place-items-center rounded-full text-gray-900"
                    style={{ backgroundColor: BRAND }}
                  >
                    <CheckIcon className="h-4 w-4" />
                  </div>
                </div>
              ))}
              {confirmed.length === 0 && (
                <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center text-[14px] text-gray-500">
                  No items confirmed. Go back and swipe right to keep items.
                </div>
              )}
            </div>
            <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[460px] border-t border-gray-100 bg-white/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
              <PButton
                full
                disabled={confirmed.length === 0}
                onClick={() => setStage("publishing")}
              >
                Publish {confirmed.length} listings
              </PButton>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- Deck ----
  return (
    <div className="flex min-h-[78dvh] flex-col px-4">
      {/* Progress */}
      <div className="pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold text-gray-900">
            {confirmed.length} confirmed
          </p>
          <p className="text-[13px] text-gray-500">
            {cursor + 1} of {products.length}
          </p>
        </div>
        <div className="mt-2 flex gap-1.5">
          {products.map((p, i) => (
            <span
              key={p.id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < cursor ? "" : i === cursor ? "bg-gray-400" : "bg-gray-200",
              )}
              style={i < cursor ? { backgroundColor: BRAND } : undefined}
            />
          ))}
        </div>
      </div>

      {/* Card */}
      <div className="relative flex-1 py-4" style={{ minHeight: 440 }}>
        <AnimatePresence custom={exitDir} mode="popLayout">
          {current && (
            <motion.div
              key={current.id}
              custom={exitDir}
              variants={cardVariants}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={(_, info) => {
                if (info.offset.x > 120) confirmCard();
                else if (info.offset.x < -120) skipCard();
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className="absolute inset-x-0 overflow-hidden rounded-md border border-gray-200 bg-white"
            >
              <div className="relative">
                <div className="aspect-[4/3] w-full bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={current.images[0]}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="absolute left-3 top-3">
                  <ConfidenceTag confidence={current.confidence} />
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[18px] font-bold leading-snug text-gray-900">
                    {current.title}
                  </h3>
                  <p className="whitespace-nowrap text-[20px] font-bold text-gray-900">
                    {formatAUD(current.price)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip tone="ink">{typeLabel(current.type)}</Chip>
                  <Chip>{current.condition}</Chip>
                  {current.frameSize && <Chip>{current.frameSize}</Chip>}
                  {current.groupset && <Chip>{current.groupset}</Chip>}
                </div>
                <p className="mt-3 line-clamp-3 text-[14px] leading-relaxed text-gray-600">
                  {current.description}
                </p>
                <button
                  type="button"
                  onClick={() => setEditing(current)}
                  className="mt-3 text-[14px] font-semibold text-gray-900 underline underline-offset-2"
                >
                  Edit details
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="bg-white pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={skipCard}
            className="grid h-14 w-14 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition-all active:scale-95"
            aria-label="Skip item"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={confirmCard}
            className="grid h-16 w-16 place-items-center rounded-full text-gray-900 shadow-sm transition-all active:scale-95"
            style={{ backgroundColor: BRAND }}
            aria-label="Confirm item"
          >
            <CheckIcon className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => current && setEditing(current)}
            className="grid h-14 w-14 place-items-center rounded-full border border-gray-200 bg-white text-gray-700 transition-all active:scale-95"
            aria-label="Edit item"
          >
            <SparkleIcon className="h-6 w-6" />
          </button>
        </div>
        <p className="mt-2 text-center text-[12px] text-gray-400">
          Swipe right to keep · left to skip
        </p>
      </div>

      {/* Edit bottom sheet (project popup animation) */}
      <EditSheet
        product={editing}
        onClose={() => setEditing(null)}
        onPatch={saveEdit}
      />
    </div>
  );
}

function EditSheet({
  product,
  onClose,
  onPatch,
}: {
  product: MockProduct | null;
  onClose: () => void;
  onPatch: (patch: Partial<MockProduct>) => void;
}) {
  return (
    <AnimatePresence>
      {product && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-30 bg-black/40"
          />
          <motion.div
            initial={{ y: 40, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[88dvh] w-full max-w-[460px] flex-col rounded-t-md bg-white"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-[16px] font-bold text-gray-900">Edit details</h3>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <ProductEditor product={product} onPatch={onPatch} showImages={false} />
            </div>
            <div className="border-t border-gray-100 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
              <PButton full onClick={onClose}>
                Save
              </PButton>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

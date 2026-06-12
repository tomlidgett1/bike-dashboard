"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Check,
  ListChecks,
  ChevronRight,
  Layers,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOCK_PHOTOS,
  AI_DISCOVERED_SPECS,
  CONDITION_RATINGS,
  BRAND,
  BRAND_SOFT,
  formatAUD,
  type SpecValues,
  type Confidence,
} from "./data";
import { Btn, NumberInput, TextInput, Collapsible, Chevron, ConfidenceDot, Spinner } from "./ui";
import { DetailedSpecs } from "./detailed-specs";

// Bulk works exactly as it does today — photos in, AI sorts them into
// listings. The only change: each bike can now carry the full spec sheet,
// via the same module used in the individual flows.

interface BulkItem {
  id: string;
  images: string[];
  title: string;
  price: number;
  condition: string;
  type: "bike" | "part";
  brand: string;
  model: string;
  bikeType: string;
  confidence: Confidence;
  specs: SpecValues;
}

const INITIAL: BulkItem[] = [
  {
    id: "b1",
    images: [MOCK_PHOTOS[0], MOCK_PHOTOS[1]],
    title: "Specialized Allez Sport 2021",
    price: 1200,
    condition: "Good",
    type: "bike",
    brand: "Specialized",
    model: "Allez Sport",
    bikeType: "Road",
    confidence: "high",
    specs: {},
  },
  {
    id: "b2",
    images: [MOCK_PHOTOS[2], MOCK_PHOTOS[3]],
    title: "Trek Marlin 7 2022",
    price: 850,
    condition: "Excellent",
    type: "bike",
    brand: "Trek",
    model: "Marlin 7",
    bikeType: "Mountain",
    confidence: "medium",
    specs: {},
  },
  {
    id: "b3",
    images: [MOCK_PHOTOS[3]],
    title: "Shimano 105 R7000 Groupset",
    price: 320,
    condition: "Like New",
    type: "part",
    brand: "Shimano",
    model: "105 R7000",
    bikeType: "",
    confidence: "medium",
    specs: {},
  },
];

export function FlowBulk() {
  const [items, setItems] = React.useState<BulkItem[]>(INITIAL);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [specsId, setSpecsId] = React.useState<string | null>(null);
  const [published, setPublished] = React.useState(false);

  const patch = (id: string, p: Partial<BulkItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const total = items.reduce((s, it) => s + it.price, 0);
  const withSpecs = items.filter((it) => Object.values(it.specs).some((v) => v.trim())).length;

  if (published) {
    return (
      <div className="grid min-h-[78dvh] place-items-center px-6 text-center">
        <div>
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="mx-auto grid h-20 w-20 place-items-center rounded-full text-gray-900"
            style={{ backgroundColor: BRAND }}
          >
            <Check className="h-10 w-10" />
          </motion.div>
          <h2 className="mt-6 text-[24px] font-bold text-gray-900">{items.length} listings live!</h2>
          <p className="mt-1.5 text-[15px] text-gray-500">
            {formatAUD(total)} total · {withSpecs} with full specs
          </p>
          <div className="mt-6">
            <Btn full>View my listings</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[78dvh] flex-col">
      <div className="flex-1 space-y-3 px-4 pb-32 pt-4">
        {/* Note: bulk itself unchanged */}
        <div className="rounded-xl border border-gray-200 bg-white p-3.5">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md" style={{ backgroundColor: BRAND_SOFT }}>
              <Layers className="h-5 w-5 text-gray-800" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-gray-900">Sorted into {items.length} listings</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">
                The bulk flow works exactly as it does today. What&apos;s new: each bike can carry the
                <span className="font-medium text-gray-700"> full spec sheet</span> — tap a bike, then
                &ldquo;Add full specifications&rdquo;.
              </p>
            </div>
          </div>
        </div>

        {/* Detected products */}
        {items.map((it) => {
          const open = openId === it.id;
          const specCount = Object.values(it.specs).filter((v) => v.trim()).length;
          return (
            <div key={it.id} className="overflow-hidden rounded-md border border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : it.id)}
                className="flex w-full items-center gap-3 p-2.5 text-left"
              >
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.images[0]} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-gray-900">{it.title}</p>
                  <p className="text-[13px] text-gray-500">
                    {formatAUD(it.price)} · {it.type === "bike" ? "Bike" : "Part"} · {it.condition}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <ConfidenceDot c={it.confidence} withLabel />
                    {specCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-gray-800" style={{ backgroundColor: BRAND_SOFT }}>
                        <ListChecks className="h-3 w-3" />
                        {specCount} specs
                      </span>
                    )}
                  </div>
                </div>
                <Chevron open={open} />
              </button>

              <Collapsible open={open}>
                <div className="space-y-3 border-t border-gray-100 p-3.5">
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-gray-600">Title</label>
                    <TextInput value={it.title} onChange={(v) => patch(it.id, { title: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[12px] font-medium text-gray-600">Price</label>
                      <NumberInput value={it.price} onChange={(v) => patch(it.id, { price: v })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-medium text-gray-600">Condition</label>
                      <select
                        value={it.condition}
                        onChange={(e) => patch(it.id, { condition: e.target.value })}
                        className="h-12 w-full appearance-none rounded-md border border-gray-200 bg-white px-3 text-[15px] text-gray-900 outline-none focus:border-gray-900"
                      >
                        {CONDITION_RATINGS.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.value}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {it.type === "bike" ? (
                    <div className="border-t border-gray-100 pt-1">
                      <button
                        type="button"
                        onClick={() => setSpecsId(specsId === it.id ? null : it.id)}
                        className="flex w-full items-center gap-2.5 py-2 text-left"
                      >
                        <Wand2 className="h-4 w-4 flex-shrink-0 text-gray-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold text-gray-900">Full specifications</p>
                          <p className="text-[12px] text-gray-500">
                            {specCount > 0 ? `${specCount} added` : "Optional · AI can fetch them"}
                          </p>
                        </div>
                        <Chevron open={specsId === it.id} />
                      </button>
                      <Collapsible open={specsId === it.id}>
                        <div className="pb-1">
                          <DetailedSpecs
                            variant="flat"
                            bikeType={it.bikeType}
                            brand={it.brand}
                            model={it.model}
                            title={it.title}
                            specs={it.specs}
                            onChange={(specs) => patch(it.id, { specs })}
                          />
                        </div>
                      </Collapsible>
                    </div>
                  ) : (
                    <p className="text-[12px] text-gray-400">
                      Component listing — spec sheet applies to complete bikes.
                    </p>
                  )}
                </div>
              </Collapsible>
            </div>
          );
        })}

        {/* Bulk auto-fill all */}
        <BulkAutofillAll
          onFillAll={() =>
            setItems((prev) =>
              prev.map((it) => (it.type === "bike" ? { ...it, specs: { ...AI_DISCOVERED_SPECS } } : it)),
            )
          }
          done={withSpecs >= items.filter((i) => i.type === "bike").length}
        />
      </div>

      {/* Publish */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[460px] border-t border-gray-100 bg-white/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <Btn full onClick={() => setPublished(true)}>
          Publish {items.length} listings · {formatAUD(total)}
        </Btn>
      </div>
    </div>
  );
}

function BulkAutofillAll({ onFillAll, done }: { onFillAll: () => void; done: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const run = () => {
    setBusy(true);
    window.setTimeout(() => {
      onFillAll();
      setBusy(false);
    }, 2000);
  };
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy || done}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-3 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50",
      )}
    >
      {busy ? <Spinner size={16} /> : <Sparkles className="h-4 w-4" />}
      {done ? "All bikes have full specs" : busy ? "Fetching specs for every bike…" : "Auto-fill specs for all bikes"}
    </button>
  );
}

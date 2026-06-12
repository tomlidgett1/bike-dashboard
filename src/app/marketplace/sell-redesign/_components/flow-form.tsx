"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Check,
  Wand2,
  ListChecks,
  Truck,
  MapPin,
  Camera,
  Info,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AI_FIELDS,
  AI_DESCRIPTION,
  BIKE_TYPES,
  FRAME_MATERIALS,
  WHEEL_SIZES,
  FRAME_SIZE_SUGGESTIONS,
  CONDITION_RATINGS,
  COLOUR_SWATCHES,
  COMMON_GROUPSETS,
  YEARS,
  BRAND,
  BRAND_SOFT,
  emptyDraft,
  aiPrefilledDraft,
  formatAUD,
  scoreDraft,
  type BikeDraft,
} from "./data";
import {
  Btn,
  Field,
  TextInput,
  TextArea,
  NumberInput,
  OptionPills,
  Toggle,
  Collapsible,
  Chevron,
  ConfidenceDot,
  Spinner,
  PhotoUploader,
} from "./ui";
import { DetailedSpecs } from "./detailed-specs";
import { QualityMeter } from "./flow-guided";
import { uploadPhotos, analysePhotos, analysisToDraftPatch, submitListing } from "./services";

type Phase = "start" | "analysing" | "form" | "published";

const ANALYSE_MSGS = [
  "Looking at your photos…",
  "Recognising the make & model…",
  "Reading the components…",
  "Pre-filling your form…",
];

export function FlowForm() {
  const [phase, setPhase] = React.useState<Phase>("start");
  const [draft, setDraft] = React.useState<BikeDraft>(emptyDraft());
  const [msg, setMsg] = React.useState(0);
  const [specsOpen, setSpecsOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);

  const patch = (p: Partial<BikeDraft>) => setDraft((d) => ({ ...d, ...p }));
  const quality = scoreDraft(draft);

  const handleFiles = async (files: File[]) => {
    setUploading(true);
    try {
      const uploaded = await uploadPhotos(files);
      setDraft((d) => ({
        ...d,
        images: [...d.images, ...uploaded.map((u) => u.url)],
        uploadedImages: [...(d.uploadedImages ?? []), ...uploaded],
      }));
    } catch {
      setDraft((d) => (d.images.length ? d : { ...d, images: aiPrefilledDraft().images }));
    } finally {
      setUploading(false);
    }
  };

  const doPublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      await submitListing(draft, "active");
      setPhase("published");
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Couldn't publish your listing.");
    } finally {
      setPublishing(false);
    }
  };

  // Real AI analysis (falls back to a demo prefill if unavailable).
  React.useEffect(() => {
    if (phase !== "analysing") return;
    setMsg(0);
    const t = window.setInterval(
      () => setMsg((m) => Math.min(m + 1, ANALYSE_MSGS.length - 1)),
      700,
    );
    let cancelled = false;
    const urls = draft.images;
    (async () => {
      let patchData: Partial<BikeDraft>;
      try {
        const analysis = await analysePhotos(urls);
        patchData = analysisToDraftPatch(analysis, urls, draft.uploadedImages ?? []);
      } catch {
        const demo = aiPrefilledDraft();
        patchData = { ...demo, images: urls.length ? urls : demo.images, uploadedImages: draft.uploadedImages };
      }
      if (cancelled) return;
      setDraft((d) => ({ ...d, ...patchData }));
      setPhase("form");
    })();
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "published") {
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
          <h2 className="mt-6 text-[24px] font-bold text-gray-900">Published!</h2>
          <p className="mt-1.5 text-[15px] text-gray-500">
            {draft.title || "Your bike"} · {formatAUD(draft.price)}
          </p>
          <div className="mt-6">
            <Btn full>View my listing</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "start" || phase === "analysing") {
    return (
      <div className="flex min-h-[78dvh] flex-col px-4 pb-10 pt-6">
        {phase === "analysing" ? (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full" style={{ backgroundColor: BRAND_SOFT }}>
                <Spinner size={34} />
              </div>
              <h2 className="mt-6 text-[20px] font-bold text-gray-900">Analysing your photos</h2>
              <AnimatePresence mode="wait">
                <motion.p
                  key={msg}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="mt-2 text-[15px] text-gray-500"
                >
                  {ANALYSE_MSGS[msg]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="pt-4">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900">Sell your bike</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
              Add a few photos and AI fills in the whole form. You review everything on one page before
              publishing.
            </p>
            <div className="mt-6">
              <PhotoUploader images={draft.images} onAdd={() => patch({ images: aiPrefilledDraft().images })} onFiles={handleFiles} uploading={uploading} onRemove={(i) => patch({ images: draft.images.filter((_, idx) => idx !== i) })} />
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <Btn full disabled={draft.images.length === 0} onClick={() => setPhase("analysing")}>
                <Sparkles className="h-5 w-5" />
                {draft.images.length ? `Analyse ${draft.images.length} photos` : "Add photos to continue"}
              </Btn>
              <button
                type="button"
                onClick={() => {
                  setDraft(emptyDraft());
                  setPhase("form");
                }}
                className="py-1 text-[13px] font-medium text-gray-500 hover:text-gray-800"
              >
                Fill in manually instead
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- The form ----
  const aiActive = !!draft.brand;

  return (
    <div className="flex min-h-[78dvh] flex-col">
      <div className="flex-1 space-y-3 px-4 pb-32 pt-4">
        {/* AI summary banner */}
        {aiActive && (
          <div className="rounded-xl border border-gray-200 bg-white p-3.5">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md" style={{ backgroundColor: BRAND_SOFT }}>
                <Sparkles className="h-5 w-5 text-gray-800" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-gray-900">We recognised your bike</p>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  Pre-filled from {draft.images.length} photos. Dots show how confident we are — check the
                  amber ones.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Photos */}
        <FormSection title="Photos" icon={Camera}>
          <PhotoUploader images={draft.images} onAdd={() => patch({ images: aiPrefilledDraft().images })} onFiles={handleFiles} uploading={uploading} onRemove={(i) => patch({ images: draft.images.filter((_, idx) => idx !== i) })} />
        </FormSection>

        {/* Basics */}
        <FormSection title="The basics" icon={Info}>
          <div className="space-y-3">
            <Field label="Title" hint={<ConfMark field="title" draft={draft} />}>
              <TextInput value={draft.title} onChange={(v) => patch({ title: v })} placeholder="e.g. Specialized Allez Sport 2021" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand" hint={<ConfMark field="brand" draft={draft} />}>
                <TextInput value={draft.brand} onChange={(v) => patch({ brand: v })} placeholder="Brand" />
              </Field>
              <Field label="Model" hint={<ConfMark field="model" draft={draft} />}>
                <TextInput value={draft.model} onChange={(v) => patch({ model: v })} placeholder="Model" />
              </Field>
            </div>
            <Field label="Bike type" hint={<ConfMark field="bikeType" draft={draft} />}>
              <OptionPills value={draft.bikeType} options={BIKE_TYPES} columns={3} onChange={(v) => patch({ bikeType: v })} />
            </Field>
            <Field label="Year">
              <OptionPills value={draft.year} options={YEARS.slice(0, 6)} columns={3} onChange={(v) => patch({ year: v })} />
            </Field>
          </div>
        </FormSection>

        {/* Specifications */}
        <FormSection title="Specifications" icon={ListChecks}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Frame size" hint={<ConfMark field="frameSize" draft={draft} />}>
                <OptionPills value={draft.frameSize} options={FRAME_SIZE_SUGGESTIONS.slice(0, 5)} columns={3} onChange={(v) => patch({ frameSize: v })} allowCustom />
              </Field>
              <Field label="Wheel size">
                <OptionPills value={draft.wheelSize} options={WHEEL_SIZES.slice(0, 3)} columns={3} onChange={(v) => patch({ wheelSize: v })} />
              </Field>
            </div>
            <Field label="Frame material" hint={<ConfMark field="frameMaterial" draft={draft} />}>
              <OptionPills value={draft.frameMaterial} options={FRAME_MATERIALS} columns={3} onChange={(v) => patch({ frameMaterial: v })} />
            </Field>
            <Field label="Groupset">
              <TextInput value={draft.groupset} onChange={(v) => patch({ groupset: v })} placeholder="e.g. Shimano 105" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COMMON_GROUPSETS.slice(0, 5).map((g) => (
                  <button key={g} type="button" onClick={() => patch({ groupset: g })} className="rounded-md bg-gray-100 px-2 py-1 text-[12px] font-medium text-gray-700 hover:bg-gray-200">
                    {g}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Colour" hint={<ConfMark field="colourPrimary" draft={draft} />}>
              <div className="flex flex-wrap gap-2">
                {COLOUR_SWATCHES.slice(0, 9).map((c) => {
                  const active = draft.colourPrimary === c.name;
                  return (
                    <button key={c.name} type="button" onClick={() => patch({ colourPrimary: c.name })} className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors" style={active ? { borderColor: INK_BORDER } : { borderColor: "#e5e7eb" }}>
                      <span className="h-4 w-4 rounded-full border border-gray-200" style={{ backgroundColor: c.hex }} />
                      <span className={cn("text-[12px]", active ? "font-semibold text-gray-900" : "text-gray-600")}>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Full specs expander — flat, no nested box */}
            <div className="border-t border-gray-100 pt-1">
              <button type="button" onClick={() => setSpecsOpen((s) => !s)} className="flex w-full items-center gap-2.5 py-2 text-left">
                <Wand2 className="h-4 w-4 flex-shrink-0 text-gray-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-gray-900">Full component specifications</p>
                  <p className="text-[12px] text-gray-500">
                    {quality.specCount > 0 ? `${quality.specCount} added` : "Optional · AI can fetch them"}
                  </p>
                </div>
                <Chevron open={specsOpen} />
              </button>
              <Collapsible open={specsOpen}>
                <div className="pb-1">
                  <DetailedSpecs variant="flat" bikeType={draft.bikeType} brand={draft.brand} model={draft.model} year={draft.year} frameSize={draft.frameSize} frameMaterial={draft.frameMaterial} groupset={draft.groupset} wheelSize={draft.wheelSize} title={draft.title} specs={draft.specs} onChange={(specs) => patch({ specs })} />
                </div>
              </Collapsible>
            </div>
          </div>
        </FormSection>

        {/* Condition */}
        <FormSection title="Condition" icon={Check}>
          <div className="grid grid-cols-2 gap-2">
            {CONDITION_RATINGS.map((c) => {
              const active = draft.condition === c.value;
              return (
                <button key={c.value} type="button" onClick={() => patch({ condition: c.value })} className={cn("rounded-md border px-3 py-2.5 text-left transition-all active:scale-[0.99]", active ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300")}>
                  <p className="text-[14px] font-semibold text-gray-900">{c.value}</p>
                  <p className="text-[11px] leading-tight text-gray-500">{c.blurb}</p>
                </button>
              );
            })}
          </div>
        </FormSection>

        {/* Price */}
        <FormSection title="Price" icon={Sparkles}>
          <div className="space-y-3">
            <NumberInput value={draft.price} onChange={(v) => patch({ price: v })} big placeholder="0" />
            <PriceGuideInline onUse={(v) => patch({ price: v })} />
            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <span className="text-[14px] text-gray-700">Open to offers</span>
              <Toggle checked={true} onChange={() => {}} />
            </div>
          </div>
        </FormSection>

        {/* Description */}
        <FormSection title="Description" icon={Wand2}>
          <DescriptionInline value={draft.description} onChange={(v) => patch({ description: v })} />
        </FormSection>

        {/* Delivery */}
        <FormSection title="Delivery" icon={Truck}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Truck className="h-4.5 w-4.5 text-gray-500" />
                <span className="text-[14px] font-medium text-gray-900">Shipping</span>
              </div>
              <Toggle checked={draft.shippingAvailable} onChange={(v) => patch({ shippingAvailable: v })} />
            </div>
            <Collapsible open={draft.shippingAvailable}>
              <NumberInput value={draft.shippingCost} onChange={(v) => patch({ shippingCost: v })} />
            </Collapsible>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div className="flex items-center gap-2.5">
                <MapPin className="h-4.5 w-4.5 text-gray-500" />
                <span className="text-[14px] font-medium text-gray-900">Local pickup</span>
              </div>
              <Toggle checked={draft.pickupAvailable} onChange={(v) => patch({ pickupAvailable: v })} />
            </div>
            <Collapsible open={draft.pickupAvailable}>
              <TextInput value={draft.pickupLocation} onChange={(v) => patch({ pickupLocation: v })} placeholder="Suburb, State" />
            </Collapsible>
          </div>
        </FormSection>

        <QualityMeter score={quality.score} tips={quality.tips} />
      </div>

      {/* Sticky publish bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[460px] border-t border-gray-100 bg-white/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full transition-all" style={{ width: `${quality.score}%`, backgroundColor: BRAND }} />
          </div>
          <span className="text-[12px] font-semibold tabular-nums text-gray-500">{quality.score}%</span>
        </div>
        {publishError && (
          <div className="mb-2 rounded-xl border border-gray-200 bg-white p-2.5">
            <p className="text-[12px] leading-relaxed text-gray-600">
              <span className="font-semibold text-gray-800">Couldn&apos;t publish.</span> {publishError}
            </p>
          </div>
        )}
        <Btn full disabled={draft.price <= 0 || !draft.title || publishing} onClick={doPublish}>
          {publishing ? (
            <>
              <Spinner size={18} />
              Publishing…
            </>
          ) : (
            <>Publish listing · {formatAUD(draft.price)}</>
          )}
        </Btn>
      </div>
    </div>
  );
}

const INK_BORDER = "#1c1c1e";

function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3.5 py-2.5">
        <Icon className="h-4 w-4 text-gray-500" />
        <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

function ConfMark({ field, draft }: { field: keyof BikeDraft; draft: BikeDraft }) {
  const ai = AI_FIELDS[field as string];
  if (!ai) return null;
  const filledByAi = String(draft[field] ?? "").trim().length > 0;
  if (!filledByAi) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Sparkles className="h-3 w-3 text-gray-400" />
      <ConfidenceDot c={ai.confidence} />
    </span>
  );
}

function PriceGuideInline({ onUse }: { onUse: (v: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onUse(1250)}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left hover:bg-gray-50"
    >
      <span className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-gray-500" />
        <span className="text-[13px] text-gray-700">
          Similar bikes sell for <span className="font-semibold text-gray-900">$1,050–$1,450</span>
        </span>
      </span>
      <span className="rounded-md px-2 py-1 text-[12px] font-semibold text-gray-900" style={{ backgroundColor: BRAND_SOFT }}>
        Use $1,250
      </span>
    </button>
  );
}

function DescriptionInline({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = React.useState(false);
  const regen = () => {
    setBusy(true);
    window.setTimeout(() => {
      onChange(AI_DESCRIPTION);
      setBusy(false);
    }, 1100);
  };
  return (
    <div className="relative">
      <TextArea value={value} onChange={onChange} rows={5} placeholder="Tell buyers about your bike…" />
      <button
        type="button"
        onClick={regen}
        className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-200"
      >
        {busy ? <Spinner size={13} /> : <Wand2 className="h-3.5 w-3.5" />}
        {value ? "Rewrite" : "Write for me"}
      </button>
    </div>
  );
}

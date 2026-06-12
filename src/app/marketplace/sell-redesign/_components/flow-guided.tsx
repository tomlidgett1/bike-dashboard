"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Wand2,
  ListChecks,
  ChevronRight,
  Truck,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GUIDED_QUESTIONS,
  AI_FIELDS,
  AI_DESCRIPTION,
  COLOUR_SWATCHES,
  CONDITION_RATINGS,
  YEARS,
  PRICE_GUIDE,
  BRAND,
  BRAND_SOFT,
  emptyDraft,
  aiPrefilledDraft,
  formatAUD,
  scoreDraft,
  type BikeDraft,
  type GuidedQuestion,
} from "./data";
import {
  Btn,
  TextInput,
  TextArea,
  NumberInput,
  OptionPills,
  Toggle,
  ProgressBar,
  Collapsible,
  ConfidenceDot,
  Spinner,
  PhotoUploader,
} from "./ui";
import { DetailedSpecs } from "./detailed-specs";
import { uploadPhotos, analysePhotos, analysisToDraftPatch, submitListing } from "./services";

const ANALYSE_MSGS = [
  "Looking at your photos…",
  "Recognising the make & model…",
  "Reading the components…",
  "Pre-filling your details…",
];

export function FlowGuided() {
  const [draft, setDraft] = React.useState<BikeDraft>(emptyDraft());
  const [qi, setQi] = React.useState(0);
  const [dir, setDir] = React.useState(1);
  const [analysing, setAnalysing] = React.useState(false);
  const [msg, setMsg] = React.useState(0);
  const [specsOpen, setSpecsOpen] = React.useState(false);
  const [published, setPublished] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);

  const questions = GUIDED_QUESTIONS;
  const q = questions[qi];
  const progress = qi / (questions.length - 1);

  const patch = (p: Partial<BikeDraft>) => setDraft((d) => ({ ...d, ...p }));

  // Real photo upload (falls back to demo photos if upload isn't available,
  // e.g. when reviewing on localhost without a signed-in session).
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

  // Real AI analysis (falls back to a demo prefill if unavailable).
  React.useEffect(() => {
    if (!analysing) return;
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
      setAnalysing(false);
      setDir(1);
      setQi(1);
    })();
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysing]);

  const go = (next: number) => {
    setDir(next > qi ? 1 : -1);
    setQi(Math.max(0, Math.min(questions.length - 1, next)));
  };

  const doPublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      await submitListing(draft, "active");
      setPublished(true);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Couldn't publish your listing.");
    } finally {
      setPublishing(false);
    }
  };

  const handleNext = () => {
    if (q.kind === "photos") {
      setAnalysing(true);
      return;
    }
    if (q.kind === "review") {
      void doPublish();
      return;
    }
    go(qi + 1);
  };

  const canContinue = (() => {
    if (!q.field) return true;
    if (q.optional) return true;
    const v = draft[q.field];
    if (q.kind === "price") return (v as number) > 0;
    if (q.kind === "photos") return draft.images.length > 0;
    return String(v ?? "").trim().length > 0;
  })();

  if (published) return <SuccessScreen draft={draft} />;

  return (
    <div className="flex min-h-[78dvh] flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white px-4 pb-3 pt-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => go(qi - 1)}
            disabled={qi === 0 || analysing}
            className="grid h-9 w-9 place-items-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-30"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <ProgressBar value={analysing ? progress : progress} />
          </div>
          <span className="text-[12px] font-medium tabular-nums text-gray-400">
            {qi + 1}/{questions.length}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 pb-28">
        {analysing ? (
          <Analysing message={ANALYSE_MSGS[msg]} count={draft.images.length} />
        ) : (
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={q.id}
              custom={dir}
              initial={{ opacity: 0, x: dir * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -28 }}
              transition={{ duration: 0.26, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="pt-3"
            >
              <QuestionView
                q={q}
                draft={draft}
                patch={patch}
                specsOpen={specsOpen}
                setSpecsOpen={setSpecsOpen}
                onFiles={handleFiles}
                uploading={uploading}
                onJump={(id) => {
                  const idx = questions.findIndex((x) => x.id === id);
                  if (idx >= 0) go(idx);
                }}
              />
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Bottom CTA */}
      {!analysing && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[460px] border-t border-gray-100 bg-white/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          {q.kind === "specsOffer" && !specsOpen ? (
            <div className="flex items-center gap-2">
              <Btn variant="secondary" onClick={() => go(qi + 1)}>
                Skip
              </Btn>
              <Btn full onClick={() => setSpecsOpen(true)}>
                <Wand2 className="h-4 w-4" />
                Add full specs
              </Btn>
            </div>
          ) : (
            <div>
              {publishError && (
                <div className="mb-2 rounded-xl border border-gray-200 bg-white p-2.5">
                  <p className="text-[12px] leading-relaxed text-gray-600">
                    <span className="font-semibold text-gray-800">Couldn&apos;t publish.</span>{" "}
                    {publishError}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2">
                {q.optional && q.kind !== "review" && (
                  <Btn variant="ghost" onClick={() => go(qi + 1)}>
                    Skip
                  </Btn>
                )}
                <Btn full disabled={!canContinue || publishing} onClick={handleNext}>
                  {q.kind === "review" && publishing ? (
                    <>
                      <Spinner size={18} />
                      Publishing…
                    </>
                  ) : (
                    <>
                      {ctaLabel(q, draft, specsOpen)}
                      {q.kind !== "review" && <ArrowRight className="h-4.5 w-4.5" />}
                      {q.kind === "review" && <Check className="h-5 w-5" />}
                    </>
                  )}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ctaLabel(q: GuidedQuestion, draft: BikeDraft, specsOpen: boolean): string {
  if (q.kind === "photos") return draft.images.length ? `Analyse ${draft.images.length} photos` : "Add photos";
  if (q.kind === "review") return "Publish listing";
  if (q.kind === "specsOffer" && specsOpen) return "Done · Continue";
  return "Continue";
}

// ---- Per-question renderer ---------------------------------

function QuestionView({
  q,
  draft,
  patch,
  specsOpen,
  setSpecsOpen,
  onFiles,
  uploading,
  onJump,
}: {
  q: GuidedQuestion;
  draft: BikeDraft;
  patch: (p: Partial<BikeDraft>) => void;
  specsOpen: boolean;
  setSpecsOpen: (v: boolean) => void;
  onFiles: (files: File[]) => void;
  uploading: boolean;
  onJump: (id: string) => void;
}) {
  const ai = q.field ? AI_FIELDS[q.field as string] : undefined;

  return (
    <div>
      {q.kind !== "review" && q.kind !== "specsOffer" && (
        <Header question={q.question} helper={q.helper} />
      )}

      {/* Photos */}
      {q.kind === "photos" && (
        <div className="mt-5">
          <PhotoUploader
            images={draft.images}
            onAdd={() => patch({ images: aiPrefilledDraft().images })}
            onFiles={onFiles}
            uploading={uploading}
            onRemove={(i) => patch({ images: draft.images.filter((_, idx) => idx !== i) })}
          />
          {draft.images.length > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
              <Sparkles className="h-4 w-4 text-gray-500" />
              <p className="text-[13px] text-gray-600">
                Great — we&apos;ll recognise your bike and pre-fill everything next.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Text */}
      {q.kind === "text" && q.field && (
        <div className="mt-5 space-y-3">
          <TextInput
            value={String(draft[q.field] ?? "")}
            onChange={(v) => patch({ [q.field as string]: v } as Partial<BikeDraft>)}
            placeholder={q.question}
            autoFocus
          />
          {q.suggestions && (
            <div className="flex flex-wrap gap-1.5">
              {q.suggestions.slice(0, 8).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch({ [q.field as string]: s } as Partial<BikeDraft>)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[13px] font-medium transition-colors",
                    draft[q.field as string] === s
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {ai && <AiAssist ai={ai} onPick={(v) => patch({ [q.field as string]: v } as Partial<BikeDraft>)} />}
        </div>
      )}

      {/* Pills */}
      {q.kind === "pills" && q.field && q.options && (
        <div className="mt-5 space-y-3">
          <OptionPills
            value={String(draft[q.field] ?? "")}
            options={q.options}
            columns={q.options.length > 6 ? 3 : 2}
            onChange={(v) => patch({ [q.field as string]: v } as Partial<BikeDraft>)}
            allowCustom={q.field === "frameSize"}
          />
          {ai && <AiAssist ai={ai} onPick={(v) => patch({ [q.field as string]: v } as Partial<BikeDraft>)} />}
        </div>
      )}

      {/* Year */}
      {q.kind === "year" && (
        <div className="mt-5 space-y-3">
          <OptionPills
            value={draft.year}
            options={YEARS.slice(0, 9)}
            columns={3}
            onChange={(v) => patch({ year: v })}
          />
          {ai && <AiAssist ai={ai} onPick={(v) => patch({ year: v })} />}
        </div>
      )}

      {/* Colour */}
      {q.kind === "colour" && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {COLOUR_SWATCHES.map((c) => {
              const active = draft.colourPrimary === c.name;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => patch({ colourPrimary: c.name })}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      "h-12 w-12 rounded-full border transition-all",
                      active ? "ring-2 ring-gray-900 ring-offset-2" : "border-gray-200",
                    )}
                    style={{ backgroundColor: c.hex }}
                  />
                  <span className={cn("text-[11px]", active ? "font-semibold text-gray-900" : "text-gray-500")}>
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
          {ai && <AiAssist ai={ai} onPick={(v) => patch({ colourPrimary: v })} />}
        </div>
      )}

      {/* Condition */}
      {q.kind === "condition" && (
        <div className="mt-5 space-y-2">
          {CONDITION_RATINGS.map((c) => {
            const active = draft.condition === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => patch({ condition: c.value })}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md border px-3.5 py-3 text-left transition-all active:scale-[0.99]",
                  active ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300",
                )}
              >
                <div>
                  <p className="text-[15px] font-semibold text-gray-900">{c.value}</p>
                  <p className="text-[12px] text-gray-500">{c.blurb}</p>
                </div>
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full border",
                    active ? "border-gray-900" : "border-gray-300",
                  )}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BRAND }} />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Price */}
      {q.kind === "price" && (
        <div className="mt-5 space-y-4">
          <NumberInput value={draft.price} onChange={(v) => patch({ price: v })} big placeholder="0" />
          <PriceGuide onUse={(v) => patch({ price: v })} />
        </div>
      )}

      {/* Description */}
      {q.kind === "description" && (
        <div className="mt-5">
          <DescriptionField value={draft.description} onChange={(v) => patch({ description: v })} />
        </div>
      )}

      {/* Specs offer / editor */}
      {q.kind === "specsOffer" && (
        <div className="pt-3">
          {!specsOpen ? (
            <SpecsOffer />
          ) : (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSpecsOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <h2 className="text-[20px] font-bold text-gray-900">Full specifications</h2>
              </div>
              <DetailedSpecs
                bikeType={draft.bikeType}
                brand={draft.brand}
                model={draft.model}
                year={draft.year}
                frameSize={draft.frameSize}
                frameMaterial={draft.frameMaterial}
                groupset={draft.groupset}
                wheelSize={draft.wheelSize}
                title={draft.title}
                specs={draft.specs}
                onChange={(specs) => patch({ specs })}
              />
            </div>
          )}
        </div>
      )}

      {/* Delivery */}
      {q.kind === "delivery" && (
        <div className="mt-5">
          <DeliveryFields draft={draft} patch={patch} />
        </div>
      )}

      {/* Review */}
      {q.kind === "review" && <ReviewView draft={draft} onJump={onJump} />}
    </div>
  );
}

function Header({ question, helper }: { question: string; helper?: string }) {
  return (
    <div>
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900">{question}</h1>
      {helper && <p className="mt-2 text-[15px] leading-relaxed text-gray-500">{helper}</p>}
    </div>
  );
}

function AiAssist({
  ai,
  onPick,
}: {
  ai: { value: string; confidence: "high" | "medium" | "low"; alternatives?: string[] };
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-700">
        <Sparkles className="h-3.5 w-3.5 text-gray-500" />
        AI filled this
      </span>
      <ConfidenceDot c={ai.confidence} withLabel />
      {ai.alternatives && ai.alternatives.length > 0 && (
        <div className="ml-auto flex items-center gap-1.5">
          {ai.alternatives.map((alt) => (
            <button
              key={alt}
              type="button"
              onClick={() => onPick(alt)}
              className="rounded-md bg-gray-100 px-2 py-0.5 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
            >
              {alt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PriceGuide({ onUse }: { onUse: (v: number) => void }) {
  const pct = (PRICE_GUIDE.suggested - PRICE_GUIDE.low) / (PRICE_GUIDE.high - PRICE_GUIDE.low);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3.5">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-gray-500" />
        <p className="text-[13px] font-semibold text-gray-700">AI price guidance</p>
      </div>
      <p className="mt-1 text-[12px] text-gray-500">
        Based on {PRICE_GUIDE.sampleSize} similar sold listings
      </p>
      <div className="relative mt-3 h-1.5 rounded-full bg-gray-200">
        <div className="absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow" style={{ left: `${pct * 100}%`, backgroundColor: BRAND }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px] text-gray-500">
        <span>{formatAUD(PRICE_GUIDE.low)}</span>
        <span className="font-semibold text-gray-900">Sweet spot {formatAUD(PRICE_GUIDE.suggested)}</span>
        <span>{formatAUD(PRICE_GUIDE.high)}</span>
      </div>
      <button
        type="button"
        onClick={() => onUse(PRICE_GUIDE.suggested)}
        className="mt-3 w-full rounded-md border border-gray-200 py-2 text-[13px] font-semibold text-gray-800 hover:bg-gray-50"
      >
        Use suggested price
      </button>
    </div>
  );
}

function DescriptionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = React.useState(false);
  const regen = () => {
    setBusy(true);
    window.setTimeout(() => {
      onChange(AI_DESCRIPTION);
      setBusy(false);
    }, 1100);
  };
  return (
    <div className="space-y-2">
      <div className="relative">
        <TextArea value={value} onChange={onChange} rows={7} placeholder="Tell buyers about your bike…" />
        <button
          type="button"
          onClick={regen}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-200"
        >
          {busy ? <Spinner size={13} /> : <Wand2 className="h-3.5 w-3.5" />}
          {value ? "Rewrite" : "Write for me"}
        </button>
      </div>
      <p className="text-[12px] text-gray-400">AI draft from your photos and specs — edit freely.</p>
    </div>
  );
}

function SpecsOffer() {
  return (
    <div className="pt-3">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ backgroundColor: BRAND_SOFT }}>
        <ListChecks className="h-7 w-7 text-gray-800" />
      </div>
      <h1 className="mt-4 text-center text-[24px] font-bold leading-tight text-gray-900">
        Add full specifications?
      </h1>
      <p className="mx-auto mt-2 max-w-[320px] text-center text-[15px] leading-relaxed text-gray-500">
        Groupset, brakes, wheels, tyres and more — the same detail buyers see on top listings. We can
        fetch it from the manufacturer in one tap.
      </p>
      <div className="mt-5 space-y-2">
        {[
          "Buyers trust listings with complete specs",
          "Fewer back-and-forth questions",
          "Auto-filled by AI — review in seconds",
        ].map((t) => (
          <div key={t} className="flex items-center gap-2.5 rounded-md border border-gray-200 bg-white px-3 py-2.5">
            <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full" style={{ backgroundColor: BRAND }}>
              <Check className="h-3.5 w-3.5 text-gray-900" />
            </span>
            <span className="text-[14px] text-gray-700">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeliveryFields({ draft, patch }: { draft: BikeDraft; patch: (p: Partial<BikeDraft>) => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-gray-200 bg-white">
        <div className="flex items-center justify-between px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <Truck className="h-4.5 w-4.5 text-gray-500" />
            <div>
              <p className="text-[14px] font-medium text-gray-900">Shipping</p>
              <p className="text-[12px] text-gray-500">Post Australia-wide</p>
            </div>
          </div>
          <Toggle checked={draft.shippingAvailable} onChange={(v) => patch({ shippingAvailable: v })} />
        </div>
        <Collapsible open={draft.shippingAvailable}>
          <div className="border-t border-gray-100 px-3.5 py-3">
            <label className="mb-1.5 block text-[12px] font-medium text-gray-600">Postage cost (AUD)</label>
            <NumberInput value={draft.shippingCost} onChange={(v) => patch({ shippingCost: v })} />
          </div>
        </Collapsible>
      </div>
      <div className="rounded-md border border-gray-200 bg-white">
        <div className="flex items-center justify-between px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <MapPin className="h-4.5 w-4.5 text-gray-500" />
            <div>
              <p className="text-[14px] font-medium text-gray-900">Local pickup</p>
              <p className="text-[12px] text-gray-500">Buyer collects in person</p>
            </div>
          </div>
          <Toggle checked={draft.pickupAvailable} onChange={(v) => patch({ pickupAvailable: v })} />
        </div>
        <Collapsible open={draft.pickupAvailable}>
          <div className="border-t border-gray-100 px-3.5 py-3">
            <label className="mb-1.5 block text-[12px] font-medium text-gray-600">Pickup location</label>
            <TextInput value={draft.pickupLocation} onChange={(v) => patch({ pickupLocation: v })} placeholder="Suburb, State" />
          </div>
        </Collapsible>
      </div>
    </div>
  );
}

function ReviewView({ draft, onJump }: { draft: BikeDraft; onJump: (id: string) => void }) {
  const quality = scoreDraft(draft);
  const rows: { id: string; label: string; value: string }[] = [
    { id: "title", label: "Title", value: draft.title },
    { id: "bikeType", label: "Type", value: draft.bikeType },
    { id: "brand", label: "Brand", value: draft.brand },
    { id: "model", label: "Model", value: draft.model },
    { id: "frameSize", label: "Size", value: draft.frameSize },
    { id: "frameMaterial", label: "Material", value: draft.frameMaterial },
    { id: "colourPrimary", label: "Colour", value: draft.colourPrimary },
    { id: "condition", label: "Condition", value: draft.condition },
    { id: "price", label: "Price", value: draft.price ? formatAUD(draft.price) : "" },
  ];
  return (
    <div className="pt-1">
      <h1 className="text-[24px] font-bold text-gray-900">Review &amp; publish</h1>
      <p className="mt-1 text-[15px] text-gray-500">Tap anything to change it.</p>

      <QualityMeter score={quality.score} tips={quality.tips} />

      {draft.images.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {draft.images.map((u, i) => (
            <div key={i} className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white px-3.5">
        {rows.map((r) => (
          <button key={r.id} type="button" onClick={() => onJump(r.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
            <span className="text-[13px] text-gray-500">{r.label}</span>
            <span className="flex items-center gap-1.5">
              <span className={cn("text-[14px] font-medium", r.value ? "text-gray-900" : "text-rose-500")}>
                {r.value || "Add"}
              </span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md border border-gray-200 bg-white px-3.5 py-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4.5 w-4.5 text-gray-500" />
          <span className="text-[14px] font-medium text-gray-900">Full specifications</span>
        </div>
        <button type="button" onClick={() => onJump("specsOffer")} className="text-[13px] font-semibold text-gray-600 hover:text-gray-900">
          {quality.specCount > 0 ? `${quality.specCount} added · Edit` : "Add"}
        </button>
      </div>
    </div>
  );
}

export function QualityMeter({ score, tips }: { score: number; tips: string[] }) {
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-gray-700">Listing quality</p>
        <span className="text-[15px] font-bold text-gray-900">{score}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: BRAND }}
          initial={false}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: [0.04, 0.62, 0.23, 0.98] }}
        />
      </div>
      {tips.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {tips.slice(0, 3).map((t) => (
            <p key={t} className="flex items-center gap-1.5 text-[12px] text-gray-500">
              <Sparkles className="h-3 w-3 text-gray-400" />
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Analysing({ message, count }: { message: string; count: number }) {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full" style={{ backgroundColor: BRAND_SOFT }}>
        <Spinner size={34} />
      </div>
      <h2 className="mt-6 text-[20px] font-bold text-gray-900">Analysing {count} photos</h2>
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

function SuccessScreen({ draft }: { draft: BikeDraft }) {
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
        <h2 className="mt-6 text-[24px] font-bold text-gray-900">You&apos;re live!</h2>
        <p className="mt-1.5 text-[15px] text-gray-500">
          {draft.title || "Your bike"} · {formatAUD(draft.price)}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Btn full>View my listing</Btn>
          <Btn full variant="secondary">
            <RefreshCw className="h-4 w-4" />
            List another
          </Btn>
        </div>
      </div>
    </div>
  );
}

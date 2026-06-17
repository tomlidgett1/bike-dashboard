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
  FRAME_MATERIALS,
  WHEEL_SIZES,
  FRAME_SIZE_SUGGESTIONS,
  conditionRatingsForItemType,
  conditionSectionTitleForItemType,
  ITEM_TYPE_OPTIONS,
  COMMON_PART_TYPES,
  APPAREL_SIZES,
  COLOUR_SWATCHES,
  COMMON_GROUPSETS,
  YEARS,
  BRAND,
  emptyDraft,
  aiPrefilledDraft,
  formatAUD,
  scoreDraft,
  type BikeDraft,
  type AiField,
} from "./data";
import {
  Btn,
  Field,
  TextInput,
  TextArea,
  NumberInput,
  OptionPills,
  BikeTypePicker,
  Toggle,
  Collapsible,
  Chevron,
  ConfidenceDot,
  Spinner,
  ShimmerText,
  PhotoUploader,
  TitleOptionList,
  PublishedCoverImage,
} from "./ui";
import { DetailedSpecs } from "./detailed-specs";
import { QualityMeter } from "./quality-meter";
import { uploadPhotos, analysePhotos, analysisToDraftPatch, fetchListingFieldSuggestions, submitListing } from "./services";
import { AiRedoDialog } from "./ai-redo-dialog";
import { PriceResearchGuide } from "./price-research-guide";
import {
  saveSellerPickupLocation,
  withDefaultPickupLocation,
} from "@/lib/marketplace/seller-pickup-location";

type Phase = "start" | "analysing" | "form" | "published";

const ANALYSE_MSGS = [
  "Looking at your photos…",
  "Recognising the make & model…",
  "Reading the components…",
  "Pre-filling your form…",
];

export function FlowForm({
  initialDraft,
  autoAnalyseFromPhotos,
  onListAnother,
}: {
  initialDraft?: Partial<BikeDraft>;
  autoAnalyseFromPhotos?: boolean;
  onListAnother?: () => void;
}) {
  const [phase, setPhase] = React.useState<Phase>("start");
  const [draft, setDraft] = React.useState<BikeDraft>(() => withDefaultPickupLocation(emptyDraft()));
  const [msg, setMsg] = React.useState(0);
  const [specsOpen, setSpecsOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [redoOpen, setRedoOpen] = React.useState(false);
  const [redoing, setRedoing] = React.useState(false);
  const [redoError, setRedoError] = React.useState<string | null>(null);
  const [aiFields, setAiFields] = React.useState<Record<string, AiField>>({});

  const patch = (p: Partial<BikeDraft>) => {
    if (p.pickupLocation?.trim()) {
      saveSellerPickupLocation(p.pickupLocation);
    }
    setDraft((d) => ({ ...d, ...p }));
  };
  const quality = scoreDraft(draft);

  const resetForAnotherListing = () => {
    setDraft(withDefaultPickupLocation(emptyDraft()));
    setPhase("start");
    setMsg(0);
    setSpecsOpen(false);
    setUploading(false);
    setPublishing(false);
    setPublishError(null);
    setRedoOpen(false);
    setRedoing(false);
    setRedoError(null);
    setAiFields({});
    onListAnother?.();
  };

  React.useEffect(() => {
    if (!initialDraft) return;
    setDraft((d) => withDefaultPickupLocation({ ...d, ...initialDraft }));
    if (autoAnalyseFromPhotos && initialDraft.images?.length) {
      setPhase("analysing");
    } else {
      setPhase("form");
    }
  }, [initialDraft, autoAnalyseFromPhotos]);

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
        const fields = await fetchListingFieldSuggestions(analysis);
        if (fields.title?.value) patchData.title = fields.title.value;
        if (!cancelled) setAiFields(fields);
      } catch {
        const demo = aiPrefilledDraft();
        patchData = { ...demo, images: urls.length ? urls : demo.images, uploadedImages: draft.uploadedImages };
        if (!cancelled) setAiFields(AI_FIELDS);
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

  const handleRedoAi = async (hint: string) => {
    if (draft.images.length === 0) return;
    setRedoing(true);
    setRedoError(null);
    try {
      const urls = draft.images;
      const analysis = await analysePhotos(urls, {
        text: `The previous AI result was for the wrong product. The seller says this item is: ${hint}`,
        itemType: draft.itemType || undefined,
      });
      const patchData = analysisToDraftPatch(analysis, urls, draft.uploadedImages ?? []);
      const fields = await fetchListingFieldSuggestions(analysis);
      if (fields.title?.value) patchData.title = fields.title.value;
      setDraft((d) => ({ ...d, ...patchData }));
      setAiFields(fields);
      setRedoOpen(false);
    } catch (error) {
      setRedoError(error instanceof Error ? error.message : "Could not redo the AI details.");
    } finally {
      setRedoing(false);
    }
  };

  if (phase === "published") {
    return (
      <div className="grid min-h-full flex-1 place-items-center px-6 text-center md:px-8">
        <div>
          <PublishedCoverImage imageUrl={draft.images[0]} alt={draft.title} />
          <h2 className="mt-6 text-[24px] font-bold text-gray-900">Published!</h2>
          <p className="mt-1.5 text-[15px] text-gray-500">
            {draft.title || "Your bike"} · {formatAUD(draft.price)}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Btn full>View my listing</Btn>
            <Btn full variant="secondary" onClick={resetForAnotherListing}>
              <RefreshCw className="h-4 w-4" />
              List another
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "start" || phase === "analysing") {
    return (
      <div className="flex min-h-full flex-col px-4 pb-10 pt-6 md:px-6">
        {phase === "analysing" ? (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={msg}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  <ShimmerText className="text-[17px] font-semibold tracking-tight">
                    {ANALYSE_MSGS[msg]}
                  </ShimmerText>
                </motion.div>
              </AnimatePresence>
              <p className="mt-2 text-[13px] text-gray-400">Analysing your photos</p>
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
                  setDraft(withDefaultPickupLocation(emptyDraft()));
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
  const isBike = !draft.itemType || draft.itemType === "bike";
  const conditionOptions = conditionRatingsForItemType(draft.itemType);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-3 px-4 pb-4 pt-4 md:px-6">
        {/* AI summary banner */}
        {aiActive && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3.5 py-3">
            <p className="text-[15px] font-medium text-gray-900">Pre-filled from your photos</p>
            <button
              type="button"
              onClick={() => setRedoOpen(true)}
              className="flex-shrink-0 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
              Wrong product?
            </button>
          </div>
        )}

        {/* Photos */}
        <FormSection title="Photos" icon={Camera}>
          <PhotoUploader images={draft.images} onAdd={() => patch({ images: aiPrefilledDraft().images })} onFiles={handleFiles} uploading={uploading} onRemove={(i) => patch({ images: draft.images.filter((_, idx) => idx !== i) })} />
        </FormSection>

        {/* Basics */}
        <FormSection title="The basics" icon={Info}>
          <div className="space-y-3">
            <Field label="What are you selling?">
              <OptionPills
                value={ITEM_TYPE_OPTIONS.find((o) => o.value === (draft.itemType || "bike"))?.label ?? "Bike"}
                options={ITEM_TYPE_OPTIONS.map((o) => o.label)}
                columns={3}
                onChange={(label) => {
                  const match = ITEM_TYPE_OPTIONS.find((o) => o.label === label);
                  if (match) patch({ itemType: match.value });
                }}
              />
            </Field>
            <Field label="Title" hint={<ConfMark field="title" draft={draft} aiFields={aiFields} />}>
              {aiFields.title && (
                <div className="mb-3">
                  <TitleOptionList
                    options={[aiFields.title.value, ...(aiFields.title.alternatives ?? [])]}
                    selected={draft.title}
                    onPick={(v) => patch({ title: v })}
                  />
                </div>
              )}
              <TextInput
                value={draft.title}
                onChange={(v) => patch({ title: v })}
                placeholder={
                  isBike ? "e.g. Specialized Allez Sport 2021" : "e.g. Giro Helmet M / Shimano 105 groupset"
                }
              />
            </Field>
            {draft.itemType === "part" && (
              <Field label="Item type">
                <TextInput
                  value={draft.partType}
                  onChange={(v) => patch({ partType: v })}
                  placeholder="e.g. Helmet, wheelset, pump"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COMMON_PART_TYPES.slice(0, 6).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => patch({ partType: p })}
                      className="rounded-md bg-gray-100 px-2 py-1 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            {draft.itemType === "apparel" && (
              <Field label="Size">
                <OptionPills
                  value={draft.size}
                  options={[...APPAREL_SIZES]}
                  columns={3}
                  onChange={(v) => patch({ size: v })}
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand" hint={<ConfMark field="brand" draft={draft} aiFields={aiFields} />}>
                <TextInput value={draft.brand} onChange={(v) => patch({ brand: v })} placeholder="Brand" />
              </Field>
              <Field label="Model" hint={<ConfMark field="model" draft={draft} aiFields={aiFields} />}>
                <TextInput value={draft.model} onChange={(v) => patch({ model: v })} placeholder="Model" />
              </Field>
            </div>
            {isBike && (
              <>
                <Field label="Bike type" hint={<ConfMark field="bikeType" draft={draft} aiFields={aiFields} />}>
                  <BikeTypePicker
                    bikeType={draft.bikeType}
                    bikeSubtype={draft.bikeSubtype}
                    onChange={(next) => patch(next)}
                  />
                </Field>
                <Field label="Year">
                  <OptionPills value={draft.year} options={YEARS.slice(0, 6)} columns={3} onChange={(v) => patch({ year: v })} />
                </Field>
              </>
            )}
          </div>
        </FormSection>

        {/* Specifications */}
        {isBike && (
        <FormSection title="Specifications" icon={ListChecks}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Frame size" hint={<ConfMark field="frameSize" draft={draft} aiFields={aiFields} />}>
                <OptionPills value={draft.frameSize} options={FRAME_SIZE_SUGGESTIONS.slice(0, 5)} columns={3} onChange={(v) => patch({ frameSize: v })} allowCustom />
              </Field>
              <Field label="Wheel size">
                <OptionPills value={draft.wheelSize} options={WHEEL_SIZES.slice(0, 3)} columns={3} onChange={(v) => patch({ wheelSize: v })} />
              </Field>
            </div>
            <Field label="Frame material" hint={<ConfMark field="frameMaterial" draft={draft} aiFields={aiFields} />}>
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
            <Field label="Colour" hint={<ConfMark field="colourPrimary" draft={draft} aiFields={aiFields} />}>
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
        )}

        {!isBike && (
        <FormSection title="Details" icon={ListChecks}>
          <Field label="Colour" hint={<ConfMark field="colourPrimary" draft={draft} aiFields={aiFields} />}>
            <div className="flex flex-wrap gap-2">
              {COLOUR_SWATCHES.slice(0, 9).map((c) => {
                const active = draft.colourPrimary === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => patch({ colourPrimary: c.name })}
                    className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors"
                    style={active ? { borderColor: INK_BORDER } : { borderColor: "#e5e7eb" }}
                  >
                    <span className="h-4 w-4 rounded-full border border-gray-200" style={{ backgroundColor: c.hex }} />
                    <span className={cn("text-[12px]", active ? "font-semibold text-gray-900" : "text-gray-600")}>{c.name}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        </FormSection>
        )}

        {/* Condition */}
        <FormSection title={conditionSectionTitleForItemType(draft.itemType)} icon={Check}>
          <div className="grid grid-cols-2 gap-2">
            {conditionOptions.map((c) => {
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
            <PriceResearchGuide draft={draft} onUse={(v) => patch({ price: v })} compact />
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
      <div className="sticky bottom-0 z-20 mt-auto w-full border-t border-gray-100 bg-white/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:px-6">
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
      <AiRedoDialog
        open={redoOpen}
        isSubmitting={redoing}
        error={redoError}
        onClose={() => setRedoOpen(false)}
        onSubmit={handleRedoAi}
      />
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

function ConfMark({
  field,
  draft,
  aiFields,
}: {
  field: keyof BikeDraft;
  draft: BikeDraft;
  aiFields: Record<string, AiField>;
}) {
  const ai = aiFields[field as string];
  if (!ai || ai.confidence === "high") return null;
  const filledByAi = String(draft[field] ?? "").trim().length > 0;
  if (!filledByAi) return null;
  return <ConfidenceDot c={ai.confidence} withLabel />;
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

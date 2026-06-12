"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2,
  Eye,
  EyeOff,
  Frame,
  Cog,
  Disc3,
  CircleDot,
  Minus,
  Armchair,
  Zap,
  Plus,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SPEC_SECTIONS,
  BRAND_SOFT,
  type SpecValues,
  type SpecSection,
} from "./data";
import { Btn, Collapsible, Chevron, Spinner, InfoCard } from "./ui";
import { discoverSpecsPreview } from "./services";

const ICONS: Record<string, LucideIcon> = {
  Frame, Cog, Disc3, CircleDot, Minus, Armchair, Zap, Plus,
};

function visibleSections(bikeType: string): SpecSection[] {
  const isEbike = bikeType === "Electric";
  return SPEC_SECTIONS.filter((s) => (s.ebikeOnly ? isEbike : true));
}

function countFilled(section: SpecSection, specs: SpecValues): number {
  return section.fields.filter((f) => (specs[f.key] ?? "").trim().length > 0).length;
}

export function DetailedSpecs({
  bikeType,
  brand,
  model,
  year,
  frameSize,
  frameMaterial,
  groupset,
  wheelSize,
  title,
  specs,
  onChange,
  variant = "card",
}: {
  bikeType: string;
  brand: string;
  model: string;
  year?: string;
  frameSize?: string;
  frameMaterial?: string;
  groupset?: string;
  wheelSize?: string;
  title?: string;
  specs: SpecValues;
  onChange: (next: SpecValues) => void;
  variant?: "card" | "flat";
}) {
  const flat = variant === "flat";
  const sections = visibleSections(bikeType);
  const [open, setOpen] = React.useState<Record<string, boolean>>({ groupset: true });
  const [fetching, setFetching] = React.useState(false);
  const [autofilled, setAutofilled] = React.useState(false);
  const [autoError, setAutoError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState(false);

  const totalFields = sections.reduce((s, sec) => s + sec.fields.length, 0);
  const filledTotal = sections.reduce((s, sec) => s + countFilled(sec, specs), 0);

  const set = (key: string, value: string) => onChange({ ...specs, [key]: value });

  const applyValues = (values: SpecValues) => {
    const next = { ...specs };
    for (const sec of sections) {
      for (const f of sec.fields) {
        const v = values[f.key];
        if (v && !(specs[f.key] ?? "").trim()) next[f.key] = v;
      }
    }
    onChange(next);
    setAutofilled(true);
    const expanded: Record<string, boolean> = {};
    sections.forEach((sec) => (expanded[sec.id] = true));
    setOpen(expanded);
  };

  const autoFill = async () => {
    setFetching(true);
    setAutoError(null);
    try {
      const found = await discoverSpecsPreview({
        brand, model, year, bikeType, frameSize, frameMaterial, groupset, wheelSize, title,
      });
      if (Object.keys(found).length === 0) {
        throw new Error("No published specs found for this exact model.");
      }
      applyValues(found);
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : "Couldn't fetch specifications.");
    } finally {
      setFetching(false);
    }
  };

  const modelLabel = [brand, model].filter(Boolean).join(" ") || "your bike";

  const aiInner = !autofilled ? (
    <div>
      <div className="flex items-start gap-3">
        {!flat && (
          <div
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md"
            style={{ backgroundColor: BRAND_SOFT }}
          >
            <Wand2 className="h-5 w-5 text-gray-800" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-gray-900">
            Let AI fetch the full spec sheet
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">
            We&apos;ll look up the manufacturer specs for{" "}
            <span className="font-medium text-gray-700">{modelLabel}</span> and fill every
            component below. You can edit anything after.
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Btn full onClick={autoFill} disabled={fetching}>
          {fetching ? <Spinner size={18} /> : <Wand2 className="h-4 w-4" />}
          {fetching ? "Searching manufacturer specs…" : "Auto-fill with AI"}
        </Btn>
      </div>
    </div>
  ) : (
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-emerald-50">
        <BadgeCheck className="h-5 w-5 text-emerald-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-gray-900">
          Specs added from the manufacturer
        </p>
        <p className="mt-0.5 text-[13px] text-gray-500">
          Verified against the manufacturer&apos;s website. Review and tweak anything below — these
          aren&apos;t published yet.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* AI auto-fill — boxed card by default, borderless when flat */}
      {flat ? (
        <div className="border-b border-gray-100 pb-3">{aiInner}</div>
      ) : (
        <InfoCard tone="brand">{aiInner}</InfoCard>
      )}

      {autoError && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[12px] leading-relaxed text-gray-600">
            <span className="font-semibold text-gray-800">Couldn&apos;t auto-fill.</span> {autoError}{" "}
            You can still add the specs by hand below.
          </p>
        </div>
      )}

      {/* Progress + preview toggle */}
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[13px] font-medium text-gray-500">
          {filledTotal} of {totalFields} components added
        </p>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700 hover:text-gray-900"
        >
          {preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {preview ? "Hide buyer view" : "Preview buyer view"}
        </button>
      </div>

      {/* Buyer preview */}
      <AnimatePresence initial={false}>
        {preview && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <SpecsPreview bikeType={bikeType} specs={specs} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section accordions */}
      {sections.map((section) => {
        const Icon = ICONS[section.icon] ?? Plus;
        const filled = countFilled(section, specs);
        const isOpen = !!open[section.id];
        return (
          <div
            key={section.id}
            className={cn(
              flat
                ? "border-t border-gray-100"
                : "overflow-hidden rounded-md border border-gray-200 bg-white",
            )}
          >
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [section.id]: !o[section.id] }))}
              className={cn(
                "flex w-full items-center gap-3 text-left",
                flat ? "py-3" : "px-3.5 py-3",
              )}
            >
              {flat ? (
                <Icon className="h-4 w-4 flex-shrink-0 text-gray-500" />
              ) : (
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-gray-100">
                  <Icon className="h-4 w-4 text-gray-700" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-gray-900">{section.title}</p>
                {!flat && <p className="truncate text-[12px] text-gray-400">{section.blurb}</p>}
              </div>
              {filled > 0 && (
                <span
                  className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-gray-800"
                  style={{ backgroundColor: BRAND_SOFT }}
                >
                  {filled}/{section.fields.length}
                </span>
              )}
              <Chevron open={isOpen} />
            </button>
            <Collapsible open={isOpen}>
              <div
                className={cn(
                  "space-y-2.5",
                  flat ? "pb-3" : "border-t border-gray-100 px-3.5 pb-3.5 pt-3",
                )}
              >
                {section.fields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1 block text-[12px] font-medium text-gray-600">
                      {f.label}
                    </label>
                    <input
                      value={specs[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900"
                    />
                  </div>
                ))}
              </div>
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}

// Buyer-facing spec sheet preview (mirrors BikeSpecsDisplay label/value rows).
function SpecsPreview({ bikeType, specs }: { bikeType: string; specs: SpecValues }) {
  const sections = visibleSections(bikeType)
    .map((section) => ({
      title: section.title,
      rows: section.fields
        .filter((f) => (specs[f.key] ?? "").trim().length > 0)
        .map((f) => ({ label: f.label, value: specs[f.key] })),
    }))
    .filter((s) => s.rows.length > 0);

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-5 text-center">
        <p className="text-[13px] text-gray-400">
          Add components to see how your spec sheet will look to buyers.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        How buyers will see it
      </p>
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.title}>
            <p className="mb-1.5 text-[13px] font-bold text-gray-900">{s.title}</p>
            <div className="divide-y divide-gray-100">
              {s.rows.map((r) => (
                <div key={r.label} className="grid grid-cols-[110px_1fr] gap-3 py-1.5">
                  <span className="text-[12px] text-gray-500">{r.label}</span>
                  <span className="text-[12px] font-medium text-gray-900">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div
        className="mt-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
        style={{ backgroundColor: BRAND_SOFT }}
      >
        <Zap className="h-3.5 w-3.5 text-gray-700" />
        <span className="text-[11px] font-medium text-gray-700">
          Listings with full specs get more views and questions answered upfront.
        </span>
      </div>
    </div>
  );
}

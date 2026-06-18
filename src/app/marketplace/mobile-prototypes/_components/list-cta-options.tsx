"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, ChevronRight, Plus, Tag } from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";

// ============================================================
// "List item" CTA — redesign options (mobile)
// Brand: Yellow Jersey yellow (#ffde59) on near-black ink (#1c1c1e).
// All outer containers use rounded-md per project conventions.
// ============================================================

const BRAND = "#ffde59";
const INK = "#1c1c1e";

export interface CtaVariant {
  id: string;
  name: string;
  blurb: string;
  Comp: React.ComponentType;
}

// ── Current (for reference) ──────────────────────────────────
function CurrentCTA() {
  return (
    <button type="button" className="w-full text-left">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">Got gear to sell?</p>
          <p className="mt-0.5 text-xs text-gray-500">It only takes a few minutes.</p>
        </div>
        <div className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#ffde59] px-3 py-1.5 text-xs font-medium text-gray-900">
          <span>List now</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  );
}

// ── Option 1 — Spotlight (soft yellow glow + arrow) ──────────
function SpotlightCTA() {
  return (
    <button
      type="button"
      className="group relative w-full overflow-hidden rounded-md border border-gray-200 bg-white px-4 py-3.5 text-left transition-all active:scale-[0.99]"
    >
      {/* soft brand glow, top-right */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full opacity-60 blur-2xl transition-opacity group-hover:opacity-90"
        style={{ background: "radial-gradient(circle, #ffde59 0%, rgba(255,222,89,0) 70%)" }}
      />
      <div className="relative flex items-center gap-3.5">
        <span
          className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full shadow-sm"
          style={{ backgroundColor: BRAND }}
        >
          <Tag className="h-5 w-5" style={{ color: INK }} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight text-gray-900">Got gear to sell?</p>
          <p className="mt-0.5 text-[13px] text-gray-500">List it in 2 minutes — free.</p>
        </div>
        <span
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-white transition-transform group-hover:translate-x-0.5"
          style={{ backgroundColor: INK }}
        >
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
        </span>
      </div>
    </button>
  );
}

// ── Option 2 — Minimalist hairline (Apple-clean) ─────────────
function MinimalCTA() {
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-gray-300 active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md border border-gray-100 bg-gray-50">
        <Plus className="h-5 w-5 text-gray-700" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight text-gray-900">Sell your gear</p>
        <p className="mt-0.5 text-[13px] text-gray-500">Reach thousands of riders</p>
      </div>
      <span
        className="flex h-9 items-center whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-transform group-active:scale-95"
        style={{ backgroundColor: BRAND, color: INK }}
      >
        List
      </span>
    </button>
  );
}

// ── Option 3 — Dashed "add tile" (native to the grid) ────────
function DashedTileCTA() {
  return (
    <button
      type="button"
      className="group flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed border-gray-300 bg-gray-50/70 px-4 py-5 text-center transition-all hover:border-[#ffde59] hover:bg-white active:scale-[0.99]"
    >
      <span className="grid h-11 w-11 place-items-center rounded-full border border-gray-200 bg-white shadow-sm transition-colors group-hover:border-[#ffde59]">
        <Plus className="h-5 w-5 text-gray-800" strokeWidth={2.5} />
      </span>
      <span className="text-[15px] font-semibold leading-tight text-gray-900">List your gear</span>
      <span className="text-[13px] text-gray-500">Tap to create a listing</span>
    </button>
  );
}

// ── Option 4 — Dark premium (high contrast) ──────────────────
function DarkPremiumCTA() {
  return (
    <button
      type="button"
      className="group relative w-full overflow-hidden rounded-md px-4 py-3.5 text-left shadow-sm transition-all active:scale-[0.99]"
      style={{ backgroundColor: INK }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full opacity-25 blur-2xl"
        style={{ background: "radial-gradient(circle, #ffde59 0%, rgba(255,222,89,0) 70%)" }}
      />
      <div className="relative flex items-center gap-3.5">
        <span
          className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: BRAND }}
        >
          <Tag className="h-5 w-5" style={{ color: INK }} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight text-white">Got gear to sell?</p>
          <p className="mt-0.5 text-[13px] text-gray-400">Turn it into cash today</p>
        </div>
        <span
          className="flex h-9 items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-transform group-hover:translate-x-0.5"
          style={{ backgroundColor: BRAND, color: INK }}
        >
          List now
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
        </span>
      </div>
    </button>
  );
}

// ── Option 5 — Value + trust (conversion-led) ────────────────
function ValueCTA() {
  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="px-4 pb-3 pt-3.5">
        <p className="text-[15px] font-semibold leading-tight text-gray-900">
          Turn your gear into cash
        </p>
        <p className="mt-0.5 text-[13px] text-gray-500">Free to list · sells in ~5 days</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {["Free", "2 min setup", "12k+ sellers"].map((chip) => (
            <span
              key={chip}
              className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden text-[15px] font-semibold transition-all active:scale-[0.99]"
        style={{ backgroundColor: BRAND, color: INK }}
      >
        {/* subtle shimmer sweep */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
        <span className="relative">List an item</span>
        <ArrowRight className="relative h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export const LIST_CTA_VARIANTS: CtaVariant[] = [
  {
    id: "spotlight",
    name: "Option 1 · Spotlight",
    blurb: "Soft brand glow, circular icon badge and a tappable arrow. Warm but tidy.",
    Comp: SpotlightCTA,
  },
  {
    id: "minimal",
    name: "Option 2 · Minimal",
    blurb: "Apple-clean hairline row. Maximum whitespace, a single yellow pill.",
    Comp: MinimalCTA,
  },
  {
    id: "dashed",
    name: "Option 3 · Add tile",
    blurb: "Dashed placeholder that feels native to the product grid. Whole tile taps.",
    Comp: DashedTileCTA,
  },
  {
    id: "dark",
    name: "Option 4 · Dark premium",
    blurb: "High-contrast near-black card with a yellow accent. Feels premium.",
    Comp: DarkPremiumCTA,
  },
  {
    id: "value",
    name: "Option 5 · Value-led",
    blurb: "Benefit headline, trust chips and a full-width CTA with a shimmer. Converts.",
    Comp: ValueCTA,
  },
];

// Faux product tile to show the CTA in the real feed context
function FauxProductTile() {
  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200" />
      <div className="space-y-1.5 p-2">
        <div className="h-2.5 w-3/4 rounded bg-gray-200" />
        <div className="h-2.5 w-1/2 rounded bg-gray-100" />
      </div>
    </div>
  );
}

export function ListCtaShowcase() {
  return (
    <div className="space-y-5 bg-gray-50 px-3 py-4">
      {/* Current, for reference */}
      <div>
        <div className="mb-2 flex items-center gap-2 px-0.5">
          <span className="rounded-md bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
            Current
          </span>
          <span className="text-[12px] text-gray-400">what ships today</span>
        </div>
        <div className="opacity-90">
          <CurrentCTA />
        </div>
      </div>

      <div className="h-px bg-gray-200" />

      {/* New options, each shown in feed context */}
      {LIST_CTA_VARIANTS.map(({ id, name, blurb, Comp }, i) => (
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05, ease: [0.04, 0.62, 0.23, 0.98] }}
        >
          <div className="mb-2 px-0.5">
            <p className="text-[13px] font-semibold text-gray-900">{name}</p>
            <p className="text-[12px] leading-snug text-gray-500">{blurb}</p>
          </div>

          {/* mini feed context: two product tiles then the CTA full width */}
          <div className="grid grid-cols-2 gap-2">
            <FauxProductTile />
            <FauxProductTile />
            <div className="col-span-2">
              <Comp />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

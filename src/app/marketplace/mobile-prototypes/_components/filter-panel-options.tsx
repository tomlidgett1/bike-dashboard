"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  DollarSign,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Tag,
  User,
  X,
} from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";

// ============================================================
// Mobile filters panel — redesign options
// Brand: Yellow Jersey yellow (#ffde59) on near-black ink (#1c1c1e).
// Outer containers use rounded-md per project conventions.
// ============================================================

const BRAND = "#ffde59";
const INK = "#1c1c1e";

type Sort = "newest" | "oldest" | "price_asc" | "price_desc";
type Seller = "all" | "stores" | "individuals";
type Condition = "all" | "New" | "Like New" | "Excellent" | "Good" | "Fair" | "Well Used";

interface FilterState {
  sort: Sort;
  seller: Seller;
  condition: Condition;
  minPrice: string;
  maxPrice: string;
  brand: string;
}

const DEFAULTS: FilterState = {
  sort: "newest",
  seller: "all",
  condition: "all",
  minPrice: "",
  maxPrice: "",
  brand: "",
};

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
];

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "New", label: "New" },
  { value: "Like New", label: "Like New" },
  { value: "Excellent", label: "Excellent" },
  { value: "Good", label: "Good" },
  { value: "Fair", label: "Fair" },
  { value: "Well Used", label: "Well Used" },
];

const SELLERS: { value: Seller; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stores", label: "Stores" },
  { value: "individuals", label: "Private" },
];

const PRICE_PRESETS = [
  { label: "<$100", min: "", max: "100" },
  { label: "$100–500", min: "100", max: "500" },
  { label: "$500–1k", min: "500", max: "1000" },
  { label: "$1k–2.5k", min: "1000", max: "2500" },
  { label: "$2.5k+", min: "2500", max: "" },
];

function useFilters() {
  const [filters, setFilters] = React.useState<FilterState>(DEFAULTS);
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setFilters((p) => ({ ...p, [key]: value }));
  const reset = () => setFilters(DEFAULTS);
  const activeCount =
    (filters.sort !== "newest" ? 1 : 0) +
    (filters.seller !== "all" ? 1 : 0) +
    (filters.condition !== "all" ? 1 : 0) +
    (filters.minPrice || filters.maxPrice ? 1 : 0) +
    (filters.brand ? 1 : 0);
  return { filters, update, reset, activeCount };
}

function resultCount(f: FilterState) {
  let n = 248;
  if (f.condition !== "all") n = Math.round(n * 0.55);
  if (f.seller !== "all") n = Math.round(n * 0.62);
  if (f.minPrice) n = Math.round(n * 0.82);
  if (f.maxPrice) n = Math.round(n * 0.74);
  if (f.brand) n = Math.round(n * 0.4);
  return Math.max(n, 3);
}

function priceLabel(f: FilterState) {
  if (f.minPrice && f.maxPrice) return `$${f.minPrice}–$${f.maxPrice}`;
  if (f.minPrice) return `$${f.minPrice}+`;
  if (f.maxPrice) return `Up to $${f.maxPrice}`;
  return "Any price";
}

// ── Shared chrome ────────────────────────────────────────────
function PanelHeader({
  activeCount,
  subtitle,
}: {
  activeCount: number;
  subtitle?: string;
}) {
  return (
    <div className="flex-shrink-0 border-b border-gray-100 px-4 py-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          {activeCount > 0 && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-gray-900"
              style={{ backgroundColor: BRAND }}
            >
              {activeCount}
            </span>
          )}
        </div>
        <button
          type="button"
          className="-mr-2 rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close filters"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {subtitle && <p className="mt-0.5 text-[13px] text-gray-500">{subtitle}</p>}
    </div>
  );
}

function PanelFooter({
  count,
  onReset,
  disabledReset,
}: {
  count: number;
  onReset: () => void;
  disabledReset: boolean;
}) {
  return (
    <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onReset}
          disabled={disabledReset}
          className="flex h-12 items-center gap-1.5 rounded-md px-4 text-[14px] font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
        <button
          type="button"
          className="flex h-12 flex-1 items-center justify-center rounded-md text-[15px] font-semibold transition-all active:scale-[0.99]"
          style={{ backgroundColor: BRAND, color: INK }}
        >
          Show {count} results
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
      {children}
    </p>
  );
}

// ════════════════════════════════════════════════════════════
// Current (reference)
// ════════════════════════════════════════════════════════════
function CurrentPanel() {
  const { filters, update, reset, activeCount } = useFilters();
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-shrink-0 border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            {activeCount > 0 && (
              <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {activeCount}
              </span>
            )}
          </div>
          <button className="-mr-2 rounded-md p-2 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-between border-b border-gray-100 py-2">
          <span className="text-sm font-medium text-gray-700">Sort by</span>
          <select
            value={filters.sort}
            onChange={(e) => update("sort", e.target.value as Sort)}
            className="h-9 w-[160px] rounded-md border border-gray-200 px-2 text-sm"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-b border-gray-100 py-2">
          <span className="mb-2 block text-sm font-medium text-gray-700">Seller Type</span>
          <div className="flex gap-2">
            {SELLERS.map((o) => (
              <button
                key={o.value}
                onClick={() => update("seller", o.value)}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  filters.seller === o.value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-gray-100 py-2">
          <span className="mb-2 block text-sm font-medium text-gray-700">Price</span>
          <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
            {PRICE_PRESETS.map((p) => {
              const active = p.min === filters.minPrice && p.max === filters.maxPrice;
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    update("minPrice", p.min);
                    update("maxPrice", p.max);
                  }}
                  className={cn(
                    "flex-shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                    active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              value={filters.minPrice}
              onChange={(e) => update("minPrice", e.target.value)}
              className="h-9 flex-1 rounded-md border border-gray-200 px-2 text-sm"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.maxPrice}
              onChange={(e) => update("maxPrice", e.target.value)}
              className="h-9 flex-1 rounded-md border border-gray-200 px-2 text-sm"
            />
          </div>
        </div>

        <div className="py-2">
          <span className="mb-2 block text-sm font-medium text-gray-700">Condition</span>
          <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4">
            {CONDITIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => update("condition", o.value)}
                className={cn(
                  "flex-shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  filters.condition === o.value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="rounded-md px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Reset
          </button>
          <button className="flex-1 rounded-md bg-[#ffde59] px-4 py-3 text-sm font-semibold text-gray-900">
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Option A — Sectioned (segmented controls, hairlines, live count)
// ════════════════════════════════════════════════════════════
function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center rounded-md bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SectionedPanel() {
  const { filters, update, reset, activeCount } = useFilters();
  const count = resultCount(filters);

  return (
    <div className="flex h-full flex-col bg-white">
      <PanelHeader activeCount={activeCount} subtitle="Refine what you see" />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Sort */}
        <div>
          <SectionLabel>Sort by</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {SORT_OPTIONS.map((o) => {
              const active = filters.sort === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update("sort", o.value)}
                  className={cn(
                    "flex items-center justify-center rounded-md border px-3 py-2.5 text-[13px] font-medium transition-all",
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Seller */}
        <div>
          <SectionLabel>Seller</SectionLabel>
          <SegmentedRow
            options={SELLERS}
            value={filters.seller}
            onChange={(v) => update("seller", v)}
          />
        </div>

        <div className="h-px bg-gray-100" />

        {/* Price */}
        <div>
          <SectionLabel>Price</SectionLabel>
          <div className="mb-2.5 flex flex-wrap gap-2">
            {PRICE_PRESETS.map((p) => {
              const active = p.min === filters.minPrice && p.max === filters.maxPrice;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    update("minPrice", p.min);
                    update("maxPrice", p.max);
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-[13px] font-medium transition-all",
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">$</span>
              <input
                type="number"
                placeholder="Min"
                value={filters.minPrice}
                onChange={(e) => update("minPrice", e.target.value)}
                className="h-11 w-full rounded-md border border-gray-200 pl-6 pr-2 text-[14px] focus:border-gray-900 focus:outline-none"
              />
            </div>
            <span className="text-xs text-gray-400">to</span>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">$</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxPrice}
                onChange={(e) => update("maxPrice", e.target.value)}
                className="h-11 w-full rounded-md border border-gray-200 pl-6 pr-2 text-[14px] focus:border-gray-900 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Condition */}
        <div>
          <SectionLabel>Condition</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((o) => {
              const active = filters.condition === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update("condition", o.value)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-[13px] font-medium transition-all",
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Brand */}
        <div>
          <SectionLabel>Brand</SectionLabel>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search brands…"
              value={filters.brand}
              onChange={(e) => update("brand", e.target.value)}
              className="h-11 w-full rounded-md border border-gray-200 pl-9 pr-3 text-[14px] focus:border-gray-900 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <PanelFooter count={count} onReset={reset} disabledReset={activeCount === 0} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Option B — Accordion (collapsible sections with summaries)
// ════════════════════════════════════════════════════════════
function AccordionSection({
  icon: Icon,
  title,
  summary,
  defaultOpen,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(!!defaultOpen);
  return (
    <div className="overflow-hidden rounded-md border border-gray-100 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-gray-50">
          <Icon className="h-4 w-4 text-gray-600" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-gray-900">{title}</span>
          <span className="block truncate text-[12px] text-gray-500">{summary}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200",
            isOpen && "rotate-180",
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
            <div className="px-3.5 pb-3.5 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-[13px] font-medium transition-all",
        active
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
      )}
    >
      {children}
    </button>
  );
}

function AccordionPanel() {
  const { filters, update, reset, activeCount } = useFilters();
  const count = resultCount(filters);
  const sortLabel = SORT_OPTIONS.find((s) => s.value === filters.sort)?.label ?? "Newest";
  const sellerLabel = SELLERS.find((s) => s.value === filters.seller)?.label ?? "All";

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="bg-white">
        <PanelHeader activeCount={activeCount} />
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        <AccordionSection icon={ArrowUpDown} title="Sort by" summary={sortLabel} defaultOpen>
          <div className="space-y-1">
            {SORT_OPTIONS.map((o) => {
              const active = filters.sort === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update("sort", o.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-[14px] transition-colors",
                    active ? "bg-gray-50 font-semibold text-gray-900" : "text-gray-600 hover:bg-gray-50",
                  )}
                >
                  {o.label}
                  {active && <Check className="h-4 w-4 text-gray-900" />}
                </button>
              );
            })}
          </div>
        </AccordionSection>

        <AccordionSection icon={DollarSign} title="Price" summary={priceLabel(filters)}>
          <div className="mb-2.5 flex flex-wrap gap-2">
            {PRICE_PRESETS.map((p) => (
              <Chip
                key={p.label}
                active={p.min === filters.minPrice && p.max === filters.maxPrice}
                onClick={() => {
                  update("minPrice", p.min);
                  update("maxPrice", p.max);
                }}
              >
                {p.label}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min $"
              value={filters.minPrice}
              onChange={(e) => update("minPrice", e.target.value)}
              className="h-10 flex-1 rounded-md border border-gray-200 px-3 text-[14px] focus:border-gray-900 focus:outline-none"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="number"
              placeholder="Max $"
              value={filters.maxPrice}
              onChange={(e) => update("maxPrice", e.target.value)}
              className="h-10 flex-1 rounded-md border border-gray-200 px-3 text-[14px] focus:border-gray-900 focus:outline-none"
            />
          </div>
        </AccordionSection>

        <AccordionSection
          icon={Star}
          title="Condition"
          summary={filters.condition === "all" ? "Any condition" : filters.condition}
        >
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((o) => (
              <Chip
                key={o.value}
                active={filters.condition === o.value}
                onClick={() => update("condition", o.value)}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection icon={Store} title="Seller" summary={sellerLabel}>
          <SegmentedRow options={SELLERS} value={filters.seller} onChange={(v) => update("seller", v)} />
        </AccordionSection>

        <AccordionSection
          icon={Tag}
          title="Brand"
          summary={filters.brand ? filters.brand : "Any brand"}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search brands…"
              value={filters.brand}
              onChange={(e) => update("brand", e.target.value)}
              className="h-10 w-full rounded-md border border-gray-200 pl-9 pr-3 text-[14px] focus:border-gray-900 focus:outline-none"
            />
          </div>
        </AccordionSection>
      </div>

      <PanelFooter count={count} onReset={reset} disabledReset={activeCount === 0} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Option C — Quick filters (chips + dual sliders, low-typing)
// ════════════════════════════════════════════════════════════
const MAX_PRICE = 5000;

function PriceSlider({
  filters,
  update,
}: {
  filters: FilterState;
  update: <K extends keyof FilterState>(k: K, v: FilterState[K]) => void;
}) {
  const min = filters.minPrice === "" ? 0 : Math.min(Number(filters.minPrice), MAX_PRICE);
  const max = filters.maxPrice === "" ? MAX_PRICE : Math.min(Number(filters.maxPrice), MAX_PRICE);
  const leftPct = (min / MAX_PRICE) * 100;
  const rightPct = (max / MAX_PRICE) * 100;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-medium text-gray-500">Price range</span>
        <span className="text-[13px] font-semibold text-gray-900">
          ${min.toLocaleString()} – {max >= MAX_PRICE ? "$5,000+" : `$${max.toLocaleString()}`}
        </span>
      </div>

      {/* track */}
      <div className="relative h-7">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-gray-200" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%`, backgroundColor: INK }}
        />
        <input
          type="range"
          min={0}
          max={MAX_PRICE}
          step={50}
          value={min}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), max - 50);
            update("minPrice", v <= 0 ? "" : String(v));
          }}
          className="pointer-events-none absolute inset-0 h-7 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
        />
        <input
          type="range"
          min={0}
          max={MAX_PRICE}
          step={50}
          value={max}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), min + 50);
            update("maxPrice", v >= MAX_PRICE ? "" : String(v));
          }}
          className="pointer-events-none absolute inset-0 h-7 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
        />
      </div>
    </div>
  );
}

const QUICK_TOGGLES = [
  { id: "under500", label: "Under $500", apply: (u: ReturnType<typeof useFilters>["update"]) => { u("minPrice", ""); u("maxPrice", "500"); } },
  { id: "new", label: "New only", apply: (u: ReturnType<typeof useFilters>["update"]) => u("condition", "New") },
  { id: "stores", label: "Stores", apply: (u: ReturnType<typeof useFilters>["update"]) => u("seller", "stores") },
  { id: "cheapest", label: "Cheapest first", apply: (u: ReturnType<typeof useFilters>["update"]) => u("sort", "price_asc") },
];

function QuickPanel() {
  const { filters, update, reset, activeCount } = useFilters();
  const count = resultCount(filters);

  return (
    <div className="flex h-full flex-col bg-white">
      <PanelHeader activeCount={activeCount} subtitle="Tap to filter fast" />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Popular quick filters */}
        <div>
          <SectionLabel>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Popular
            </span>
          </SectionLabel>
          <div className="flex flex-wrap gap-2">
            {QUICK_TOGGLES.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => q.apply(update)}
                className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 transition-all hover:border-gray-900 active:scale-[0.97]"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Price slider */}
        <div className="rounded-md border border-gray-100 bg-gray-50/70 p-3.5">
          <PriceSlider filters={filters} update={update} />
        </div>

        {/* Sort — horizontal scroll pills */}
        <div>
          <SectionLabel>Sort</SectionLabel>
          <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4">
            {SORT_OPTIONS.map((o) => {
              const active = filters.sort === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update("sort", o.value)}
                  className={cn(
                    "flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-all",
                    active ? "text-gray-900 shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                  style={active ? { backgroundColor: BRAND } : undefined}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Condition — big pills */}
        <div>
          <SectionLabel>Condition</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((o) => {
              const active = filters.condition === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update("condition", o.value)}
                  className={cn(
                    "rounded-full px-4 py-2 text-[13px] font-medium transition-all active:scale-[0.97]",
                    active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Seller segmented */}
        <div>
          <SectionLabel>Seller</SectionLabel>
          <SegmentedRow options={SELLERS} value={filters.seller} onChange={(v) => update("seller", v)} />
        </div>
      </div>

      <PanelFooter count={count} onReset={reset} disabledReset={activeCount === 0} />
    </div>
  );
}

export interface FilterVariant {
  id: string;
  short: string;
  name: string;
  blurb: string;
  Comp: React.ComponentType;
}

export const FILTER_VARIANTS: FilterVariant[] = [
  {
    id: "current",
    short: "Current",
    name: "Current",
    blurb: "What ships today — a right-side sheet with mixed inline controls.",
    Comp: CurrentPanel,
  },
  {
    id: "sectioned",
    short: "A · Sectioned",
    name: "Option A · Sectioned",
    blurb:
      "Clean grouped sections, segmented controls and a live ‘Show N results’ button. Spacious and obvious.",
    Comp: SectionedPanel,
  },
  {
    id: "accordion",
    short: "B · Accordion",
    name: "Option B · Accordion",
    blurb:
      "Each filter collapses with a summary of its value. Scannable, compact, scales to many filters.",
    Comp: AccordionPanel,
  },
  {
    id: "quick",
    short: "C · Quick",
    name: "Option C · Quick filters",
    blurb:
      "Popular one-tap filters, a dual price slider and big pills. Built for thumbs, minimal typing.",
    Comp: QuickPanel,
  },
];

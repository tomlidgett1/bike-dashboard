"use client";

import * as React from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND, formatAUD, type BikeDraft } from "./data";
import { Spinner, ShimmerText } from "./ui";
import { fetchListingPricingResearch } from "./services";
import type { ListingPricingResearch } from "@/lib/ai/listing-pricing-schema";

// ============================================================
// AI pricing research — brand-new RRP + comparable listings
// shown on the sell flow price step.
// ============================================================

export interface PriceResearchGuideProps {
  draft: Pick<
    BikeDraft,
    | "title"
    | "brand"
    | "model"
    | "year"
    | "condition"
    | "itemType"
    | "bikeType"
    | "frameSize"
    | "groupset"
    | "partType"
  >;
  onUse: (price: number) => void;
  compact?: boolean;
}

function hasEnoughContext(draft: PriceResearchGuideProps["draft"]): boolean {
  return Boolean(
    draft.title?.trim() ||
      draft.brand?.trim() ||
      draft.model?.trim(),
  );
}

function researchKey(draft: PriceResearchGuideProps["draft"]): string {
  return [
    draft.title,
    draft.brand,
    draft.model,
    draft.year,
    draft.condition,
    draft.itemType,
    draft.bikeType,
    draft.frameSize,
    draft.groupset,
    draft.partType,
  ].join("|");
}

export function PriceResearchGuide({ draft, onUse, compact = false }: PriceResearchGuideProps) {
  const [research, setResearch] = React.useState<ListingPricingResearch | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastKeyRef = React.useRef<string | null>(null);

  const load = React.useCallback(async (force = false) => {
    if (!hasEnoughContext(draft)) return;
    const key = researchKey(draft);
    if (!force && lastKeyRef.current === key) return;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchListingPricingResearch({
        title: draft.title,
        brand: draft.brand,
        model: draft.model,
        year: draft.year,
        condition: draft.condition,
        itemType: draft.itemType,
        bikeType: draft.bikeType,
        frameSize: draft.frameSize,
        groupset: draft.groupset,
        partType: draft.partType,
      });
      lastKeyRef.current = key;
      setResearch(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load pricing research.");
      setResearch(null);
    } finally {
      setLoading(false);
    }
  }, [draft]);

  React.useEffect(() => {
    if (!hasEnoughContext(draft)) return;
    const key = researchKey(draft);
    if (lastKeyRef.current === key) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, load]);

  if (!hasEnoughContext(draft)) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-3.5">
        <p className="text-[13px] text-gray-500">
          Add a title, brand, or model and we&apos;ll look up brand-new pricing and similar listings.
        </p>
      </div>
    );
  }

  if (loading && !research) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-3.5">
        <div className="flex items-center gap-2">
          <Spinner size={14} />
          <ShimmerText className="text-[13px] font-medium text-gray-700">
            Searching the web for brand-new pricing…
          </ShimmerText>
        </div>
        <p className="mt-2 text-[12px] text-gray-400">
          Checking retailers and marketplaces in Australia
        </p>
      </div>
    );
  }

  if (error && !research) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-3.5">
        <p className="text-[13px] text-gray-600">{error}</p>
        <button
          type="button"
          onClick={() => void load(true)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  if (!research) return null;

  const { brandNew, usedMarket, comparableListings, summary } = research;
  const suggested = usedMarket.suggestedAud > 0 ? usedMarket.suggestedAud : null;
  const rangeValid = usedMarket.lowAud > 0 && usedMarket.highAud > usedMarket.lowAud;
  const pct =
    rangeValid && suggested
      ? (suggested - usedMarket.lowAud) / (usedMarket.highAud - usedMarket.lowAud)
      : 0.5;

  if (compact) {
    return (
      <div className="space-y-2">
        {brandNew.priceAud > 0 && (
          <div className="rounded-md border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Brand new</p>
            <p className="mt-0.5 text-[15px] font-semibold text-gray-900">
              {formatAUD(brandNew.priceAud)}
              <span className="ml-1.5 text-[12px] font-normal text-gray-500">
                {brandNew.priceLabel}
                {brandNew.retailerName ? ` · ${brandNew.retailerName}` : ""}
              </span>
            </p>
          </div>
        )}
        {suggested != null && (
          <button
            type="button"
            onClick={() => onUse(suggested)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left hover:bg-gray-50"
          >
            <span className="text-[13px] text-gray-700">
              Similar listings{" "}
              <span className="font-semibold text-gray-900">
                {rangeValid
                  ? `${formatAUD(usedMarket.lowAud)}–${formatAUD(usedMarket.highAud)}`
                  : formatAUD(suggested)}
              </span>
            </span>
            <span className="rounded-md bg-gray-100 px-2 py-1 text-[12px] font-semibold text-gray-800">
              Use {formatAUD(suggested)}
            </span>
          </button>
        )}
        {comparableListings.length > 0 && (
          <ComparableListings listings={comparableListings.slice(0, 3)} compact />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-gray-200 bg-white p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-gray-500" />
            <p className="text-[13px] font-medium text-gray-900">Pricing research</p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            aria-label="Refresh pricing research"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>

        {brandNew.priceAud > 0 ? (
          <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Brand new</p>
            <p className="mt-0.5 text-[20px] font-bold text-gray-900">{formatAUD(brandNew.priceAud)}</p>
            <p className="mt-0.5 text-[12px] text-gray-600">
              {brandNew.priceLabel}
              {brandNew.retailerName ? ` · ${brandNew.retailerName}` : ""}
              {brandNew.confidence !== "high" ? ` · ${brandNew.confidence} confidence` : ""}
            </p>
            {brandNew.notes && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">{brandNew.notes}</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-gray-500">
            Couldn&apos;t find a reliable brand-new price — check comparable listings below.
          </p>
        )}

        {summary && <p className="mt-2.5 text-[12px] leading-relaxed text-gray-600">{summary}</p>}
      </div>

      {rangeValid && suggested != null && (
        <div className="rounded-md border border-gray-200 bg-white p-3.5">
          <p className="text-[13px] font-medium text-gray-900">Suggested used price</p>
          <p className="mt-0.5 text-[12px] text-gray-500">{usedMarket.note}</p>
          <div className="relative mt-3 h-1.5 rounded-full bg-gray-200">
            <div
              className="absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${Math.min(100, Math.max(0, pct * 100))}%`, backgroundColor: BRAND }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[12px] text-gray-500">
            <span>{formatAUD(usedMarket.lowAud)}</span>
            <span className="font-semibold text-gray-900">Sweet spot {formatAUD(suggested)}</span>
            <span>{formatAUD(usedMarket.highAud)}</span>
          </div>
          <button
            type="button"
            onClick={() => onUse(suggested)}
            className="mt-3 w-full rounded-md border border-gray-200 py-2 text-[13px] font-semibold text-gray-800 hover:bg-gray-50"
          >
            Use suggested price
          </button>
        </div>
      )}

      {comparableListings.length > 0 && (
        <ComparableListings listings={comparableListings} />
      )}
    </div>
  );
}

function ComparableListings({
  listings,
  compact = false,
}: {
  listings: ListingPricingResearch["comparableListings"];
  compact?: boolean;
}) {
  return (
    <div className={cn("rounded-md border border-gray-200 bg-white", compact ? "px-3 py-2" : "p-3.5")}>
      {!compact && (
        <p className="text-[13px] font-medium text-gray-900">Comparable listings</p>
      )}
      <ul className={cn("space-y-2", !compact && "mt-2.5")}>
        {listings.map((listing) => (
          <li
            key={`${listing.sourceName}-${listing.title}-${listing.priceAud}`}
            className="flex items-start justify-between gap-2 rounded-md border border-gray-100 bg-white px-2.5 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-gray-900">{listing.title}</p>
              <p className="text-[11px] text-gray-500">
                {listing.sourceName}
                {listing.condition ? ` · ${listing.condition}` : ""}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <span className="text-[13px] font-semibold tabular-nums text-gray-900">
                {formatAUD(listing.priceAud)}
              </span>
              {listing.url && (
                <a
                  href={listing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label={`View listing on ${listing.sourceName}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

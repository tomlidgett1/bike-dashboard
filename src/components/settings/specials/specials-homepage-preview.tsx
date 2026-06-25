"use client";

import * as React from "react";
import { Box, AltArrowRight } from "@/components/layout/app-sidebar/dashboard-icons";
import type { SpecialsConfig, SpecialsCycleWithItems } from "@/lib/types/specials";
import { formatMoney } from "@/components/settings/specials/format";

/**
 * A faithful mini-render of how the specials carousel appears on the storefront
 * home page: a titled, horizontally scrolling row of product cards with sale
 * pricing. Mirrors the storefront card styling so owners can preview before it
 * goes live (requirement: "show what the carousel will look like").
 */
export function SpecialsHomepagePreview({
  config,
  cycle,
}: {
  config: SpecialsConfig;
  cycle: SpecialsCycleWithItems | null;
}) {
  const items = cycle?.items ?? [];

  if (!config.is_enabled) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Turn on specials in the Schedule tab to preview the storefront carousel.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No products in the current cycle yet — generate or add some to preview.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        This is how the carousel appears on your storefront home page right now.
      </p>

      {/* Storefront-like frame */}
      <div className="rounded-2xl border border-border bg-gradient-to-b from-gray-50 to-white p-4 sm:p-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="font-handwriting text-2xl font-bold tracking-tight text-gray-900">
              {config.carousel_title}
            </h3>
            {config.carousel_subtitle ? (
              <p className="text-sm text-gray-500">{config.carousel_subtitle}</p>
            ) : null}
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-500">
            View all <AltArrowRight size={14} />
          </span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {items.map((item) => (
            <div
              key={item.id}
              className="w-[160px] flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_2px_12px_rgba(17,17,17,0.05)]"
            >
              <div className="relative aspect-square bg-white">
                <span className="absolute left-2 top-2 z-10 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  -{Math.round(item.effective_discount_percent)}%
                </span>
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.display_name}
                    className="h-full w-full object-contain p-2"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Box size={22} className="text-gray-300" />
                  </div>
                )}
              </div>
              <div className="p-2.5">
                {item.brand ? (
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {item.brand}
                  </p>
                ) : null}
                <p className="line-clamp-2 min-h-[2.4em] text-xs font-medium leading-snug text-gray-900">
                  {item.display_name}
                </p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-red-600">
                    {formatMoney(item.effective_sale_price)}
                  </span>
                  <span className="text-xs text-gray-400 line-through">
                    {formatMoney(item.retail)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Reorder products on the Upcoming tab. Position this carousel among your other
        carousels on the{" "}
        <a href="/settings/store/carousels" className="underline hover:text-foreground">
          Carousels
        </a>{" "}
        page.
      </p>
    </div>
  );
}

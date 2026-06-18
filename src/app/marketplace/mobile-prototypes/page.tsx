"use client";

import * as React from "react";
import { LayoutList, SlidersHorizontal } from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";
import { ListCtaShowcase } from "./_components/list-cta-options";
import { FILTER_VARIANTS } from "./_components/filter-panel-options";

type Section = "cta" | "filters";

export default function MobilePrototypesPage() {
  const [section, setSection] = React.useState<Section>("cta");
  const [filterVariant, setFilterVariant] = React.useState<string>("sectioned");

  const activeFilter =
    FILTER_VARIANTS.find((v) => v.id === filterVariant) ?? FILTER_VARIANTS[1];
  const ActiveFilterComp = activeFilter.Comp;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col bg-white sm:border-x sm:border-gray-200">
      {/* Prototype chrome */}
      <div className="border-b border-gray-100 px-4 pb-3 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Prototype
        </p>
        <h1 className="text-[17px] font-bold text-gray-900">Mobile redesign</h1>

        {/* Main tab container — large tabs */}
        <div className="mt-3 flex w-fit items-center rounded-md bg-gray-100 p-0.5">
          <button
            type="button"
            onClick={() => setSection("cta")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              section === "cta"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <LayoutList size={15} />
            List CTA
          </button>
          <button
            type="button"
            onClick={() => setSection("filters")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              section === "filters"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <SlidersHorizontal size={15} />
            Filters panel
          </button>
        </div>

        <p className="mt-2.5 text-[13px] leading-relaxed text-gray-500">
          {section === "cta" ? (
            <>
              <span className="font-semibold text-gray-700">List item CTA.</span> Five
              redesigns of the “Got gear to sell?” button shown in the mobile feed.
            </>
          ) : (
            <>
              <span className="font-semibold text-gray-700">Filters panel.</span> Three
              redesigns of the mobile filters sheet. Tap around — they’re interactive.
            </>
          )}
        </p>
      </div>

      {/* Body */}
      {section === "cta" ? (
        <div className="flex-1">
          <ListCtaShowcase />
        </div>
      ) : (
        <div className="flex flex-1 flex-col bg-gray-50">
          {/* Sub-tabs — small tabs */}
          <div className="px-3 pt-3">
            <div className="scrollbar-hide flex w-full items-center gap-0.5 overflow-x-auto rounded-md bg-gray-100 p-0.5">
              {FILTER_VARIANTS.map((v) => {
                const isActive = v.id === filterVariant;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setFilterVariant(v.id)}
                    className={cn(
                      "flex flex-1 items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-white text-gray-800 shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70",
                    )}
                  >
                    {v.short}
                  </button>
                );
              })}
            </div>
            <p className="px-0.5 pb-2 pt-2 text-[12px] leading-snug text-gray-500">
              <span className="font-semibold text-gray-700">{activeFilter.name}.</span>{" "}
              {activeFilter.blurb}
            </p>
          </div>

          {/* Device screen — the panel fills a phone-height viewport */}
          <div className="px-3 pb-4">
            <div className="relative h-[640px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
              <ActiveFilterComp key={activeFilter.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

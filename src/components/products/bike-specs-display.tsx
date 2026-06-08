"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BikeIcon, getBikeSpecSectionIconName } from "@/components/ui/bike-icon";
import { hasBikeSpecs, parseBikeSpecs, type BikeSpecsData } from "@/lib/types/bike-specs";
import type { BikeSpecSelection } from "@/components/marketplace/bike-spec-explore-panel";
import { SpecSources, orderOfficialFirst } from "@/components/products/spec-sources";

interface BikeSpecsDisplayProps {
  bikeSpecs: BikeSpecsData | unknown | null | undefined;
  className?: string;
  variant?: "inline" | "fullWidth";
  interactive?: boolean;
  onSpecClick?: (spec: BikeSpecSelection) => void;
}

type SpecItem = { label: string; value: string };

function SpecRow({
  spec,
  sectionTitle,
  interactive,
  onSpecClick,
}: {
  spec: SpecItem;
  sectionTitle: string;
  interactive?: boolean;
  onSpecClick?: (spec: BikeSpecSelection) => void;
}) {
  const inner = (
    <>
      <span className="w-2/5 shrink-0 text-[13px] leading-snug text-gray-500">
        {spec.label}
      </span>
      <span
        className={cn(
          "flex-1 text-[13px] font-medium leading-snug text-gray-900",
          interactive && "group-hover:text-black"
        )}
      >
        {spec.value}
      </span>
    </>
  );

  if (!interactive || !onSpecClick) {
    return (
      <div className="flex items-baseline gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSpecClick({ label: spec.label, value: spec.value, sectionTitle })}
      className="group flex w-full items-baseline gap-3 border-b border-gray-100 py-2.5 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
    >
      {inner}
      <ChevronRight className="size-4 shrink-0 -translate-x-1 self-center text-gray-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:text-gray-500 group-hover:opacity-100" />
    </button>
  );
}

function SpecSection({
  title,
  specs,
  interactive,
  onSpecClick,
}: {
  title: string;
  specs: SpecItem[];
  interactive?: boolean;
  onSpecClick?: (spec: BikeSpecSelection) => void;
}) {
  return (
    <section className="mb-8 break-inside-avoid">
      <div className="mb-1 flex items-center gap-2 border-b border-gray-200 pb-2.5">
        <BikeIcon
          iconName={getBikeSpecSectionIconName(title)}
          size={16}
          className="size-4 shrink-0 opacity-70"
        />
        <h3 className="text-sm font-semibold tracking-tight text-gray-900">{title}</h3>
      </div>
      <div>
        {specs.map((spec, index) => (
          <SpecRow
            key={`${spec.label}-${index}`}
            spec={spec}
            sectionTitle={title}
            interactive={interactive}
            onSpecClick={onSpecClick}
          />
        ))}
      </div>
    </section>
  );
}

export function BikeSpecsDisplay({
  bikeSpecs,
  className,
  variant = "inline",
  interactive = false,
  onSpecClick,
}: BikeSpecsDisplayProps) {
  const parsed = React.useMemo(() => parseBikeSpecs(bikeSpecs), [bikeSpecs]);

  if (!hasBikeSpecs(parsed)) {
    return null;
  }

  const sections = parsed!.sections;
  const sources = parsed!.metadata?.sources ?? [];

  if (variant === "fullWidth") {
    return (
      <section className={cn("border-t border-gray-200 bg-white", className)}>
        <div className="mx-auto max-w-[1536px] px-4 py-10 sm:px-4 lg:px-4 xl:px-5">
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900">
              Specifications
            </h2>
            {interactive ? (
              <p className="text-sm text-gray-400">Tap any spec to explore the part</p>
            ) : null}
          </div>

          <div className="columns-1 gap-x-12 sm:columns-2 xl:columns-3">
            {sections.map((section) => (
              <SpecSection
                key={section.title}
                title={section.title}
                specs={section.specs}
                interactive={interactive}
                onSpecClick={onSpecClick}
              />
            ))}
          </div>

          {sources.length > 0 ? (
            <SpecSources
              sources={orderOfficialFirst(sources)}
              className="mt-8 border-t border-gray-200 pt-6"
            />
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className={cn("border-t border-gray-200 px-4 py-5 sm:px-5", className)}>
      <h2 className="mb-6 text-base font-semibold tracking-tight text-gray-900">
        Specifications
      </h2>
      <div className="columns-1 gap-x-10 sm:columns-2">
        {sections.map((section) => (
          <SpecSection
            key={section.title}
            title={section.title}
            specs={section.specs}
            interactive={interactive}
            onSpecClick={onSpecClick}
          />
        ))}
      </div>
    </div>
  );
}

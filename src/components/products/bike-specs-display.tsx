"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  BikeIcon,
  getBikeSpecLabelIconName,
} from "@/components/ui/bike-icon";
import {
  hasBikeSpecs,
  parseBikeSpecs,
  type BikeSpecsData,
} from "@/lib/types/bike-specs";
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

type FlatSpec = {
  spec: SpecItem;
  sectionTitle: string;
};

function flattenSpecs(sections: BikeSpecsData["sections"]): FlatSpec[] {
  return sections.flatMap((section) =>
    section.specs.map((spec) => ({
      spec,
      sectionTitle: section.title,
    }))
  );
}

function splitIntoColumns(items: FlatSpec[]): [FlatSpec[], FlatSpec[]] {
  const midpoint = Math.ceil(items.length / 2);
  return [items.slice(0, midpoint), items.slice(midpoint)];
}

function FocusSpecRow({
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
  const iconName = getBikeSpecLabelIconName(spec.label, sectionTitle);

  const content = (
    <>
      <BikeIcon
        iconName={iconName}
        size={22}
        className="mt-0.5 size-[22px] shrink-0 opacity-50"
      />
      <span className="text-[13px] font-bold uppercase leading-snug tracking-wide text-gray-900">
        {spec.label}
      </span>
      <span
        className={cn(
          "text-[13px] leading-relaxed text-gray-600",
          interactive && "group-hover:text-gray-900"
        )}
      >
        {spec.value}
      </span>
    </>
  );

  const rowClassName =
    "grid grid-cols-[1.375rem_minmax(8.5rem,10rem)_1fr] items-start gap-x-4 border-b border-gray-200/70 py-4 last:border-b-0 sm:gap-x-5";

  if (!interactive || !onSpecClick) {
    return <div className={rowClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() =>
        onSpecClick({ label: spec.label, value: spec.value, sectionTitle })
      }
      className={cn(
        rowClassName,
        "group text-left transition-colors hover:bg-gray-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
      )}
    >
      {content}
    </button>
  );
}

function FocusSpecColumn({
  items,
  interactive,
  onSpecClick,
}: {
  items: FlatSpec[];
  interactive?: boolean;
  onSpecClick?: (spec: BikeSpecSelection) => void;
}) {
  return (
    <div className="min-w-0">
      {items.map(({ spec, sectionTitle }, index) => (
        <FocusSpecRow
          key={`${sectionTitle}-${spec.label}-${index}`}
          spec={spec}
          sectionTitle={sectionTitle}
          interactive={interactive}
          onSpecClick={onSpecClick}
        />
      ))}
    </div>
  );
}

function SpecAnnotation({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none z-10 select-none text-[#ffde59]",
        className
      )}
      aria-hidden="true"
    >
      <div className="origin-top-right -rotate-[7deg] scale-[0.78] sm:scale-100">
        <span className="block whitespace-nowrap font-handwriting text-lg font-bold leading-none sm:text-[1.7rem]">
          Click me to learn more!
        </span>
        <svg
          viewBox="0 0 150 60"
          fill="none"
          className="ml-auto mr-2 mt-0.5 h-8 w-24 sm:mr-6 sm:h-10 sm:w-28"
        >
          <path
            d="M140 14 C 104 2, 44 4, 26 48"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M26 48 L 47 45 M26 48 L 34 27"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

function SpecDisclaimer({ hasWeightSpec }: { hasWeightSpec: boolean }) {
  return (
    <div className="mt-8 space-y-1 text-xs italic leading-relaxed text-gray-500">
      <p>
        * Subject to technical modification without notice. Errors and omissions
        excepted.
      </p>
      {hasWeightSpec ? (
        <p>
          ** Weight in size M, of standard specification and without pedals.
        </p>
      ) : null}
    </div>
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
  const flatSpecs = flattenSpecs(sections);
  const [leftColumn, rightColumn] = splitIntoColumns(flatSpecs);
  const hasWeightSpec = flatSpecs.some(({ spec }) =>
    spec.label.toLowerCase().includes("weight")
  );

  if (variant === "fullWidth") {
    return (
      <section className={cn("border-t border-gray-200 bg-white", className)}>
        <div className="relative mx-auto max-w-[1536px] px-4 py-10 sm:px-4 lg:px-4 xl:px-5">
          <h2 className="relative z-0 mb-6 text-xl font-semibold tracking-tight text-gray-900">
            Specifications
          </h2>

          {interactive ? (
            <SpecAnnotation className="absolute right-4 top-6 xl:right-5" />
          ) : null}

          <div className="grid grid-cols-1 gap-x-16 lg:grid-cols-2 xl:gap-x-24">
            <FocusSpecColumn
              items={leftColumn}
              interactive={interactive}
              onSpecClick={onSpecClick}
            />
            <FocusSpecColumn
              items={rightColumn}
              interactive={interactive}
              onSpecClick={onSpecClick}
            />
          </div>

          <SpecDisclaimer hasWeightSpec={hasWeightSpec} />

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
    <div className={cn("border-t border-gray-200 bg-white px-4 py-5 sm:px-5", className)}>
      <h2 className="mb-6 text-base font-semibold tracking-tight text-gray-900">
        Specifications
      </h2>
      <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        <FocusSpecColumn
          items={leftColumn}
          interactive={interactive}
          onSpecClick={onSpecClick}
        />
        <FocusSpecColumn
          items={rightColumn}
          interactive={interactive}
          onSpecClick={onSpecClick}
        />
      </div>
      <SpecDisclaimer hasWeightSpec={hasWeightSpec} />
    </div>
  );
}

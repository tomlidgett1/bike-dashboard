"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ProductVariantInfo, ProductVariantItemDisplay } from "@/lib/types/marketplace";

/**
 * Variant selector shown on the product page when a product belongs to a
 * variant group. Each option (Size, Colour, Frame Size…) renders its values;
 * selecting a value navigates to that variant's own product page so price,
 * stock, images and add-to-cart stay correct and SEO-friendly.
 */
export function VariantSelector({ variants }: { variants: ProductVariantInfo }) {
  const current = variants.items.find((i) => i.isCurrent) ?? variants.items[0];
  if (!current || variants.options.length === 0) return null;

  function targetFor(optionName: string, value: string): ProductVariantItemDisplay | null {
    const desired = { ...current.valueAssignments, [optionName]: value };
    const exact = variants.items.find((item) =>
      Object.entries(desired).every(([k, v]) => item.valueAssignments[k] === v),
    );
    return exact ?? null;
  }

  return (
    <div className="mt-4 space-y-3">
      {variants.options.map((option) => {
        if (option.values.length === 0) return null;
        return (
          <div key={option.name}>
            <p className="mb-1.5 text-xs font-medium text-gray-700">
              {option.name}
              {current.valueAssignments[option.name] && (
                <span className="ml-1.5 font-normal text-gray-500">{current.valueAssignments[option.name]}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const isCurrent = current.valueAssignments[option.name] === value;
                const target = targetFor(option.name, value);
                const unavailable = !!target && !target.isAvailable;

                if (!target || unavailable) {
                  return (
                    <span
                      key={value}
                      aria-disabled="true"
                      title={!target ? "This combination is unavailable" : "This option is out of stock"}
                      className="cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-300 line-through"
                    >
                      {value}
                      {unavailable && (
                        <span className="ml-1 text-[10px] uppercase tracking-wide text-gray-400">
                          out
                        </span>
                      )}
                    </span>
                  );
                }

                return (
                  <Link
                    key={value}
                    href={target.url}
                    aria-current={isCurrent ? "true" : undefined}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm transition-colors",
                      isCurrent
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-800 hover:border-gray-400",
                    )}
                  >
                    {value}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import * as React from "react";
import Image from "next/image";
import type { StoreBrand } from "@/lib/types/store";

interface StoreBrandsStripProps {
  brands: StoreBrand[];
}

export function StoreBrandsStrip({ brands }: StoreBrandsStripProps) {
  if (brands.length === 0) return null;

  return (
    <div className="bg-white border-b border-gray-100 py-4 sm:py-5">
      <div className="px-3 sm:px-6 lg:px-8">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
          Brands We Stock
        </p>
        <div className="relative">
          {/* Fade gradient at right on mobile */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none z-10 sm:hidden" />

          <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto pb-1 scrollbar-hide px-3 sm:px-0 snap-x snap-mandatory sm:snap-none">
            {brands.map((brand) => (
              <div
                key={brand.id}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 snap-start"
              >
                <div className="h-10 w-20 sm:h-12 sm:w-24 relative flex items-center justify-center">
                  {brand.logo_url ? (
                    <Image
                      src={brand.logo_url}
                      alt={brand.name}
                      fill
                      className="object-contain"
                      sizes="96px"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-gray-500 text-center leading-tight">
                      {brand.name}
                    </span>
                  )}
                </div>
                {brand.logo_url && (
                  <span className="text-xs text-gray-400 font-medium">{brand.name}</span>
                )}
              </div>
            ))}
            {/* Spacer for mobile scroll end */}
            <div className="w-3 flex-shrink-0 sm:hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}

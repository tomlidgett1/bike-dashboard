"use client";

import * as React from "react";
import type { StoreBrand } from "@/lib/types/store";

/**
 * Infinite logo marquee for the brands a store stocks — the classic
 * "trusted by" client-logo carousel. Pure CSS animation (keyframes in
 * globals.css), pauses on hover, disabled under prefers-reduced-motion.
 *
 * Structure: one flex track holding two identical sequences side by side.
 * The animation translates by exactly -50% (one sequence), so the second
 * sequence slides into the first's place with no gap at the loop point.
 */
export function StoreBrandMarquee({ brands }: { brands: StoreBrand[] }) {
  const items = React.useMemo(
    () =>
      brands
        .filter((b) => b.is_active && b.logo_url)
        .sort((a, b) => a.display_order - b.display_order),
    [brands],
  );

  if (items.length < 2) return null;

  // Tile until a single sequence is long enough that one half of the track
  // always outspans the viewport — otherwise -50% reveals empty space.
  const minItems = 16;
  const repeats = Math.max(2, Math.ceil(minItems / items.length));
  const sequence: StoreBrand[] = Array.from({ length: repeats }, () => items).flat();
  // ~3s per logo keeps the scroll calm; floor so short lists aren't frantic
  const durationSeconds = Math.max(28, sequence.length * 2.8);

  return (
    <section
      aria-label="Brands stocked by this store"
      className="border-b border-gray-200 bg-white py-5 sm:py-6"
      data-store-analytics-section="home:brands"
      data-store-analytics-label="Brand marquee"
    >
      <p className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400 sm:text-[11px]">
        Brands we stock
      </p>
      <div className="store-brand-marquee relative mt-3 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)] sm:mt-4">
        <div
          className="store-brand-marquee-track flex w-max items-center"
          style={
            {
              "--store-brand-marquee-duration": `${durationSeconds}s`,
            } as React.CSSProperties
          }
        >
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1}
              className="m-0 flex list-none items-center p-0"
            >
              {sequence.map((brand, index) => (
                <li
                  key={`${copy}-${brand.id}-${index}`}
                  className="mx-5 flex h-10 w-24 flex-shrink-0 items-center justify-center sm:mx-8 sm:h-11 sm:w-28"
                  title={brand.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- external logo URLs of unknown origin */}
                  <img
                    src={brand.logo_url!}
                    alt={copy === 0 ? brand.name : ""}
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    className="max-h-8 max-w-full object-contain opacity-55 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 sm:max-h-9"
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

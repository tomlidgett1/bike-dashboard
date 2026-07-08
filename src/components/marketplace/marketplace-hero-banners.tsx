"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketplaceSpace } from "@/lib/types/marketplace";
import { DEFAULT_MARKETPLACE_SPACE } from "@/components/marketplace/space-navigator";

// ============================================================
// Marketplace Hero Banners (desktop)
// A single slim row of editorial banner cards above the browse
// grid. Photography-led with left-anchored copy, kept compact so
// products stay above the fold. Desktop-only.
// ============================================================

const UNSPLASH = "https://images.unsplash.com";

/** Spaces where these banners appear — never For You (default). */
type BannerSpace = Extract<MarketplaceSpace, "marketplace" | "stores">;

interface HeroBanner {
  key: string;
  /** Search query applied within the current space, if any */
  search?: string;
  /** Force a specific space (e.g. Store Specials always opens Bike Stores) */
  forceSpace?: BannerSpace;
  image: string;
  imageAlt: string;
  kicker: string;
  title: string;
  cta: string;
  /** Image focal point, since cards are short and wide */
  objectPosition?: string;
}

const BANNERS: HeroBanner[] = [
  {
    key: "gravel",
    search: "gravel",
    image: `${UNSPLASH}/photo-1511994298241-608e28f14fde?auto=format&fit=crop&w=800&q=75`,
    imageAlt: "Loaded gravel bike at sunset",
    kicker: "The Gravel Edit",
    title: "Explore gravel",
    cta: "Shop the edit",
    objectPosition: "center 28%",
  },
  {
    key: "specials",
    forceSpace: "stores",
    image: `${UNSPLASH}/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=75`,
    imageAlt: "Silver single-speed bike against a dark wall",
    kicker: "Store Specials",
    title: "Up to 50% off",
    cta: "Shop specials",
    objectPosition: "center 55%",
  },
  {
    key: "road",
    search: "road",
    image: `${UNSPLASH}/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=800&q=75`,
    imageAlt: "Road cyclists riding in a bunch",
    kicker: "Road",
    title: "Built for the bunch",
    cta: "Shop road",
    objectPosition: "center 30%",
  },
  {
    key: "mtb",
    search: "mtb",
    image: `${UNSPLASH}/photo-1544191696-102dbdaeeaa0?auto=format&fit=crop&w=800&q=75`,
    imageAlt: "Mountain biker riding through a creek",
    kicker: "Mountain",
    title: "Trail ready",
    cta: "Shop MTB",
    objectPosition: "center 35%",
  },
];

function buildBannerHref(banner: HeroBanner, currentSpace: BannerSpace): string {
  const space = banner.forceSpace ?? currentSpace;
  const params = new URLSearchParams();
  // Always set space — omitting it falls back to For You
  if (space !== DEFAULT_MARKETPLACE_SPACE) {
    params.set("space", space);
  }
  if (banner.search) {
    params.set("search", banner.search);
  }
  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

export function MarketplaceHeroBanners({
  className,
  space = "marketplace",
}: {
  className?: string;
  /** Active marketplace tab so banner links stay on that tab */
  space?: BannerSpace;
}) {
  return (
    <div
      className={cn(
        "hidden sm:grid grid-cols-2 xl:grid-cols-4 gap-2.5",
        className
      )}
    >
      {BANNERS.map((banner) => (
        <Link
          key={banner.key}
          href={buildBannerHref(banner, space)}
          className="group relative h-[104px] overflow-hidden rounded-md"
        >
          <Image
            src={banner.image}
            alt={banner.imageAlt}
            fill
            sizes="(min-width: 1280px) 25vw, 50vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
            style={
              banner.objectPosition
                ? { objectPosition: banner.objectPosition }
                : undefined
            }
          />
          {/* Left-anchored scrim keeps copy legible without darkening the whole photo */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />

          <div className="relative z-[1] flex h-full flex-col justify-center px-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
              {banner.kicker}
            </p>
            <h3 className="mt-0.5 text-[17px] font-bold leading-tight tracking-tight text-white">
              {banner.title}
            </h3>
            <span className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-white/80 transition-colors group-hover:text-white">
              {banner.cta}
              <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

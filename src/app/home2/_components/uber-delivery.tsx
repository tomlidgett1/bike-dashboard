"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { ArrowRight, Clock, MapPin, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { NoiseTexture } from "@/components/ui/noise-texture";
import { STORE_UBER_ELIGIBLE, type StoreProduct } from "./store-products";

const BENTO_CTA_LINK = "text-[#b07b00] transition-colors hover:text-[#8a6000]";

function rotateProducts(products: StoreProduct[], offset: number): StoreProduct[] {
  if (products.length === 0) return products;
  const n = offset % products.length;
  return [...products.slice(n), ...products.slice(0, n)];
}

const UBER_ROWS: { products: StoreProduct[]; direction: "left" | "right"; duration: number }[] = [
  {
    products: STORE_UBER_ELIGIBLE,
    direction: "left",
    duration: 120,
  },
  {
    products: rotateProducts(STORE_UBER_ELIGIBLE, 4),
    direction: "right",
    duration: 140,
  },
  {
    products: rotateProducts(STORE_UBER_ELIGIBLE, 8),
    direction: "left",
    duration: 130,
  },
];

function UberDeliveryBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-gray-900 px-1.5 py-0.5">
      <Image
        src="/uberwhite.png"
        alt="Uber"
        width={22}
        height={8}
        className="object-contain"
        unoptimized
      />
      <span className="text-[9px] font-semibold leading-none text-green-500">1hr</span>
    </span>
  );
}

function MarqueeProductTile({ product }: { product: StoreProduct }) {
  return (
    <div className="w-[92px] shrink-0 sm:w-[100px]">
      <div className="relative h-[92px] w-full overflow-hidden rounded-md bg-zinc-100 ring-1 ring-black/[0.06] sm:h-[100px]">
        <Image
          src={product.img}
          alt={product.title}
          fill
          unoptimized
          className="object-cover"
          sizes="100px"
        />
        <div className="absolute left-1.5 top-1.5">
          <UberDeliveryBadge />
        </div>
      </div>
      <div className="mt-1">
        <p className="line-clamp-2 text-[10px] font-medium leading-tight text-zinc-900 sm:text-[11px]">
          {product.title}
        </p>
        <p className="mt-0.5 text-[10px] font-bold leading-none text-zinc-900 sm:text-[11px]">{product.price}</p>
      </div>
    </div>
  );
}

/** Repeat products until the half-track is long enough, then duplicate for a seamless -50% loop. */
function buildSeamlessTrack(products: StoreProduct[], minHalfItems = 12): StoreProduct[] {
  if (products.length === 0) return [];
  const half: StoreProduct[] = [];
  while (half.length < minHalfItems) {
    half.push(...products);
  }
  return [...half, ...half];
}

function ProductMarqueeRow({
  products,
  direction,
  duration,
  reduced,
}: {
  products: StoreProduct[];
  direction: "left" | "right";
  duration: number;
  reduced: boolean;
}) {
  const track = React.useMemo(() => buildSeamlessTrack(products), [products]);

  return (
    <div className="relative overflow-x-hidden overflow-y-visible [mask-image:linear-gradient(90deg,transparent,black_5%,black_95%,transparent)]">
      <div
        className={cn(
          "flex w-max gap-3",
          !reduced && direction === "left" && "home2-uber-marquee-left",
          !reduced && direction === "right" && "home2-uber-marquee-right",
        )}
        style={reduced ? undefined : { animationDuration: `${duration}s` }}
      >
        {track.map((product, index) => (
          <MarqueeProductTile key={`${product.title}-${index}`} product={product} />
        ))}
      </div>
    </div>
  );
}

export function UberBentoVisual() {
  const reduced = useReducedMotion() ?? false;

  return (
    <div className="relative w-full overflow-hidden rounded-[18px] bg-[#d9d2c5] p-4 sm:p-6">
      <NoiseTexture />
      <div className="relative z-10">
        <div className="flex h-[568px] flex-col overflow-hidden rounded-[14px] border border-black/[0.06] bg-white shadow-sm sm:h-[628px]">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-3.5">
            <p className="text-[13px] font-medium text-zinc-900">Eligible for local delivery</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Clock className="h-3.5 w-3.5" />
              ~60 min
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-visible bg-[#fafafa] px-1 py-4 sm:gap-3.5 sm:py-5">
            {UBER_ROWS.map((row, index) => (
              <ProductMarqueeRow
                key={index}
                products={row.products}
                direction={row.direction}
                duration={row.duration}
                reduced={reduced}
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-zinc-100 px-5 py-3 text-[11px] text-zinc-400">
            Powered by
            <Image src="/uber.svg" alt="Uber" width={40} height={14} className="h-3.5 w-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function UberDeliveryBento() {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-black/[0.07] bg-[#f2f1ee]">
      <div className="grid items-center gap-8 p-7 lg:grid-cols-[1fr_minmax(0,360px)] lg:gap-10">
        <div className="order-2 min-w-0 lg:order-1">
          <UberBentoVisual />
        </div>
        <div className="order-1 max-w-[360px] lg:order-2 lg:ml-auto">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-zinc-950 px-2.5 py-1.5">
            <Image src="/uberwhite.png" alt="Uber" width={36} height={13} className="h-3 w-auto" unoptimized />
            <span className="text-[11px] font-semibold text-white">Direct</span>
          </span>
          <h3 className="mt-4 text-2xl font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
            One-hour local delivery.
          </h3>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
            Eligible items are delivered by Uber in as little as 60 minutes, straight from your shelf to their
            door. Powered by Uber Direct, with live tracking and in-stock-only listings.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-zinc-600">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-zinc-400" /> ~60 minutes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-zinc-400" /> Live tracking
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Package className="h-4 w-4 text-zinc-400" /> In-stock only
            </span>
          </div>
          <Link
            href="/settings/uber"
            className={cn("group mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-medium", BENTO_CTA_LINK)}
          >
            Set up Uber Direct
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

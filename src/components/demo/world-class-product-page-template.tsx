"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Lock,
  MessageCircle,
  Play,
  Share2,
  ShieldCheck,
  Store,
  Truck,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { BikeIcon, getBikeSpecLabelIconName } from "@/components/ui/bike-icon";
import { BlurText } from "@/components/ui/react-bits/blur-text";
import { FadeContent } from "@/components/ui/react-bits/fade-content";
import { Magnet } from "@/components/ui/react-bits/magnet";
import { MagicalProductAsk } from "@/components/demo/magical-product-ask";
import { ProductBreadcrumbs } from "@/components/marketplace/product-breadcrumbs";
import { cn } from "@/lib/utils";
import type {
  WorldClassKeyStat,
  WorldClassProductKind,
  WorldClassProductPage,
  WorldClassSpecSection,
  WorldClassVideo,
} from "@/lib/demo/world-class-product-page-types";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

function resolveProductKind(page: WorldClassProductPage): WorldClassProductKind {
  return page.productKind === "non_bike" ? "non_bike" : "bike";
}

/** Category line under the product title: bike type or accessory category. */
function productMetaLine(page: WorldClassProductPage): string[] {
  const category =
    resolveProductKind(page) === "non_bike"
      ? page.productCategory
      : page.bikeType;
  return [page.brand, page.modelYear, category].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
}

export type TemplateViewMode = "desktop" | "mobile";

export type WorldClassSellerInfo = {
  name: string;
  logoUrl?: string | null;
  location?: string | null;
  verified?: boolean;
};

type Props = {
  page: WorldClassProductPage;
  viewMode?: TemplateViewMode;
  className?: string;
  /** Live marketplace taxonomy, same as the standard PDP breadcrumbs. */
  level1?: string | null;
  level2?: string | null;
  level3?: string | null;
  /** Selling store (name + logo). Falls back to demo seller in previews. */
  seller?: WorldClassSellerInfo | null;
  /** Live listing price in AUD (marketplace product). Preferred over keyStats RRP. */
  listingPrice?: number | null;
  /** Live catalogue product — enables Genie ask with full listing context. */
  product?: MarketplaceProduct | null;
  /** Show the mid-page magical Ask Genie bar. Defaults to true. */
  showAskGenie?: boolean;
};

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const DEMO_SELLER = {
  name: "Yellow Jersey Cycles",
  suburb: "Fitzroy, VIC",
  rating: "4.9",
};

function findPriceStat(stats: WorldClassKeyStat[]): WorldClassKeyStat | null {
  const stat =
    stats.find((s) => /price|rrp|msrp/i.test(s.label)) ??
    stats.find((s) => /^\s*(AU?\$|\$|USD?|AUD)/.test(s.value)) ??
    null;
  if (!stat) return null;
  // Research sometimes returns a multi-currency sentence — reduce it to one
  // clean figure, preferring the AUD amount.
  const aud = stat.value.match(/A(?:UD)?\s?\$?\s?([\d,]+(?:\.\d{2})?)/i);
  if (aud?.[1]) return { label: "RRP (AU)", value: `A$${aud[1]}` };
  const other = stat.value.match(/(?:US\$|USD\s?|\$)\s?([\d,]+(?:\.\d{2})?)/);
  if (other?.[1]) return { label: stat.label, value: `US$${other[1]}` };
  return stat.value.length <= 20 ? stat : null;
}

function formatListingPrice(value: number): string {
  return `$${value.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Prefer the live listing price; fall back to research keyStats RRP. */
function resolveDisplayPrice(
  page: WorldClassProductPage,
  listingPrice?: number | null,
): WorldClassKeyStat | null {
  if (typeof listingPrice === "number" && Number.isFinite(listingPrice) && listingPrice > 0) {
    return { label: "Price", value: formatListingPrice(listingPrice) };
  }
  return findPriceStat(page.keyStats);
}

function flattenSpecs(sections: WorldClassSpecSection[]) {
  return sections.flatMap((section) =>
    section.specs.map((spec) => ({ spec, sectionTitle: section.title })),
  );
}

/**
 * Content-aware icon matching for editorial copy (value props, insights).
 * Ordered specific → general so "carbon wheelset" wins the wheel icon,
 * not the generic frame icon. Returns null when nothing meaningful matches.
 */
const EDITORIAL_ICON_RULES: Array<{ pattern: RegExp; icon: string }> = [
  { pattern: /wheel|rim\b|aeolus|zipp|roval|hollowgram|dt swiss|reserve\b/i, icon: "noun-bike-wheels-6991373.svg" },
  { pattern: /tyre|tire|tubeless|clearance/i, icon: "noun-bike-tire-6991392.svg" },
  { pattern: /\bmotor\b|drive unit|bosch|mahle|assist\b/i, icon: "noun-e-bike-motor-6991340.svg" },
  { pattern: /battery|watt.?hour|\b\d+\s?wh\b|range extender/i, icon: "noun-e-bike-battery-6991320.svg" },
  { pattern: /brake|rotor|stopping/i, icon: "noun-bike-brake-6991377.svg" },
  { pattern: /crank|chainring|power meter/i, icon: "noun-chainring-6991385.svg" },
  { pattern: /cassette|derailleur/i, icon: "noun-bike-cassette-6991390.svg" },
  {
    pattern: /di2|axs\b|etap|\beps\b|shift|drivetrain|groupset|ultegra|dura.?ace|\b105\b|grx|apex|rival\b|force\b|\bred\b|xtr?\b|deore|eagle|\d{1,2}.?speed/i,
    icon: "noun-shifter-6991383.svg",
  },
  { pattern: /suspension|\bfork\b|travel\b|shock|damper|rockshox|\bfox\b/i, icon: "noun-bike-shock-absorber-6991333.svg" },
  { pattern: /cockpit|handlebar|\bbars?\b|\bstem\b|integrat/i, icon: "noun-drop-bar-6991318.svg" },
  { pattern: /saddle|seatpost|isoflow|compliance|comfort|vibration/i, icon: "noun-bike-saddle-6991388.svg" },
  { pattern: /handling|steering|descend|cornering/i, icon: "noun-drop-bar-6991318.svg" },
  { pattern: /weight|\bkg\b|\bgrams?\b|light(est|weight)?\b/i, icon: "noun-bike-stand-6991329.svg" },
  { pattern: /aero|drag\b|wind tunnel|speed|\bfast\b|sprint/i, icon: "noun-fast-4767027.svg" },
  { pattern: /computer|garmin|wahoo|display|connectivity|electronic|app\b/i, icon: "noun-bike-computer-6991376.svg" },
  { pattern: /bottle|cage\b|hydration/i, icon: "noun-bottle-cage-6991379.svg" },
  { pattern: /storage|swat\b|\bbag\b|mounts?\b|rack\b/i, icon: "noun-bike-front-rack-6991323.svg" },
  { pattern: /pedal/i, icon: "noun-bike-pedal-6991389.svg" },
  { pattern: /\bchain\b/i, icon: "noun-bike-chain-6991402.svg" },
  { pattern: /\bhubs?\b|freehub/i, icon: "noun-bike-rear-hub-6991324.svg" },
  { pattern: /spoke/i, icon: "noun-bike-spokes-6991378.svg" },
  { pattern: /workshop|servic|maintenance|upgrade|mechanic/i, icon: "noun-chain-tool-6991336.svg" },
  { pattern: /frame|chassis|carbon|oclv|monocoque|geometry|\bfit\b|sizing|headset/i, icon: "noun-road-bike-frame-6991314.svg" },
];

function matchEditorialIcon(text: string): string | null {
  for (const rule of EDITORIAL_ICON_RULES) {
    if (rule.pattern.test(text)) return rule.icon;
  }
  return null;
}

/** Value props always get an icon — title first, then description, then a frame fallback. */
function highlightIconName(title: string, description: string): string {
  return (
    matchEditorialIcon(title) ??
    matchEditorialIcon(description) ??
    getBikeSpecLabelIconName(title)
  );
}

/** Editorial section header: big chapter title, kin to the brand header but quieter. */
function SectionHeader({
  index,
  title,
  kicker,
  compact,
}: {
  index: number;
  title: string;
  kicker?: string;
  compact?: boolean;
}) {
  const words = title.trim().split(/\s+/);
  const lead = words[0] ?? title;
  const rest = words.slice(1).join(" ");

  if (compact) {
    return (
      <div className="mb-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="min-w-0 text-base font-semibold tracking-tight text-gray-900">
            {title}
          </h2>
          <span className="shrink-0 font-mono text-[11px] tracking-[0.18em] text-gray-400">
            {String(index).padStart(2, "0")}
          </span>
        </div>
        {kicker ? <p className="mt-1.5 text-sm text-gray-500">{kicker}</p> : null}
      </div>
    );
  }

  return (
    <div className="mb-10">
      <div className="flex items-end justify-between gap-4">
        <h2 className="min-w-0 text-[2.25rem] font-semibold leading-[0.92] tracking-tight text-gray-900 sm:text-4xl lg:text-[3.25rem]">
          <span className="block">{lead}</span>
          {rest ? (
            <span className="mt-1 block">
              <BlurText text={rest} delay={70} className="text-gray-400" />
            </span>
          ) : null}
        </h2>
        <FadeContent delay={0.18} distance={6}>
          <Magnet padding={24} magnetStrength={14}>
            <span className="mb-1 inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-2.5 py-1.5 font-mono text-xs tracking-[0.18em] text-gray-400">
              {String(index).padStart(2, "0")}
            </span>
          </Magnet>
        </FadeContent>
      </div>
      <FadeContent delay={0.24} distance={0}>
        <div className="mt-5 flex items-center gap-3">
          <span className="h-1 w-10 rounded-full bg-gray-900" aria-hidden />
          <span className="h-px flex-1 bg-gray-200" aria-hidden />
        </div>
      </FadeContent>
      {kicker ? (
        <FadeContent delay={0.3} distance={8}>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-500">
            {kicker}
          </p>
        </FadeContent>
      ) : null}
    </div>
  );
}

/** Brand section chapter title above the contained About card. */
function BrandSectionHeader({
  index,
  brandName,
  compact,
}: {
  index: number;
  brandName: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-6" : "mb-10"}>
      <div className="flex items-start justify-between gap-4">
        <h2
          className={cn(
            "min-w-0 font-semibold leading-[0.95] tracking-tight text-gray-900",
            compact
              ? "text-3xl"
              : "text-[2.75rem] sm:text-5xl lg:text-[3.75rem]",
          )}
        >
          <span>About </span>
          <BlurText
            text={brandName}
            delay={compact ? 60 : 90}
            className="text-gray-400"
          />
        </h2>
        <FadeContent delay={0.2} distance={6}>
          <Magnet padding={24} magnetStrength={14}>
            <span
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-2.5 py-1.5 font-mono tracking-[0.18em] text-gray-400",
                compact ? "text-[11px]" : "text-xs",
              )}
            >
              {String(index).padStart(2, "0")}
            </span>
          </Magnet>
        </FadeContent>
      </div>
      <FadeContent delay={0.28} distance={0}>
        <div className={cn("bg-gray-200", compact ? "mt-4 h-px" : "mt-6 h-px")} />
      </FadeContent>
    </div>
  );
}

/** Spec row matching the live PDP: bike icon + bold label + value. */
function SpecRow({
  label,
  value,
  sectionTitle,
}: {
  label: string;
  value: string;
  sectionTitle: string;
}) {
  return (
    <div className="grid grid-cols-[1.375rem_minmax(7rem,9rem)_1fr] items-start gap-x-4 border-b border-gray-200/70 py-3.5 last:border-b-0">
      <BikeIcon
        iconName={getBikeSpecLabelIconName(label, sectionTitle)}
        size={22}
        className="mt-0.5 size-[22px] shrink-0 opacity-50"
      />
      <span className="text-[12px] font-bold uppercase leading-snug tracking-wide text-gray-900">
        {label}
      </span>
      <span className="text-[13px] leading-relaxed text-gray-600">{value}</span>
    </div>
  );
}

function TrustRow({ className }: { className?: string }) {
  const items = [
    { icon: Lock, label: "Escrow protected" },
    { icon: ShieldCheck, label: "Buyer Protection" },
    { icon: Truck, label: "Ships Australia-wide" },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map(({ icon: Icon, label }) => (
        <span key={label} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <Icon className="h-3.5 w-3.5 text-gray-400" />
          {label}
        </span>
      ))}
    </div>
  );
}

function resolveSeller(seller?: WorldClassSellerInfo | null): WorldClassSellerInfo {
  if (seller?.name?.trim()) {
    return {
      name: seller.name.trim(),
      logoUrl: seller.logoUrl ?? null,
      location: seller.location?.trim() || null,
      verified: seller.verified ?? true,
    };
  }
  return {
    name: DEMO_SELLER.name,
    logoUrl: null,
    location: DEMO_SELLER.suburb,
    verified: true,
  };
}

function SellerAvatar({
  seller,
  size = "md",
}: {
  seller: WorldClassSellerInfo;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  if (seller.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={seller.logoUrl}
        alt={`${seller.name} logo`}
        className={cn(
          "shrink-0 rounded-full border border-gray-200 bg-white object-contain",
          dim,
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50",
        dim,
      )}
    >
      <Store className={cn("text-gray-400", icon)} />
    </span>
  );
}

function SellerRow({
  seller,
  compact,
}: {
  seller: WorldClassSellerInfo;
  compact?: boolean;
}) {
  const meta = [
    seller.location,
    seller.verified ? "Verified store" : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3">
      <SellerAvatar seller={seller} />
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-500">
          Sold by <span className="font-semibold text-gray-900">{seller.name}</span>
        </p>
        {!compact && meta.length > 0 ? (
          <p className="text-xs text-gray-400">{meta.join(" · ")}</p>
        ) : null}
      </div>
      {seller.verified ? (
        <BadgeCheck className="ml-auto h-4 w-4 shrink-0 text-gray-400" />
      ) : null}
    </div>
  );
}

function PurchaseActions({ price }: { price: WorldClassKeyStat | null }) {
  return (
    <div className="space-y-2.5">
      <button
        type="button"
        className="h-12 w-full rounded-md bg-[#1e2a3a] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#152232]"
      >
        {price ? `Add to Cart - ${price.value}` : "Add to Cart"}
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          className="h-11 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
        >
          Buy Now
        </button>
        <button
          type="button"
          className="h-11 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
        >
          Make an Offer
        </button>
      </div>
      <button
        type="button"
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <MessageCircle className="h-4 w-4 text-gray-400" />
        Ask a question
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Videos                                                              */
/* ------------------------------------------------------------------ */

function VideoTheatre({ videos }: { videos: WorldClassVideo[] }) {
  const [active, setActive] = React.useState(0);
  const current = videos[active] ?? videos[0];
  if (!current) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div>
        <div className="aspect-video overflow-hidden rounded-md border border-gray-200 bg-gray-950">
          <iframe
            key={current.videoId}
            src={`https://www.youtube.com/embed/${current.videoId}`}
            title={current.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="h-full w-full"
            loading="lazy"
          />
        </div>
        <p className="mt-2.5 text-sm font-medium text-gray-900">{current.title}</p>
        {current.channel ? (
          <p className="text-xs text-gray-500">{current.channel}</p>
        ) : null}
      </div>
      {videos.length > 1 ? (
        <div className="space-y-1">
          {videos.map((video, index) => (
            <button
              key={video.videoId}
              type="button"
              onClick={() => setActive(index)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors",
                index === active ? "bg-gray-100" : "hover:bg-gray-50",
              )}
            >
              <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-gray-100">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90">
                    <Play className="h-3 w-3 translate-x-px text-gray-900" />
                  </span>
                </span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {video.title}
                </span>
                {video.channel ? (
                  <span className="block truncate text-xs text-gray-500">
                    {video.channel}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section bodies (shared desktop/mobile)                              */
/* ------------------------------------------------------------------ */

/**
 * Companion shot for the overview copy — deliberately NOT the hero. Prefers a
 * genuinely different kind of image (riding/lifestyle, then a detail close-up,
 * then any different camera angle) so the page doesn't repeat the same
 * front-on photo twice. Falls back to the hero only when it's all we have.
 */
function overviewSideImage(page: WorldClassProductPage) {
  const hero = page.images[0] ?? null;
  if (!hero) return null;
  const rest = page.images.slice(1);
  if (rest.length === 0) return hero;
  const differentAngle = (image: (typeof rest)[number]) =>
    !image.viewAngle || !hero.viewAngle || image.viewAngle !== hero.viewAngle;
  return (
    rest.find((image) => image.role === "lifestyle" && differentAngle(image)) ??
    rest.find((image) => image.role === "detail" && differentAngle(image)) ??
    rest.find(differentAngle) ??
    rest[0]
  );
}

function OverviewBody({ page, single }: { page: WorldClassProductPage; single?: boolean }) {
  const sideImage = overviewSideImage(page);

  return (
    <div className="space-y-10">
      <div
        className={cn(
          "grid gap-8",
          !single && sideImage && "lg:grid-cols-[1.15fr_0.85fr] lg:items-start",
        )}
      >
        <div className="space-y-4">
          {page.overviewParagraphs.map((paragraph, index) => (
            <p
              key={paragraph.slice(0, 32)}
              className={cn(
                "leading-relaxed text-gray-600",
                index === 0 ? "text-[15px] text-gray-700" : "text-sm",
              )}
            >
              {paragraph}
            </p>
          ))}
          {page.idealRider ? (
            <p className="border-l-2 border-gray-900 pl-4 text-sm italic leading-relaxed text-gray-700">
              {page.idealRider}
            </p>
          ) : null}
        </div>

        {sideImage ? (
          <div
            className={cn(
              "overflow-hidden rounded-md border border-gray-200 bg-gray-50",
              single ? "aspect-[4/3]" : "aspect-[4/3] lg:aspect-auto lg:min-h-[280px]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sideImage.url}
              alt={sideImage.caption || page.productName}
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />
          </div>
        ) : null}
      </div>

      {page.highlights.length > 0 ? (
        <div
          className={cn(
            "grid gap-x-8 gap-y-0 border-t border-gray-200",
            single
              ? "grid-cols-1"
              : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
          )}
        >
          {page.highlights.map((item) => (
            <div
              key={item.title}
              className="grid grid-cols-[2.25rem_1fr] gap-x-3 border-b border-gray-200/80 py-4"
            >
              <BikeIcon
                iconName={highlightIconName(item.title, item.description)}
                size={24}
                className="mt-0.5 size-6 opacity-50"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-gray-600">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SpecsBody({ page, single }: { page: WorldClassProductPage; single?: boolean }) {
  const flat = flattenSpecs(page.specifications);
  if (single) {
    return (
      <div>
        {flat.map(({ spec, sectionTitle }, index) => (
          <SpecRow
            key={`${sectionTitle}-${spec.label}-${index}`}
            label={spec.label}
            value={spec.value}
            sectionTitle={sectionTitle}
          />
        ))}
      </div>
    );
  }
  const midpoint = Math.ceil(flat.length / 2);
  const columns = [flat.slice(0, midpoint), flat.slice(midpoint)];
  return (
    <div className="grid grid-cols-1 gap-x-16 lg:grid-cols-2 xl:gap-x-24">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="min-w-0">
          {column.map(({ spec, sectionTitle }, index) => (
            <SpecRow
              key={`${sectionTitle}-${spec.label}-${index}`}
              label={spec.label}
              value={spec.value}
              sectionTitle={sectionTitle}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Prefer a lifestyle/gallery shot for the About media well; fall back to logo. */
function brandMediaImage(page: WorldClassProductPage): {
  url: string;
  alt: string;
  kind: "photo" | "logo";
} | null {
  const photo =
    page.images.find((image) => image.role === "lifestyle") ??
    page.images.find((image) => image.role === "gallery") ??
    page.images.find((image) => image.role === "hero") ??
    page.images[0] ??
    null;
  if (photo?.url) {
    return {
      url: photo.url,
      alt: photo.caption || page.productName,
      kind: "photo",
    };
  }
  if (page.brandLogoUrl?.startsWith("http")) {
    return {
      url: page.brandLogoUrl,
      alt: `${page.brandStory?.name ?? page.brand ?? "Brand"} logo`,
      kind: "logo",
    };
  }
  return null;
}

function BrandBody({
  page,
  compact,
}: {
  page: WorldClassProductPage;
  compact?: boolean;
}) {
  const brand = page.brandStory;
  if (!brand) return null;

  const heading = brand.tagline?.trim() || brand.name;
  const body =
    brand.paragraphs.slice(0, compact ? 2 : 3).join(" ") ||
    brand.highlights.slice(0, 2).join(" ");
  const media = brandMediaImage(page);
  const logoUrl = page.brandLogoUrl?.startsWith("http")
    ? page.brandLogoUrl
    : null;

  return (
    <FadeContent delay={0.08} distance={16}>
      <div
        className={cn(
          "rounded-md bg-[#141414] text-white",
          compact ? "p-5" : "p-6 sm:p-8",
        )}
      >
        {logoUrl ? (
          <div className="mb-5">
            <img
              src={logoUrl}
              alt={`${brand.name} logo`}
              referrerPolicy="no-referrer"
              className={cn(
                "w-auto object-contain object-left brightness-0 invert",
                compact ? "h-8 max-w-[120px]" : "h-10 max-w-[160px]",
              )}
            />
          </div>
        ) : null}
        <h3
          className={cn(
            "font-semibold tracking-tight text-white",
            compact ? "text-xl" : "text-2xl sm:text-[1.75rem]",
          )}
        >
          {heading}
        </h3>
        {body ? (
          <p
            className={cn(
              "mt-3 max-w-2xl leading-relaxed text-gray-400",
              compact ? "text-sm" : "text-[15px]",
            )}
          >
            {body}
          </p>
        ) : null}

        <div
          className={cn(
            "mt-6 flex items-center justify-center overflow-hidden rounded-md bg-[#1c1c1c]",
            compact ? "aspect-[16/10]" : "aspect-[16/9] sm:aspect-[2/1]",
          )}
        >
          {media ? (
            <img
              src={media.url}
              alt={media.alt}
              referrerPolicy="no-referrer"
              className={cn(
                media.kind === "logo"
                  ? "h-16 w-auto max-w-[60%] object-contain opacity-90 sm:h-20"
                  : "h-full w-full object-cover",
              )}
            />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center">
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    "repeating-conic-gradient(from 0deg, transparent 0deg 8deg, rgba(255,255,255,0.06) 8deg 9deg)",
                  maskImage:
                    "radial-gradient(circle at center, black 0%, transparent 55%)",
                }}
              />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <Store className="h-5 w-5 text-gray-500" />
              </div>
            </div>
          )}
        </div>

        {brand.highlights.length > 0 ? (
          <ul
            className={cn(
              "mt-5 grid gap-2 border-t border-white/10 pt-5",
              compact ? "grid-cols-1" : "sm:grid-cols-2",
            )}
          >
            {brand.highlights.slice(0, 4).map((item) => (
              <li key={item} className="text-sm leading-relaxed text-gray-400">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </FadeContent>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop layout                                                      */
/* ------------------------------------------------------------------ */

/** Track image URLs that fail to load so galleries can drop them live. */
function useBrokenImageFilter() {
  const [broken, setBroken] = React.useState<ReadonlySet<string>>(new Set());
  const markBroken = React.useCallback((url: string) => {
    setBroken((previous) => {
      const next = new Set(previous);
      next.add(url);
      return next;
    });
  }, []);
  return { broken, markBroken };
}

function DesktopGallery({ page }: { page: WorldClassProductPage }) {
  const [rawActive, setActive] = React.useState(0);
  const { broken, markBroken } = useBrokenImageFilter();
  const images = page.images.filter((image) => !broken.has(image.url));
  const active = Math.min(rawActive, Math.max(0, images.length - 1));
  const current = images[active] ?? images[0];
  if (!current) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
        No verified product images found
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="group relative aspect-[4/3] overflow-hidden rounded-md bg-gray-50">
        <img
          src={current.url}
          alt={current.caption || page.productName}
          referrerPolicy="no-referrer"
          onError={() => markBroken(current.url)}
          className="h-full w-full object-contain"
        />
        <span className="absolute bottom-3 right-3 rounded-md bg-white/90 px-2 py-0.5 font-mono text-[11px] text-gray-600 shadow-sm">
          {active + 1} / {images.length}
        </span>
        {images.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => setActive((v) => (v - 1 + images.length) % images.length)}
              className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            >
              <ChevronLeft className="h-4 w-4 text-gray-700" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => setActive((v) => (v + 1) % images.length)}
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            >
              <ChevronRight className="h-4 w-4 text-gray-700" />
            </button>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setActive(index)}
              className={cn(
                "h-16 w-20 shrink-0 overflow-hidden rounded-md border bg-gray-50 transition-colors",
                index === active
                  ? "border-gray-900"
                  : "border-gray-200 hover:border-gray-400",
              )}
            >
              <img
                src={image.url}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => markBroken(image.url)}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DesktopPurchasePanel({
  page,
  seller,
  listingPrice,
}: {
  page: WorldClassProductPage;
  seller: WorldClassSellerInfo;
  listingPrice?: number | null;
}) {
  const price = resolveDisplayPrice(page, listingPrice);
  const meta = productMetaLine(page);
  return (
    <div>
      {meta.length > 0 ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
          {meta.join(" · ")}
        </p>
      ) : null}
      <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight text-gray-900">
        {page.productName}
      </h1>
      {page.tagline ? (
        <p className="mt-1.5 text-[15px] text-gray-600">{page.tagline}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {price ? (
          <>
            <p className="text-[28px] font-bold leading-none tracking-tight text-gray-900">
              {price.value}
            </p>
            <span className="text-xs text-gray-400">{price.label}</span>
          </>
        ) : (
          <p className="text-sm text-gray-400">Price set when listed</p>
        )}
      </div>
      <p className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-gray-600">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
        In stock, ready to ship
      </p>

      {page.heroSummary ? (
        <p className="mt-4 text-sm leading-relaxed text-gray-600">{page.heroSummary}</p>
      ) : null}

      <div className="mt-5">
        <PurchaseActions price={price} />
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4">
        <SellerRow seller={seller} />
      </div>
      <TrustRow className="mt-4" />
    </div>
  );
}

function StatStrip({ page }: { page: WorldClassProductPage }) {
  const price = findPriceStat(page.keyStats);
  const stats = page.keyStats.filter((stat) => stat !== price).slice(0, 4);
  if (stats.length === 0) return null;

  // SVG data-URI patterns render more consistently across Safari and Chrome
  // than multi-layer CSS gradient checkers/dots.
  const patterns = [
    {
      backgroundColor: "#F3F4F6",
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'><circle cx='1' cy='1' r='1' fill='rgba(17,24,39,0.14)'/></svg>`,
      )}")`,
      backgroundSize: "14px 14px",
    },
    {
      backgroundColor: "#EEF2F7",
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path d='M0 0H8V8H0zM8 8H16V16H8z' fill='rgba(17,24,39,0.06)'/></svg>`,
      )}")`,
      backgroundSize: "16px 16px",
    },
    {
      backgroundColor: "#F5F5F7",
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path d='M16 0H0V1H16zM0 0V16H1V0z' fill='rgba(17,24,39,0.08)'/></svg>`,
      )}")`,
      backgroundSize: "16px 16px",
    },
    {
      backgroundColor: "#F1F5F9",
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M-1 11L11 -1M0 12L12 0' stroke='rgba(17,24,39,0.08)' stroke-width='1'/></svg>`,
      )}")`,
      backgroundSize: "12px 12px",
    },
  ] as const;

  return (
    <div className="w-full bg-white px-4 py-5 xl:px-5">
      <div
        className="grid w-full gap-3"
        style={{
          gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        }}
      >
        {stats.map((stat, index) => {
          const pattern = patterns[index % patterns.length];

          return (
            <FadeContent
              key={`${stat.label}-${stat.value}`}
              delay={0.08 + index * 0.06}
              distance={12}
              className="min-w-0 w-full"
            >
              {/* Fixed height: aspect-ratio on flex children diverges between Chrome and Safari. */}
              <div
                className="relative h-[96px] w-full overflow-hidden rounded-md border border-gray-200 sm:h-[104px]"
                style={pattern}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-full bg-gradient-to-b from-black/[0.04] via-transparent to-transparent" />
                <div className="relative z-20 p-4 sm:p-5">
                  <p className="text-left font-sans text-sm font-medium text-neutral-500 md:text-base">
                    {stat.label}
                  </p>
                  <p className="mt-1.5 max-w-xs text-left font-sans text-xl font-semibold leading-snug tracking-tight [text-wrap:balance] text-neutral-900 md:text-2xl">
                    {stat.value}
                  </p>
                </div>
              </div>
            </FadeContent>
          );
        })}
      </div>
    </div>
  );
}

function DesktopPage({
  page,
  level1,
  level2,
  level3,
  seller,
  listingPrice,
  product,
  showAskGenie = true,
}: {
  page: WorldClassProductPage;
  level1?: string | null;
  level2?: string | null;
  level3?: string | null;
  seller: WorldClassSellerInfo;
  listingPrice?: number | null;
  product?: MarketplaceProduct | null;
  showAskGenie?: boolean;
}) {
  const sections = buildSectionList(page);
  const hasTaxonomy = Boolean(level1 || level2 || level3);
  const isNonBike = resolveProductKind(page) === "non_bike";
  const crumbCategory = isNonBike ? page.productCategory : page.bikeType;
  const askAfterIndex = Math.max(0, Math.floor((sections.length - 1) / 2));

  return (
    <div className="w-full bg-white">
      {/* Hero — full-width, edge-to-edge content */}
      <div className="w-full">
        <div className="flex w-full items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 xl:px-5">
          <div className="min-w-0 flex-1">
            {hasTaxonomy ? (
              <ProductBreadcrumbs
                level1={level1}
                level2={level2}
                level3={level3}
                productName={page.productName}
              />
            ) : (
              <p className="truncate text-xs text-gray-400">
                Marketplace
                <span className="mx-1.5 text-gray-300">/</span>
                {isNonBike ? "Accessories & parts" : "Bikes"}
                {crumbCategory ? (
                  <>
                    <span className="mx-1.5 text-gray-300">/</span>
                    {crumbCategory}
                  </>
                ) : null}
                <span className="mx-1.5 text-gray-300">/</span>
                <span className="text-gray-600">{page.productName}</span>
              </p>
            )}
          </div>

          {page.brandLogoUrl ? (
            <img
              src={page.brandLogoUrl}
              alt={page.brand ? `${page.brand} logo` : "Brand logo"}
              className="h-7 w-auto max-w-[110px] shrink-0 object-contain object-right"
            />
          ) : null}
        </div>
        <div className="flex w-full items-start gap-0 pt-2">
          <div className="min-w-0 w-[57%] pb-8 pl-4 pr-4 xl:pl-5">
            <DesktopGallery page={page} />
          </div>
          <div className="min-w-0 w-[43%] px-4 pb-8 xl:pl-6 xl:pr-5">
            <DesktopPurchasePanel
              page={page}
              seller={seller}
              listingPrice={listingPrice}
            />
          </div>
        </div>
        <StatStrip page={page} />
      </div>

      <div className="w-full">
        {sections.map((section, index) => (
          <React.Fragment key={section.id}>
            <section
              id={section.id}
              className={cn(
                "w-full",
                hasTaxonomy ? "scroll-mt-24" : "scroll-mt-8",
              )}
            >
              <div className="w-full px-4 py-10 xl:px-5">
                {section.id === "brand" && page.brandStory ? (
                  <BrandSectionHeader
                    index={index + 1}
                    brandName={page.brandStory.name}
                  />
                ) : (
                  <SectionHeader
                    index={index + 1}
                    title={section.title}
                    kicker={section.kicker}
                  />
                )}
                {section.render(page, false)}
              </div>
            </section>
            {showAskGenie && index === askAfterIndex ? (
              <section
                id="ask"
                className={cn(
                  "w-full border-b border-gray-100 bg-gradient-to-b from-white via-gray-50/80 to-white",
                  hasTaxonomy ? "scroll-mt-24" : "scroll-mt-8",
                )}
              >
                <MagicalProductAsk page={page} product={product} />
              </section>
            ) : null}
          </React.Fragment>
        ))}
        {showAskGenie && sections.length === 0 ? (
          <section
            id="ask"
            className="w-full border-b border-gray-100 bg-gradient-to-b from-white via-gray-50/80 to-white"
          >
            <MagicalProductAsk page={page} product={product} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section registry                                                    */
/* ------------------------------------------------------------------ */

type SectionDef = {
  id: string;
  label: string;
  title: string;
  kicker?: string;
  render: (page: WorldClassProductPage, single: boolean) => React.ReactNode;
};

function buildSectionList(page: WorldClassProductPage): SectionDef[] {
  const isNonBike = resolveProductKind(page) === "non_bike";
  const sections: Array<SectionDef | null> = [
    page.overviewParagraphs.length > 0 || page.highlights.length > 0
      ? {
          id: "overview",
          label: "Overview",
          title: isNonBike ? "The product brief" : "The ride report",
          render: (p, single) => <OverviewBody page={p} single={single} />,
        }
      : null,
    page.specifications.length > 0
      ? {
          id: "specifications",
          label: "Specs",
          title: "Full specifications",
          kicker:
            page.research.officialSpecsVerified && page.research.officialDomain
              ? `As published by ${page.brand ?? "the manufacturer"}, extracted from ${page.research.officialDomain}.`
              : isNonBike
                ? "Every detail as published by the manufacturer."
                : "Every component as published by the manufacturer.",
          render: (p, single) => <SpecsBody page={p} single={single} />,
        }
      : null,
    page.videos.length > 0
      ? {
          id: "videos",
          label: "Videos",
          title: isNonBike ? "See it in action" : "See it in motion",
          render: (p) => <VideoTheatre videos={p.videos} />,
        }
      : null,
    page.brandStory
      ? {
          id: "brand",
          label: "Brand",
          title: `About ${page.brandStory.name}`,
          render: (p, single) => <BrandBody page={p} compact={single} />,
        }
      : null,
  ];
  return sections.filter((section): section is SectionDef => !!section);
}

/* ------------------------------------------------------------------ */
/* Mobile layout — designed for thumbs, not shrunk desktop             */
/* ------------------------------------------------------------------ */

function MobileGallery({ page }: { page: WorldClassProductPage }) {
  const [active, setActive] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { broken, markBroken } = useBrokenImageFilter();
  const images = page.images.filter((image) => !broken.has(image.url));

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center bg-gray-50 text-sm text-gray-400">
        No verified product images found
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((image) => (
          <div key={image.url} className="aspect-square w-full shrink-0 snap-center bg-gray-50">
            <img
              src={image.url}
              alt={image.caption || page.productName}
              referrerPolicy="no-referrer"
              onError={() => markBroken(image.url)}
              className="h-full w-full object-contain"
            />
          </div>
        ))}
      </div>
      <span className="absolute bottom-3 right-3 rounded-md bg-white/90 px-2 py-0.5 font-mono text-[11px] text-gray-600 shadow-sm">
        {active + 1} / {images.length}
      </span>
      {images.length > 1 ? (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {images.slice(0, 8).map((image, index) => (
            <span
              key={image.url}
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === active ? "w-4 bg-gray-900" : "w-1.5 bg-gray-300",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MobileAccordion({
  sections,
  page,
  askAfterIndex = null,
  askSlot = null,
}: {
  sections: SectionDef[];
  page: WorldClassProductPage;
  askAfterIndex?: number | null;
  askSlot?: React.ReactNode;
}) {
  const [openId, setOpenId] = React.useState<string | null>(sections[0]?.id ?? null);

  return (
    <div className="divide-y divide-gray-100 border-t border-gray-100">
      {sections.map((section, index) => {
        const isOpen = openId === section.id;
        return (
          <React.Fragment key={section.id}>
            <div>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : section.id)}
                className="flex w-full items-center justify-between px-4 py-4 text-left"
              >
                <span className="text-[15px] font-semibold text-gray-900">
                  {section.id === "brand" ? section.label : section.title}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-gray-400 transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      duration: 0.4,
                      ease: [0.04, 0.62, 0.23, 0.98],
                    }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-6">
                      {section.id === "brand" && page.brandStory ? (
                        <BrandSectionHeader
                          index={
                            sections.findIndex((s) => s.id === section.id) + 1
                          }
                          brandName={page.brandStory.name}
                          compact
                        />
                      ) : null}
                      {section.render(page, true)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {askSlot && askAfterIndex === index ? (
              <div className="border-b border-gray-100 bg-gradient-to-b from-white via-gray-50/80 to-white">
                {askSlot}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function MobilePage({
  page,
  seller,
  listingPrice,
  product,
  showAskGenie = true,
}: {
  page: WorldClassProductPage;
  seller: WorldClassSellerInfo;
  listingPrice?: number | null;
  product?: MarketplaceProduct | null;
  showAskGenie?: boolean;
}) {
  const price = resolveDisplayPrice(page, listingPrice);
  const sections = buildSectionList(page);
  const meta = productMetaLine(page);
  const askAfterIndex = Math.max(0, Math.floor((sections.length - 1) / 2));

  return (
    <div className="relative bg-white">
      {/* Store context bar */}
      <div className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-gray-100 bg-white/95 px-4 py-2.5 backdrop-blur">
        <ChevronLeft className="h-4 w-4 shrink-0 text-gray-400" />
        <SellerAvatar seller={seller} size="sm" />
        <span className="min-w-0 truncate text-sm font-semibold text-gray-900">
          {seller.name}
        </span>
        <span className="ml-auto flex shrink-0 gap-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50">
            <Heart className="h-4 w-4 text-gray-500" />
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50">
            <Share2 className="h-4 w-4 text-gray-500" />
          </span>
        </span>
      </div>

      <MobileGallery page={page} />

      {/* Title block */}
      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {meta.length > 0 ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                {meta.join(" · ")}
              </p>
            ) : null}
            <h1 className="mt-1 text-xl font-semibold leading-snug tracking-tight text-gray-900">
              {page.productName}
            </h1>
          </div>
          {page.brandLogoUrl ? (
            <img
              src={page.brandLogoUrl}
              alt=""
              className="mt-1 h-6 w-auto max-w-[72px] shrink-0 object-contain object-right"
            />
          ) : null}
        </div>
        {page.tagline ? (
          <p className="mt-1.5 text-sm text-gray-600">{page.tagline}</p>
        ) : null}
        <div className="mt-3 flex items-baseline gap-2">
          {price ? (
            <p className="text-2xl font-bold tracking-tight text-gray-900">{price.value}</p>
          ) : (
            <p className="text-sm text-gray-400">Price set when listed</p>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
            In stock
          </span>
        </div>
      </div>

      <StatStrip page={page} />

      {page.heroSummary ? (
        <p className="px-4 pt-4 text-sm leading-relaxed text-gray-600">{page.heroSummary}</p>
      ) : null}

      {/* Purchase block */}
      <div className="px-4 pt-5">
        <PurchaseActions price={price} />
        <div className="mt-4 border-t border-gray-100 pt-4">
          <SellerRow seller={seller} compact />
        </div>
        <TrustRow className="mt-3 pb-5" />
      </div>

      <MobileAccordion
        sections={sections}
        page={page}
        askAfterIndex={showAskGenie ? askAfterIndex : null}
        askSlot={
          showAskGenie ? (
            <MagicalProductAsk page={page} product={product} compact />
          ) : null
        }
      />
      {showAskGenie && sections.length === 0 ? (
        <div className="border-b border-gray-100 bg-gradient-to-b from-white via-gray-50/80 to-white">
          <MagicalProductAsk page={page} product={product} compact />
        </div>
      ) : null}

      {/* Sticky buy bar */}
      <div className="sticky bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            {price ? (
              <p className="text-base font-bold tracking-tight text-gray-900">{price.value}</p>
            ) : null}
            <p className="truncate text-[11px] text-gray-400">{page.productName}</p>
          </div>
          <button
            type="button"
            className="ml-auto h-11 shrink-0 rounded-md bg-[#1e2a3a] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#152232]"
          >
            {price ? `Add to Cart - ${price.value}` : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export function WorldClassProductPageTemplate({
  page,
  viewMode = "desktop",
  className,
  level1,
  level2,
  level3,
  seller,
  listingPrice,
  product = null,
  showAskGenie = true,
}: Props) {
  const resolvedSeller = resolveSeller(seller);

  if (viewMode === "mobile") {
    return (
      <div className={cn("bg-gray-50 px-4 py-8", className)}>
        <div className="mx-auto w-[400px] max-w-full">
          <div className="rounded-[2.6rem] border border-gray-300 bg-gray-900 p-2 shadow-xl">
            <div className="overflow-hidden rounded-[2rem] bg-white">
              <div className="h-[760px] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <MobilePage
                  page={page}
                  seller={resolvedSeller}
                  listingPrice={listingPrice}
                  product={product}
                  showAskGenie={showAskGenie}
                />
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-gray-400">
            Mobile storefront preview, 400px viewport
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      <DesktopPage
        page={page}
        level1={level1}
        level2={level2}
        level3={level3}
        seller={resolvedSeller}
        listingPrice={listingPrice}
        product={product}
        showAskGenie={showAskGenie}
      />
    </div>
  );
}

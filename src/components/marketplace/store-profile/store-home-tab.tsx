"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Phone,
  MapPin,
  Clock,
  Navigation,
  Sparkles,
  Settings2,
  Store as StoreIcon,
  Wrench,
  Instagram,
  Facebook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StoreProfile,
  StoreHomepageConfig,
  HomeCta,
  OpeningHours,
} from "@/lib/types/store";
import { resolveHomepageConfig } from "@/lib/marketplace/homepage-config";
import { getHomepageIcon } from "@/components/marketplace/store-profile/homepage-icons";
import { ProductCarousel } from "@/components/marketplace/store-profile/product-carousel";
import { ProductCard } from "@/components/marketplace/product-card";

// ============================================================
// Store Home Tab — the public landing page for a bicycle store.
// Renders a polished default from the store's own data and layers
// the owner's homepage_config customisations on top.
// ============================================================

interface StoreHomeTabProps {
  store: StoreProfile;
  isOwnProfile?: boolean;
  /** Navigate by CTA href (tab key, 'call', 'directions', or absolute URL). */
  onNavigate: (href: string) => void;
  /** Open the Products tab filtered to a category. */
  onOpenCollection: (categoryName: string) => void;
}

const DAY_KEYS: (keyof OpeningHours)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];
const WEEK_ORDER: (keyof OpeningHours)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

/** Pick black or white text for legibility on an arbitrary accent colour. */
function readableOn(hex: string): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function openStatusFor(hours: OpeningHours | undefined): { open: boolean; label: string } | null {
  if (!hours) return null;
  const now = new Date();
  const today = hours[DAY_KEYS[now.getDay()]];
  if (!today) return null;
  if (today.closed) return { open: false, label: "Closed today" };
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur < toMinutes(today.open)) return { open: false, label: `Opens ${today.open}` };
  if (cur >= toMinutes(today.close)) return { open: false, label: "Closed now" };
  return { open: true, label: `Open until ${today.close}` };
}

// ── Scroll-reveal wrapper ──────────────────────────────────
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

const SHELL = "max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-10";

export function StoreHomeTab({ store, isOwnProfile, onNavigate, onOpenCollection }: StoreHomeTabProps) {
  const config = React.useMemo<StoreHomepageConfig>(
    () => resolveHomepageConfig(store.homepage_config, store),
    [store],
  );
  const accent = config.theme.accent || "#ffde59";
  const accentText = readableOn(accent);

  const handleCta = (cta: HomeCta | null) => {
    if (!cta) return;
    onNavigate(cta.href);
  };

  const sectionRenderers: Record<string, () => React.ReactNode> = {
    highlights: () =>
      config.highlights.enabled && config.highlights.items.length > 0 ? (
        <HighlightsSection key="highlights" config={config} accent={accent} />
      ) : null,
    collections: () =>
      config.collections.enabled && config.collections.items.length > 0 ? (
        <CollectionsSection
          key="collections"
          config={config}
          onOpenCollection={onOpenCollection}
        />
      ) : null,
    carousels: () =>
      config.featured_carousels.enabled &&
      (config.featured_carousels.slot1 || config.featured_carousels.slot2) ? (
        <FeaturedCarouselsSection key="carousels" store={store} config={config} onOpenCollection={onOpenCollection} />
      ) : null,
    story: () =>
      config.story.enabled ? (
        <StorySection key="story" store={store} config={config} accent={accent} />
      ) : null,
    services: () =>
      config.services.enabled && store.services.length > 0 ? (
        <ServicesTeaser
          key="services"
          store={store}
          config={config}
          accent={accent}
          accentText={accentText}
          onNavigate={onNavigate}
        />
      ) : null,
    gallery: () =>
      config.gallery.enabled && config.gallery.images.length > 0 ? (
        <GallerySection key="gallery" config={config} />
      ) : null,
    visit: () =>
      config.visit.enabled ? (
        <VisitSection
          key="visit"
          store={store}
          config={config}
          accent={accent}
          accentText={accentText}
          onNavigate={onNavigate}
        />
      ) : null,
  };

  return (
    <div className="pb-2">
      {/* Announcement bar */}
      {config.announcement.enabled && config.announcement.text.trim() && (
        <div
          className="text-center text-sm font-medium py-2 px-4"
          style={{ backgroundColor: accent, color: accentText }}
        >
          {config.announcement.text}
        </div>
      )}

      {/* Hero */}
      <Hero
        store={store}
        config={config}
        accent={accent}
        accentText={accentText}
        onPrimary={() => handleCta(config.hero.primary_cta)}
        onSecondary={() => handleCta(config.hero.secondary_cta)}
        isOwnProfile={isOwnProfile}
      />

      {/* Ordered sections */}
      <div className="space-y-16 sm:space-y-24 py-16 sm:py-24">
        {config.section_order.map((key) => sectionRenderers[key]?.())}
      </div>

      {/* Store footer */}
      <HomeFooter store={store} accent={accent} onNavigate={onNavigate} />
    </div>
  );
}

// ── Hero ───────────────────────────────────────────────────
function EditButton() {
  return (
    <a
      href="/settings/store?tab=home"
      className="absolute top-4 right-5 sm:right-8 lg:right-10 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-black/[0.06] px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-white hover:shadow-md transition-all"
    >
      <Settings2 className="h-3 w-3" />
      Edit
    </a>
  );
}

function Hero({
  store,
  config,
  accent,
  accentText,
  onPrimary,
  onSecondary,
  isOwnProfile,
}: {
  store: StoreProfile;
  config: StoreHomepageConfig;
  accent: string;
  accentText: string;
  onPrimary: () => void;
  onSecondary: () => void;
  isOwnProfile?: boolean;
}) {
  const { hero } = config;
  const status = openStatusFor(store.opening_hours);

  const PrimaryBtn = (
    <button
      type="button"
      onClick={onPrimary}
      className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5 cursor-pointer"
      style={{ backgroundColor: accent, color: accentText }}
    >
      {hero.primary_cta.label}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
  const SecondaryBtn = hero.secondary_cta ? (
    <button
      type="button"
      onClick={onSecondary}
      className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors cursor-pointer"
    >
      {hero.secondary_cta.label}
      <ChevronRight className="h-4 w-4" />
    </button>
  ) : null;

  // ── Split variant ──────────────────────────────────────
  if (hero.variant === "split") {
    return (
      <section className={cn(SHELL, "relative pt-10 sm:pt-14")}>
        {isOwnProfile && <EditButton />}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroEyebrow text={hero.eyebrow} accent={accent} status={config.badges.show_open_status ? status : null} />
            <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.05]">
              {hero.headline}
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-xl">
              {hero.subheadline}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {PrimaryBtn}
              {SecondaryBtn && (
                <span className="rounded-full border border-gray-200 hover:bg-gray-50">{SecondaryBtn}</span>
              )}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-gray-100 ring-1 ring-gray-200/70 shadow-xl"
          >
            {hero.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero.image_url} alt={store.store_name} className="h-full w-full object-cover" />
            ) : (
              <HeroFallback store={store} accent={accent} />
            )}
          </motion.div>
        </div>
      </section>
    );
  }

  // ── Minimal variant ────────────────────────────────────
  if (hero.variant === "minimal") {
    return (
      <section className="relative overflow-hidden">
        {isOwnProfile && <EditButton />}
        <div
          className="absolute inset-0 -z-10"
          style={{ background: `linear-gradient(180deg, ${accent}14 0%, transparent 60%)` }}
        />
        <div className={cn(SHELL, "py-20 sm:py-28 text-center")}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-3xl"
          >
            <div className="flex justify-center">
              <HeroEyebrow text={hero.eyebrow} accent={accent} status={status} center />
            </div>
            <h1 className="mt-5 text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 leading-[1.04]">
              {hero.headline}
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-600 leading-relaxed mx-auto max-w-2xl">
              {hero.subheadline}
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {PrimaryBtn}
              {SecondaryBtn && (
                <span className="rounded-full border border-gray-200 hover:bg-gray-50">{SecondaryBtn}</span>
              )}
            </div>
          </motion.div>
        </div>
      </section>
    );
  }

  // ── Spotlight variant (default) ────────────────────────
  const alignCenter = hero.align === "center";
  return (
    <section className="relative">
      {isOwnProfile && <EditButton />}
      <div className="relative isolate min-h-[520px] sm:min-h-[600px] flex items-center overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 -z-10">
          {hero.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <HeroFallback store={store} accent={accent} />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: alignCenter
                ? `linear-gradient(180deg, rgba(0,0,0,${hero.overlay / 140}) 0%, rgba(0,0,0,${hero.overlay / 100}) 100%)`
                : `linear-gradient(90deg, rgba(0,0,0,${hero.overlay / 90}) 0%, rgba(0,0,0,${hero.overlay / 160}) 55%, transparent 100%)`,
            }}
          />
        </div>

        <div className={cn(SHELL, "w-full py-16")}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className={cn("max-w-2xl", alignCenter && "mx-auto text-center")}
          >
            <HeroEyebrow text={hero.eyebrow} accent={accent} status={status} onDark center={alignCenter} />
            <h1 className="mt-4 text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.04] drop-shadow-sm">
              {hero.headline}
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-white/85 leading-relaxed max-w-xl drop-shadow-sm" style={alignCenter ? { marginLeft: "auto", marginRight: "auto" } : undefined}>
              {hero.subheadline}
            </p>
            <div className={cn("mt-8 flex flex-wrap items-center gap-3", alignCenter && "justify-center")}>
              {PrimaryBtn}
              {hero.secondary_cta && (
                <button
                  type="button"
                  onClick={onSecondary}
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm px-6 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors cursor-pointer"
                >
                  {hero.secondary_cta.label}
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function HeroEyebrow({
  text,
  accent,
  status,
  onDark,
  center,
}: {
  text: string;
  accent: string;
  status: { open: boolean; label: string } | null;
  onDark?: boolean;
  center?: boolean;
}) {
  if (!text && !status) return null;
  return (
    <div className={cn("flex items-center gap-2.5 text-sm font-medium", center && "justify-center")}>
      {text && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1",
            onDark ? "bg-white/15 text-white backdrop-blur-sm" : "text-gray-700",
          )}
          style={!onDark ? { backgroundColor: `${accent}26` } : undefined}
        >
          <Sparkles className="h-3.5 w-3.5" style={{ color: onDark ? accent : undefined }} />
          {text}
        </span>
      )}
      {status && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
            onDark ? "bg-black/25 text-white backdrop-blur-sm" : status.open ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", status.open ? "bg-green-400" : "bg-gray-400")} />
          {status.label}
        </span>
      )}
    </div>
  );
}

function HeroFallback({ store, accent }: { store: StoreProfile; accent: string }) {
  return (
    <div className="relative h-full w-full" style={{ background: `linear-gradient(135deg, #0f172a 0%, #1f2937 55%, #111827 100%)` }}>
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 20%, ${accent} 0, transparent 38%), radial-gradient(circle at 85% 70%, ${accent} 0, transparent 42%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {store.logo_url && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={store.logo_url} alt="" className="h-28 w-28 sm:h-40 sm:w-40 object-contain opacity-10" />
        </div>
      )}
    </div>
  );
}

// ── Highlights ─────────────────────────────────────────────
function HighlightsSection({ config, accent }: { config: StoreHomepageConfig; accent: string }) {
  return (
    <section className={SHELL}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {config.highlights.items.map((item, i) => {
          const Icon = getHomepageIcon(item.icon);
          return (
            <Reveal key={item.id} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-gray-200/80 bg-white p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${accent}26` }}
                >
                  <Icon className="h-5 w-5 text-gray-800" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">{item.description}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

// ── Featured collections ───────────────────────────────────
function CollectionsSection({
  config,
  onOpenCollection,
}: {
  config: StoreHomepageConfig;
  onOpenCollection: (categoryName: string) => void;
}) {
  const items = config.collections.items;
  return (
    <section className={SHELL}>
      <Reveal>
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
              {config.collections.title}
            </h2>
            {config.collections.subtitle && (
              <p className="mt-1.5 text-gray-500">{config.collections.subtitle}</p>
            )}
          </div>
        </div>
      </Reveal>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {items.map((c, i) => {
          // First tile spans two columns on large screens for an editorial feel
          const feature = i === 0 && items.length >= 4;
          return (
            <Reveal
              key={c.id}
              delay={i * 0.05}
              className={cn(feature && "lg:col-span-2 lg:row-span-1")}
            >
              <button
                type="button"
                onClick={() => onOpenCollection(c.href)}
                className={cn(
                  "group relative w-full overflow-hidden rounded-2xl bg-gray-900 text-left ring-1 ring-gray-200/60 cursor-pointer",
                  feature ? "aspect-[16/10] lg:aspect-[2/1]" : "aspect-[4/5] sm:aspect-square",
                )}
              >
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.image_url}
                    alt={c.label}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-white drop-shadow">
                      {c.label}
                    </h3>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm text-white transition-transform group-hover:translate-x-0.5">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </button>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

// ── Story ──────────────────────────────────────────────────
function StorySection({
  store,
  config,
  accent,
}: {
  store: StoreProfile;
  config: StoreHomepageConfig;
  accent: string;
}) {
  const { story } = config;
  const imageRight = story.layout === "image-right";
  const ImageBlock = (
    <Reveal className="lg:w-1/2">
      <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-gray-100 ring-1 ring-gray-200/70 shadow-lg">
        {story.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.image_url} alt={store.store_name} className="h-full w-full object-cover" />
        ) : (
          <div className="relative h-full w-full" style={{ background: `linear-gradient(135deg, ${accent}26, ${accent}0a)` }}>
            <div className="absolute inset-0 flex items-center justify-center">
              {store.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logo_url} alt="" className="h-24 w-24 object-contain opacity-80" />
              ) : (
                <StoreIcon className="h-16 w-16 text-gray-400" />
              )}
            </div>
          </div>
        )}
      </div>
    </Reveal>
  );
  const TextBlock = (
    <Reveal className="lg:w-1/2" delay={0.08}>
      <div className="flex h-full flex-col justify-center">
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-700"
          style={{ backgroundColor: `${accent}26` }}
        >
          Our story
        </span>
        <h2 className="mt-4 text-2xl sm:text-4xl font-bold tracking-tight text-gray-900 leading-tight">
          {story.title}
        </h2>
        <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed whitespace-pre-line">
          {story.body}
        </p>
      </div>
    </Reveal>
  );
  return (
    <section className={SHELL}>
      <div className={cn("flex flex-col gap-8 lg:gap-14 items-stretch", imageRight ? "lg:flex-row" : "lg:flex-row-reverse")}>
        {TextBlock}
        {ImageBlock}
      </div>
    </section>
  );
}

// ── Services teaser ────────────────────────────────────────
function ServicesTeaser({
  store,
  config,
  accent,
  accentText,
  onNavigate,
}: {
  store: StoreProfile;
  config: StoreHomepageConfig;
  accent: string;
  accentText: string;
  onNavigate: (href: string) => void;
}) {
  const top = [...store.services].sort((a, b) => Number(b.highlight) - Number(a.highlight)).slice(0, 3);
  return (
    <section className={SHELL}>
      <div className="rounded-3xl bg-gray-900 text-white overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr_1.4fr] gap-0">
          {/* Left intro */}
          <div className="p-8 sm:p-10 lg:p-12 flex flex-col justify-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: accent }}>
              <Wrench className="h-5 w-5" style={{ color: accentText }} />
            </div>
            <h2 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight">{config.services.title}</h2>
            <p className="mt-2 text-gray-300 leading-relaxed">{config.services.subtitle}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate("service")}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 cursor-pointer"
                style={{ backgroundColor: accent, color: accentText }}
              >
                View all services
                <ArrowRight className="h-4 w-4" />
              </button>
              {store.phone && (
                <button
                  type="button"
                  onClick={() => onNavigate("call")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Phone className="h-4 w-4" />
                  Call to book
                </button>
              )}
            </div>
          </div>
          {/* Right service cards */}
          <div className="bg-white/[0.04] p-6 sm:p-8 lg:p-10 space-y-3">
            {top.map((svc) => (
              <button
                key={svc.id}
                type="button"
                onClick={() => onNavigate("service")}
                className="group flex w-full items-center justify-between gap-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-4 text-left transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold truncate">{svc.name}</h3>
                    {svc.highlight && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: accent, color: accentText }}>
                        Popular
                      </span>
                    )}
                  </div>
                  {svc.description && (
                    <p className="mt-0.5 text-sm text-gray-400 line-clamp-1">{svc.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {svc.price != null && (
                    <span className="text-sm font-semibold text-white whitespace-nowrap">
                      {svc.price_from ? "from " : ""}${svc.price}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Gallery ────────────────────────────────────────────────
function GallerySection({ config }: { config: StoreHomepageConfig }) {
  const imgs = config.gallery.images;
  return (
    <section className={SHELL}>
      <Reveal>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-6">
          {config.gallery.title}
        </h2>
      </Reveal>
      <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 [column-fill:_balance]">
        {imgs.map((img, i) => (
          <Reveal key={img.id} delay={(i % 4) * 0.05} className="mb-4 break-inside-avoid">
            <figure className="group relative overflow-hidden rounded-2xl ring-1 ring-gray-200/70 bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.caption || ""} className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              {img.caption && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-sm font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.caption}
                </figcaption>
              )}
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ── Featured carousels ─────────────────────────────────────
function FeaturedCarouselsSection({
  store,
  config,
  onOpenCollection,
}: {
  store: StoreProfile;
  config: StoreHomepageConfig;
  onOpenCollection: (categoryName: string) => void;
}) {
  const slots = [config.featured_carousels.slot1, config.featured_carousels.slot2]
    .filter((id): id is string => Boolean(id))
    .map((id) => store.categories.find((c) => c.id === id))
    .filter((c) => c !== undefined && c.products.length > 0);

  if (slots.length === 0) return null;

  const perRow = config.featured_carousels.per_row;
  const gridCols =
    perRow === 8
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  return (
    <section className={cn(SHELL, "space-y-12")}>
      {slots.map((cat) => (
        <Reveal key={cat!.id}>
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{cat!.name}</h3>
              <button
                type="button"
                onClick={() => onOpenCollection(cat!.name)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                View all {cat!.products.length} products
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className={cn("grid gap-3 sm:gap-4", gridCols)}>
              {cat!.products.slice(0, perRow).map((product, i) => (
                <ProductCard key={product.id} product={product} priority={i < 4} />
              ))}
            </div>
          </div>
        </Reveal>
      ))}
    </section>
  );
}

// ── Visit us ───────────────────────────────────────────────
function VisitSection({
  store,
  config,
  accent,
  accentText,
  onNavigate,
}: {
  store: StoreProfile;
  config: StoreHomepageConfig;
  accent: string;
  accentText: string;
  onNavigate: (href: string) => void;
}) {
  const status = openStatusFor(store.opening_hours);
  const todayKey = DAY_KEYS[new Date().getDay()];
  return (
    <section className={SHELL}>
      <Reveal>
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Contact + map CTA */}
          <div className="rounded-3xl border border-gray-200 bg-white p-7 sm:p-9 flex flex-col">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{config.visit.title}</h2>
            <div className="mt-6 space-y-4">
              {store.address && (
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <MapPin className="h-4 w-4 text-gray-600" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Find us at</p>
                    <p className="text-sm text-gray-900 mt-0.5">{store.address}</p>
                  </div>
                </div>
              )}
              {store.phone && (
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <Phone className="h-4 w-4 text-gray-600" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Call us</p>
                    <a href={`tel:${store.phone}`} className="text-sm text-gray-900 mt-0.5 hover:underline">{store.phone}</a>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate("products")}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 cursor-pointer"
                style={{ backgroundColor: accent, color: accentText }}
              >
                Browse the range
                <ArrowRight className="h-4 w-4" />
              </button>
              {store.address && (
                <button
                  type="button"
                  onClick={() => onNavigate("directions")}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <Navigation className="h-4 w-4" />
                  Get directions
                </button>
              )}
            </div>
          </div>

          {/* Opening hours */}
          <div className="rounded-3xl border border-gray-200 bg-gray-50 p-7 sm:p-9">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                Opening hours
              </h3>
              {status && config.badges.show_open_status && (
                <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", status.open ? "bg-green-50 text-green-700" : "bg-gray-200 text-gray-600")}>
                  {status.open ? "Open now" : "Closed"}
                </span>
              )}
            </div>
            <div className="space-y-1">
              {WEEK_ORDER.map((day) => {
                const h = store.opening_hours?.[day];
                const isToday = day === todayKey;
                return (
                  <div
                    key={day}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                      isToday ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600",
                    )}
                  >
                    <span className="capitalize">{day}</span>
                    <span>{!h || h.closed ? <span className="text-gray-400">Closed</span> : `${h.open} – ${h.close}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────
function HomeFooter({
  store,
  accent,
  onNavigate,
}: {
  store: StoreProfile;
  accent: string;
  onNavigate: (href: string) => void;
}) {
  const social = store.social_links || {};
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className={cn(SHELL, "py-10")}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex items-center gap-3">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt={store.store_name} className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                <StoreIcon className="h-5 w-5 text-gray-500" />
              </span>
            )}
            <div>
              <p className="text-sm font-bold text-gray-900">{store.store_name}</p>
              {store.address && <p className="text-xs text-gray-500">{store.address}</p>}
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
            <button type="button" onClick={() => onNavigate("products")} className="hover:text-gray-900 cursor-pointer">Shop</button>
            <button type="button" onClick={() => onNavigate("service")} className="hover:text-gray-900 cursor-pointer">Service</button>
            <button type="button" onClick={() => onNavigate("rentals")} className="hover:text-gray-900 cursor-pointer">Rentals</button>
            <button type="button" onClick={() => onNavigate("about")} className="hover:text-gray-900 cursor-pointer">About</button>
          </nav>

          <div className="flex items-center gap-2">
            {social.instagram && (
              <a href={social.instagram} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors">
                <Instagram className="h-4 w-4" />
              </a>
            )}
            {social.facebook && (
              <a href={social.facebook} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors">
                <Facebook className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100 pt-6">
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} {store.store_name}. All rights reserved.
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
            Powered by Yellow Jersey
          </span>
        </div>
      </div>
    </footer>
  );
}

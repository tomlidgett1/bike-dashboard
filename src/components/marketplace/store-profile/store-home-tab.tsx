"use client";

import * as React from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Phone,
  MapPin,
  Clock,
  Loader2,
  MessageCircle,
  Navigation,
  Settings2,
  Store as StoreIcon,
  X,
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
import { ServiceCard } from "@/components/marketplace/store-profile/service-card";
import { ProductCard } from "@/components/marketplace/product-card";
import { useProductImpressions } from "@/lib/tracking/store-analytics";

// ============================================================
// Store Home Tab — the public landing page for a bicycle store.
// Renders a polished default from the store's own data and layers
// the owner's homepage_config customisations on top.
// ============================================================

interface StoreHomeTabProps {
  store: StoreProfile;
  isOwnProfile?: boolean;
  trackAnalytics?: boolean;
  contentShell?: string;
  /** Navigate by CTA href (tab key, 'call', 'directions', or absolute URL). */
  onNavigate: (href: string) => void;
  /** Open the Products tab filtered to a category. */
  onOpenCollection: (categoryName: string) => void;
  /** Open the shared store hours sheet/dialog. */
  onOpenHours?: () => void;
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
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

const DEFAULT_CONTENT_SHELL = "px-5 sm:px-8 lg:px-10";
const StoreHomeShellContext = React.createContext(DEFAULT_CONTENT_SHELL);
const MESSAGE_DIALOG_CLOSE_MS = 220;

function useStoreHomeShell() {
  return React.useContext(StoreHomeShellContext);
}

export function StoreHomeTab({
  store,
  isOwnProfile,
  trackAnalytics,
  contentShell = DEFAULT_CONTENT_SHELL,
  onNavigate,
  onOpenCollection,
  onOpenHours,
}: StoreHomeTabProps) {
  const [messageOpen, setMessageOpen] = React.useState(false);
  const handleCloseMessage = React.useCallback(() => setMessageOpen(false), []);
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
        <FeaturedCarouselsSection
          key="carousels"
          store={store}
          config={config}
          trackAnalytics={trackAnalytics}
          onOpenCollection={onOpenCollection}
        />
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
    <StoreHomeShellContext.Provider value={contentShell}>
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
          onMessageStore={() => setMessageOpen(true)}
          onOpenHours={onOpenHours}
          isOwnProfile={isOwnProfile}
        />

        <StoreMessageDialog
          open={messageOpen}
          storeName={store.store_name}
          accent={accent}
          accentText={accentText}
          onClose={handleCloseMessage}
        />

        {/* Ordered sections */}
        <div className="space-y-10 sm:space-y-14 py-8 sm:py-12">
          {config.section_order.map((key) => sectionRenderers[key]?.())}
        </div>

        {/* Store footer */}
        <HomeFooter store={store} accent={accent} onNavigate={onNavigate} />
      </div>
    </StoreHomeShellContext.Provider>
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
  onMessageStore,
  onOpenHours,
  isOwnProfile,
}: {
  store: StoreProfile;
  config: StoreHomepageConfig;
  accent: string;
  accentText: string;
  onPrimary: () => void;
  onSecondary: () => void;
  onMessageStore: () => void;
  onOpenHours?: () => void;
  isOwnProfile?: boolean;
}) {
  const shell = useStoreHomeShell();
  const { hero } = config;
  const status = openStatusFor(store.opening_hours);
  const heroImages = React.useMemo(() => {
    const urls = Array.isArray(hero.image_urls) ? hero.image_urls : [];
    const normalized = urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0);
    return normalized.length > 0 ? normalized.slice(0, 3) : hero.image_url ? [hero.image_url] : [];
  }, [hero.image_url, hero.image_urls]);

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
  const LightMessageBtn = (
    <button
      type="button"
      onClick={onMessageStore}
      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 cursor-pointer"
    >
      <MessageCircle className="h-4 w-4" />
      Message store
    </button>
  );
  const DarkMessageBtn = (
    <button
      type="button"
      onClick={onMessageStore}
      className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm px-6 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors cursor-pointer"
    >
      <MessageCircle className="h-4 w-4" />
      Message store
    </button>
  );

  // ── Split variant ──────────────────────────────────────
  if (hero.variant === "split") {
    return (
      <section className={cn(shell, "relative pt-10 sm:pt-14")}>
        {isOwnProfile && <EditButton />}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div>
            <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.05]">
              {hero.headline}
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-xl">
              {hero.subheadline}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {PrimaryBtn}
              {LightMessageBtn}
              {SecondaryBtn && (
                <span className="rounded-full border border-gray-200 hover:bg-gray-50">{SecondaryBtn}</span>
              )}
            </div>
            {config.badges.show_hours_on_hero && (
              <div className="mt-5">
                <HeroHoursCard store={store} status={status} onDark={false} onClick={onOpenHours} />
              </div>
            )}
          </div>
          <div
            className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-gray-100 ring-1 ring-gray-200/70 shadow-xl"
          >
            {heroImages.length > 0 ? (
              <HeroImageRotator images={heroImages} alt={store.store_name} />
            ) : (
              <HeroFallback store={store} accent={accent} />
            )}
          </div>
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
        <div className={cn(shell, "py-20 sm:py-28 text-center")}>
          <div
            className="mx-auto max-w-3xl"
          >
            <h1 className="mt-5 text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 leading-[1.04]">
              {hero.headline}
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-600 leading-relaxed mx-auto max-w-2xl">
              {hero.subheadline}
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {PrimaryBtn}
              {LightMessageBtn}
              {SecondaryBtn && (
                <span className="rounded-full border border-gray-200 hover:bg-gray-50">{SecondaryBtn}</span>
              )}
            </div>
            {config.badges.show_hours_on_hero && (
              <div className="mt-5 flex justify-center">
                <HeroHoursCard store={store} status={status} onDark={false} onClick={onOpenHours} />
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── Spotlight variant (default) ────────────────────────
  const alignCenter = hero.align === "center";
  return (
    <section className="relative">
      {isOwnProfile && <EditButton />}
      <div className="relative isolate min-h-[364px] sm:min-h-[600px] flex items-center overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 -z-10">
          {heroImages.length > 0 ? (
            <HeroImageRotator images={heroImages} alt="" />
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

        <div className={cn(shell, "w-full py-16")}>
          <div
            className={cn("max-w-2xl", alignCenter && "mx-auto text-center")}
          >
            <h1 className="mt-4 text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.04] drop-shadow-sm">
              {hero.headline}
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-white/85 leading-relaxed max-w-xl drop-shadow-sm" style={alignCenter ? { marginLeft: "auto", marginRight: "auto" } : undefined}>
              {hero.subheadline}
            </p>
            <div className={cn("mt-8 flex flex-wrap items-center gap-3", alignCenter && "justify-center")}>
              {PrimaryBtn}
              {DarkMessageBtn}
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
          </div>
        </div>

        {/* Today's hours — bottom corner overlay */}
        {config.badges.show_hours_on_hero && (
          <div className={cn(
            "absolute bottom-5 z-10",
            alignCenter ? "left-1/2 -translate-x-1/2" : "left-5 sm:left-8 lg:left-10"
          )}>
            <HeroHoursCard store={store} status={status} onDark onClick={onOpenHours} />
          </div>
        )}
      </div>
    </section>
  );
}

function StoreMessageDialog({
  open,
  storeName,
  accent,
  accentText,
  onClose,
}: {
  open: boolean;
  storeName: string;
  accent: string;
  accentText: string;
  onClose: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [phone, setPhone] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [messageHref, setMessageHref] = React.useState<string | null>(null);
  const [shouldRender, setShouldRender] = React.useState(open);
  const [isLeaving, setIsLeaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsLeaving(false);
      return;
    }

    if (!shouldRender) return;

    setIsLeaving(true);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setIsLeaving(false);
    }, MESSAGE_DIALOG_CLOSE_MS);

    return () => window.clearTimeout(timer);
  }, [open, shouldRender]);

  React.useEffect(() => {
    if (!open) return;
    setPhone("");
    setError(null);
    setSuccess(false);
    setMessageHref(null);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 120);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  React.useEffect(() => {
    if (!shouldRender) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldRender]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError("Enter your mobile number to continue.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const response = await fetch("/api/marketplace/store/message-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmedPhone }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "We could not set up messaging. Try again shortly.",
        );
      }

      const nextMessageHref =
        typeof data.messageHref === "string" && data.messageHref.startsWith("sms:")
          ? data.messageHref
          : typeof data.messageNumber === "string"
            ? `sms:${data.messageNumber.replace(/[^\d+]/g, "")}`
            : null;

      if (!nextMessageHref) {
        throw new Error("Messages is not configured for this store yet.");
      }

      setPhone("");
      setSuccess(true);
      setMessageHref(nextMessageHref);
      window.setTimeout(() => {
        window.location.href = nextMessageHref;
      }, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not set up messaging. Try again shortly.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <div
      data-state={isLeaving ? "closed" : "open"}
      className="store-message-overlay fixed inset-0 z-[120] flex items-end justify-center bg-black/45 px-0 backdrop-blur-sm sm:items-center sm:px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-state={isLeaving ? "closed" : "open"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-message-title"
        className="store-message-sheet max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl ring-1 ring-black/10 sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${accent}26` }}
            >
              <MessageCircle className="h-5 w-5 text-gray-900" />
            </span>
            <div>
              <h2 id="store-message-title" className="text-base font-semibold text-gray-900">
                Message {storeName}
              </h2>
              <p className="text-sm text-gray-500">One quick mobile check.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-7 text-center sm:pb-6">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accent}26` }}
            >
              <CheckCircle2 className="h-7 w-7 text-gray-900" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Opening Messages...</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              If Messages does not open automatically, use the button below.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {messageHref && (
                <a
                  href={messageHref}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: accent, color: accentText }}
                >
                  <MessageCircle className="h-4 w-4" />
                  Open Messages
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:pb-6">
            <p className="text-sm leading-relaxed text-gray-600">
              Enter your mobile first. We do not use it for marketing or account storage; it only creates the
              anti-spam route for this store message.
            </p>

            <div className="mt-5">
              <label htmlFor="store-message-phone" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Mobile number
              </label>
              <input
                ref={inputRef}
                id="store-message-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="0400 000 000"
                className="mt-2 h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900 focus:bg-white"
              />
              {error && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
              style={{ backgroundColor: accent, color: accentText }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function HeroImageRotator({ images, alt }: { images: string[]; alt: string }) {
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    setActiveIndex(0);
    if (images.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [images]);

  return (
    <>
      {images.map((src, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={index === activeIndex ? alt : ""}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out",
            index === activeIndex ? "opacity-100" : "opacity-0",
          )}
          loading={index === 0 ? "eager" : "lazy"}
          decoding="async"
        />
      ))}
    </>
  );
}

// ── Hero Hours Card ──────────────────────────────────────────
// Compact today's hours badge shown overlaid on the hero image
function HeroHoursCard({
  store,
  status,
  onDark = false,
  onClick,
}: {
  store: StoreProfile;
  status: { open: boolean; label: string } | null;
  onDark?: boolean;
  onClick?: () => void;
}) {
  const now = new Date();
  const todayKey = DAY_KEYS[now.getDay()];
  const todayHours = store.opening_hours?.[todayKey];
  if (!store.opening_hours || !todayHours) return null;

  const dayLabel = todayKey.charAt(0).toUpperCase() + todayKey.slice(1);
  const hoursText = todayHours.closed ? 'Closed today' : `${todayHours.open} – ${todayHours.close}`;

  const cardClassName = cn(
    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs",
    onClick && "cursor-pointer transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/50",
    onDark
      ? "bg-black/30 text-white backdrop-blur-md border border-white/10"
      : "bg-white/90 text-gray-800 backdrop-blur-sm border border-gray-200/60 shadow-sm",
  );

  const contents = (
    <>
      <Clock className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
      <span className="font-medium">{dayLabel}</span>
      <span className="opacity-70">·</span>
      <span>{hoursText}</span>
      {status && (
        <>
          <span className="opacity-40">·</span>
          <span className={cn(
            "flex items-center gap-1",
            onDark
              ? status.open ? "text-green-300" : "text-white/60"
              : status.open ? "text-green-600" : "text-gray-500",
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", status.open ? "bg-green-400" : "bg-gray-400")} />
            {status.open ? "Open now" : "Closed"}
          </span>
        </>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cardClassName}>
        {contents}
      </button>
    );
  }

  return (
    <div className={cardClassName}>{contents}</div>
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
  const shell = useStoreHomeShell();
  return (
    <section className={shell}>
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
  const shell = useStoreHomeShell();
  return (
    <section className={shell}>
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
  const shell = useStoreHomeShell();
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
        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-gray-900 leading-tight">
          {story.title}
        </h2>
        <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed whitespace-pre-line">
          {story.body}
        </p>
      </div>
    </Reveal>
  );
  return (
    <section className={shell}>
      <div className={cn("flex flex-col gap-8 lg:gap-14 items-stretch", imageRight ? "lg:flex-row" : "lg:flex-row-reverse")}>
        {TextBlock}
        {ImageBlock}
      </div>
    </section>
  );
}

// ── Services section — "Clean Checklist" cards ─────────────
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
  const services = React.useMemo(
    () => [...store.services].sort((a, b) => Number(b.highlight) - Number(a.highlight)),
    [store.services],
  );
  const shell = useStoreHomeShell();

  return (
    <section className={shell}>
      <Reveal>
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
              {config.services.title}
            </h2>
            {config.services.subtitle && (
              <p className="mt-1 text-gray-500 leading-relaxed">{config.services.subtitle}</p>
            )}
          </div>
          {store.phone && (
            <button
              type="button"
              onClick={() => onNavigate("call")}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 cursor-pointer"
            >
              <Phone className="h-4 w-4" />
              Call to book
            </button>
          )}
        </div>
      </Reveal>

      {/* Desktop / tablet grid */}
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((svc) => (
          <ServiceCard
            key={svc.id}
            service={svc}
            accent={accent}
            accentText={accentText}
            onBook={() => onNavigate("service")}
          />
        ))}
      </div>

      {/* Mobile: horizontal carousel — wide cards (67vw) so the next one peeks */}
      <div className="sm:hidden -mx-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-pl-5">
        <div className="flex items-stretch gap-3.5" style={{ minWidth: "min-content" }}>
          {/* Leading spacer */}
          <div className="w-5 flex-shrink-0" aria-hidden />
          {services.map((svc) => (
            <div key={svc.id} className="w-[67vw] flex-shrink-0 snap-start">
              <ServiceCard
                service={svc}
                accent={accent}
                accentText={accentText}
                onBook={() => onNavigate("service")}
              />
            </div>
          ))}
          {/* Trailing spacer */}
          <div className="w-5 flex-shrink-0" aria-hidden />
        </div>
      </div>
    </section>
  );
}

// ── Gallery ────────────────────────────────────────────────
function GallerySection({ config }: { config: StoreHomepageConfig }) {
  const imgs = config.gallery.images;
  const shell = useStoreHomeShell();
  return (
    <section className={shell}>
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
  trackAnalytics,
  onOpenCollection,
}: {
  store: StoreProfile;
  config: StoreHomepageConfig;
  trackAnalytics?: boolean;
  onOpenCollection: (categoryName: string) => void;
}) {
  const shell = useStoreHomeShell();
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
    <section className={cn(shell, "space-y-8")}>
      {slots.map((cat) => {
        const shown = cat!.products.slice(0, perRow);
        return (
          <FeaturedCarouselBlock
            key={cat!.id}
            category={cat!}
            products={shown}
            gridCols={gridCols}
            storeId={store.id}
            perRow={perRow}
            trackAnalytics={trackAnalytics}
            onOpenCollection={onOpenCollection}
          />
        );
      })}
    </section>
  );
}

function FeaturedCarouselBlock({
  category,
  products,
  gridCols,
  storeId,
  perRow,
  trackAnalytics,
  onOpenCollection,
}: {
  category: StoreProfile["categories"][number];
  products: StoreProfile["categories"][number]["products"];
  gridCols: string;
  storeId: string;
  perRow: number;
  trackAnalytics?: boolean;
  onOpenCollection: (categoryName: string) => void;
}) {
  const impressionContext = React.useMemo(
    () => ({
      section: "home_featured_carousel",
      categoryId: category.id,
      categoryName: category.name,
      perRow,
    }),
    [category.id, category.name, perRow],
  );
  const impressionRef = useProductImpressions(
    trackAnalytics ? storeId : null,
    products,
    impressionContext,
  );
  // Mobile: split the displayed slice across two independently-scrolling rows.
  // Interleaved so the first products fill the initial 2x2 view.
  const mobileRows = React.useMemo(
    () => [
      products.filter((_, i) => i % 2 === 0),
      products.filter((_, i) => i % 2 === 1),
    ],
    [products],
  );

  return (
    <Reveal>
      <div ref={impressionRef}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">{category.name}</h3>
          </div>
          <button
            type="button"
            onClick={() => onOpenCollection(category.name)}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            View all {category.products.length}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Desktop / tablet grid */}
        <div className={cn("hidden sm:grid gap-3 sm:gap-4", gridCols)}>
          {products.map((product, i) => (
            <div key={product.id} data-analytics-product-id={product.id}>
              <ProductCard
                product={product}
                priority={i < 4}
                hideStoreMeta
                storeId={storeId}
              />
            </div>
          ))}
        </div>

        {/* Mobile: two independently-scrolling rows (~2 cards visible, all products).
            items-start + hideStoreMeta keep every card the same height so no card
            leaves dead space when its neighbours are still loading. */}
        <div className="sm:hidden space-y-3">
          {mobileRows.map((row, ri) => (
            <div
              key={ri}
              className="-mx-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-pl-5"
            >
              <div className="flex items-start gap-3" style={{ minWidth: "min-content" }}>
                <div className="w-5 flex-shrink-0" aria-hidden />
                {row.map((product, i) => (
                  // Fixed slot height (square image + info row) so off-screen cards
                  // that are still lazy-loading can't stretch the row and leave gaps.
                  <div
                    key={product.id}
                    data-analytics-product-id={product.id}
                    className="w-[42vw] h-[calc(42vw_+_40px)] overflow-hidden flex-shrink-0 snap-start"
                  >
                    <ProductCard
                      product={product}
                      priority={ri === 0 && i < 2}
                      hideStoreMeta
                      storeId={storeId}
                    />
                  </div>
                ))}
                <div className="w-5 flex-shrink-0" aria-hidden />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
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
  const shell = useStoreHomeShell();
  const status = openStatusFor(store.opening_hours);
  const todayKey = DAY_KEYS[new Date().getDay()];
  return (
    <section className={shell}>
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
  const shell = useStoreHomeShell();
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className={cn(shell, "py-10")}>
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

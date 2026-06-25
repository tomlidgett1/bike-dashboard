"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Phone,
  MapPin,
  Clock,
  Wrench,
  Bike,
  Package,
  Instagram,
  Facebook,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { resolveLivePrice, sortProductsSaleFirst } from "@/lib/marketplace/pricing";
import { resolveHomepageConfig } from "@/lib/marketplace/homepage-config";
import { AtelierProductCard } from "./atelier-product-card";
import { STUDIO, DISPLAY_FONT } from "./atelier-theme";
import type {
  StoreProfile,
  OpeningHours,
} from "@/lib/types/store";
import type { StoreAnalyticsEventType } from "@/lib/tracking/store-analytics";

const DAY_KEYS: (keyof OpeningHours)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

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

export interface AtelierHomeTabProps {
  store: StoreProfile;
  isOwnProfile?: boolean;
  trackAnalytics?: boolean;
  onNavigate: (href: string) => void;
  onOpenCollection: (categoryName: string) => void;
  onOpenHours?: () => void;
  onTrackBehaviour?: (eventType: StoreAnalyticsEventType, metadata?: Record<string, unknown>) => void;
}

export function AtelierHomeTab({
  store,
  onNavigate,
  onOpenCollection,
  onOpenHours,
}: AtelierHomeTabProps) {
  const config = React.useMemo(() => resolveHomepageConfig(store.homepage_config, store), [store]);
  const heroImages = React.useMemo(() => {
    const urls = Array.isArray(config.hero.image_urls) ? config.hero.image_urls : [];
    const norm = urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    return norm.length > 0 ? norm.slice(0, 3) : config.hero.image_url ? [config.hero.image_url] : [];
  }, [config.hero.image_url, config.hero.image_urls]);

  const openStatus = openStatusFor(store.opening_hours);
  const headline = config.hero.headline || `Welcome to ${store.store_name}`;
  const subheadline = config.hero.subheadline ||
    (store.description?.trim() ? store.description.trim().slice(0, 180) : null);

  // Shop by Category — image tiles for top categories
  const categories = React.useMemo(() => {
    const cats = store.categories
      .filter((c) => c.store_page !== "bikes" && c.products.length > 0)
      .sort((a, b) => b.products.length - a.products.length)
      .slice(0, 5);
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      count: c.products.length,
      image: firstProductImage(c.products),
    }));
  }, [store.categories]);

  // Bike Collections — bike type links
  const bikeCollections = React.useMemo(() => {
    const bikesCat = store.categories.find((c) => c.store_page === "bikes" && c.products.length > 0);
    if (bikesCat) return [{ name: bikesCat.name, count: bikesCat.products.length }];
    // derive bike types from subcategories
    const types = new Set<string>();
    for (const c of store.categories) {
      for (const p of c.products) {
        if (p.bike_type) types.add(p.bike_type);
        else if (p.marketplace_subcategory) types.add(p.marketplace_subcategory);
      }
    }
    return Array.from(types).slice(0, 6).map((t) => ({ name: t, count: 0 }));
  }, [store.categories]);

  // Featured products
  const featured = React.useMemo(() => {
    const all = store.categories.flatMap((c) => c.products);
    const seen = new Set<string>();
    const unique: typeof all = [];
    for (const p of all) {
      if (!seen.has(p.id)) { seen.add(p.id); unique.push(p); }
    }
    return sortProductsSaleFirst(unique).slice(0, 8);
  }, [store.categories]);

  const onSaleCount = React.useMemo(
    () => featured.filter((p) => resolveLivePrice(p).onSale).length,
    [featured],
  );

  const highlightServices = store.services.slice(0, 3);
  const directionsUrl = store.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
    : null;

  return (
    <div style={{ backgroundColor: STUDIO.surface, color: STUDIO.ink, fontFamily: "var(--font-sans)" }}>
      {/* ── HERO ───────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="relative flex min-h-[520px] items-center justify-center sm:min-h-[600px]">
          {heroImages[0] ? (
            <Image
              src={heroImages[0]}
              alt={store.store_name}
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
          ) : (
            <HeroFallback store={store} />
          )}
          {/* Dark overlay */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)" }} />

          {/* Centered copy */}
          <div className="relative z-10 mx-auto max-w-3xl px-5 py-20 text-center sm:px-8">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="text-[11px] uppercase tracking-[0.24em] text-white/80"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {store.address ? extractLocality(store.address) : "Premier Cycling Destination"}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.05, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="mt-4 text-[clamp(2.4rem,6vw,4.5rem)] leading-[1.02] tracking-[-0.02em] text-white"
              style={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}
            >
              {headline}
            </motion.h1>
            {subheadline && (
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.15, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                {subheadline}
              </motion.p>
            )}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              <button
                type="button"
                onClick={() => onNavigate(config.hero.primary_cta.href || "products")}
                className="group inline-flex items-center gap-2 px-8 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: "#fff", color: STUDIO.ink, borderRadius: 2, fontFamily: DISPLAY_FONT }}
              >
                {config.hero.primary_cta.label || "Shop Now"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              {openStatus && (
                <button
                  type="button"
                  onClick={onOpenHours}
                  className="inline-flex items-center gap-2 border px-6 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-white/10"
                  style={{ borderColor: "rgba(255,255,255,0.4)", borderRadius: 2, fontFamily: DISPLAY_FONT }}
                >
                  <Clock className="h-4 w-4" />
                  {openStatus.label}
                </button>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── SHOP BY CATEGORY ──────────────────────────── */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <SectionHeading title="Shop by Category" />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpenCollection(c.name)}
                className="group relative aspect-[3/4] overflow-hidden"
                style={{ backgroundColor: STUDIO.surfaceAlt, borderRadius: 2 }}
              >
                {c.image ? (
                  <Image
                    src={c.image}
                    alt={c.name}
                    fill
                    sizes="(max-width: 640px) 50vw, 20vw"
                    className="object-cover opacity-90 transition-all duration-700 group-hover:scale-105 group-hover:opacity-100"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center" style={{ backgroundColor: STUDIO.surfaceAlt }}>
                    <Package className="h-7 w-7" style={{ color: STUDIO.faint }} />
                  </div>
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.7) 100%)" }} />
                <div className="absolute inset-x-0 bottom-0 p-4 text-left">
                  <p className="text-[15px] font-semibold text-white" style={{ fontFamily: DISPLAY_FONT }}>
                    {c.name}
                  </p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-white/70" style={{ fontFamily: DISPLAY_FONT }}>
                    {c.count} items
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── BIKE COLLECTIONS ──────────────────────────── */}
      {bikeCollections.length > 0 && (
        <section style={{ backgroundColor: STUDIO.surfaceAlt }}>
          <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-16 lg:px-12">
            <SectionHeading title="Bike Collections" />
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {bikeCollections.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => onNavigate("bikes")}
                  className="inline-flex items-center gap-2 px-6 py-3 text-[13px] font-medium uppercase tracking-[0.08em] transition-all hover:-translate-y-0.5"
                  style={{ backgroundColor: STUDIO.surface, color: STUDIO.ink, border: `1px solid ${STUDIO.line}`, borderRadius: 999, fontFamily: DISPLAY_FONT }}
                >
                  {b.name}
                  {b.count > 0 && <span style={{ color: STUDIO.muted }}>({b.count})</span>}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FEATURED PRODUCTS ─────────────────────────── */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="flex items-end justify-between gap-6">
            <SectionHeading title="Featured Products" />
            <button
              type="button"
              onClick={() => onNavigate("products")}
              className="group hidden items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] transition-colors hover:opacity-60 sm:flex"
              style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}
            >
              View all
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
            {featured.map((p, i) => (
              <AtelierProductCard
                key={p.id}
                product={p}
                storeId={store.id}
                storeName={store.store_name}
                priority={i < 4}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── SALE PROMO BAND ───────────────────────────── */}
      {onSaleCount > 0 && (
        <section style={{ backgroundColor: STUDIO.ink }}>
          <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-6 px-5 py-12 text-center sm:flex-row sm:px-8 sm:py-14 sm:text-left lg:px-12">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: STUDIO.sale, fontFamily: DISPLAY_FONT, fontWeight: 600 }}>
                On Sale Now
              </p>
              <h2 className="mt-2 text-2xl text-white sm:text-3xl" style={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
                Save on selected gear
              </h2>
              <p className="mt-1 text-sm text-white/70" style={{ fontFamily: DISPLAY_FONT }}>
                {onSaleCount} featured {onSaleCount === 1 ? "deal" : "deals"} available this week.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("products")}
              className="group inline-flex shrink-0 items-center gap-2 px-7 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: "#fff", color: STUDIO.ink, borderRadius: 2, fontFamily: DISPLAY_FONT }}
            >
              Shop Sale
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </section>
      )}

      {/* ── SERVICES TRIO ──────────────────────────────── */}
      {highlightServices.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <SectionHeading title="Let us help you" />
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {highlightServices.map((s) => (
              <ServiceCard key={s.id} service={s} onBook={() => onNavigate("service")} />
            ))}
          </div>
          {store.phone && (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 py-6 text-center sm:flex-row sm:gap-5">
              <p className="text-sm" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
                Need something specific? Give us a call.
              </p>
              <a
                href={`tel:${store.phone.replace(/\s/g, "")}`}
                onClick={() => onNavigate("call")}
                className="inline-flex items-center gap-2 px-6 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: STUDIO.ink, color: "#fff", borderRadius: 2, fontFamily: DISPLAY_FONT }}
              >
                <Phone className="h-4 w-4" />
                {store.phone}
              </a>
            </div>
          )}
        </section>
      )}

      {/* ── VISIT / CONTACT ────────────────────────────── */}
      {(store.address || store.phone) && (
        <section style={{ backgroundColor: STUDIO.surfaceAlt }}>
          <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-5 py-16 sm:grid-cols-3 sm:px-8 sm:py-20 lg:px-12">
            {store.address && (
              <VisitCard icon={MapPin} label="Visit Us" value={store.address} href={directionsUrl ?? undefined} onClick={() => onNavigate("directions")} />
            )}
            {store.phone && (
              <VisitCard icon={Phone} label="Call Us" value={store.phone} href={`tel:${store.phone.replace(/\s/g, "")}`} onClick={() => onNavigate("call")} />
            )}
            {openStatus && (
              <VisitCard icon={Clock} label="Opening Hours" value={openStatus.label} onClick={onOpenHours} />
            )}
          </div>
        </section>
      )}

      {/* ── BRAND PARTNERS ─────────────────────────────── */}
      {store.brands.filter((b) => b.is_active && b.logo_url).length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-16 lg:px-12">
          <SectionHeading title="Our Trusted Partners" />
          <div className="mt-8 grid grid-cols-3 items-center gap-6 sm:grid-cols-4 md:grid-cols-6">
            {store.brands
              .filter((b) => b.is_active && b.logo_url)
              .sort((a, b) => a.display_order - b.display_order)
              .slice(0, 12)
              .map((b) => (
                <div key={b.id} className="flex aspect-[5/3] items-center justify-center p-2" style={{ backgroundColor: STUDIO.surface, border: `1px solid ${STUDIO.line}`, borderRadius: 2 }}>
                  {b.logo_url ? (
                    <div className="relative h-full w-full">
                      <Image
                        src={b.logo_url}
                        alt={b.name}
                        fill
                        className="object-contain opacity-70 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
                        sizes="(max-width: 640px) 28vw, 140px"
                      />
                    </div>
                  ) : (
                    <span className="text-xs font-medium" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>{b.name}</span>
                  )}
                </div>
              ))}
          </div>
        </section>
      )}

      {/* ── FOOTER ────────────────────────────────────── */}
      <AtelierFooter store={store} onNavigate={onNavigate} />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center">
      <h2 className="text-2xl tracking-[-0.01em] sm:text-3xl" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>
        {title}
      </h2>
    </div>
  );
}

function ServiceCard({
  service,
  onBook,
}: {
  service: StoreProfile["services"][number];
  onBook: () => void;
}) {
  const priceLabel = service.price != null
    ? service.price_from
      ? `from $${service.price.toLocaleString("en-AU", { minimumFractionDigits: 0 })}`
      : `$${service.price.toLocaleString("en-AU", { minimumFractionDigits: 0 })}`
    : null;

  return (
    <button
      type="button"
      onClick={onBook}
      className="group flex h-full flex-col items-start p-6 text-left transition-all hover:-translate-y-0.5"
      style={{ backgroundColor: STUDIO.surfaceAlt, borderRadius: 4 }}
    >
      <div className="flex h-11 w-11 items-center justify-center" style={{ backgroundColor: STUDIO.ink, borderRadius: 999 }}>
        <Wrench className="h-5 w-5" style={{ color: "#fff" }} />
      </div>
      <h3 className="mt-4 text-lg" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 600 }}>
        {service.name}
      </h3>
      {service.description && (
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
          {service.description}
        </p>
      )}
      <div className="mt-auto flex w-full items-center justify-between pt-5">
        {priceLabel ? (
          <span className="text-[13px] font-semibold" style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}>{priceLabel}</span>
        ) : <span />}
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors group-hover:opacity-60" style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}>
          Learn More
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

function VisitCard({
  icon: Icon,
  label,
  value,
  href,
  onClick,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="flex h-full flex-col items-start p-6 transition-all" style={{ backgroundColor: STUDIO.surface, borderRadius: 4 }}>
      <div className="flex h-11 w-11 items-center justify-center" style={{ backgroundColor: STUDIO.surfaceAlt, borderRadius: 999 }}>
        <Icon className="h-5 w-5" style={{ color: STUDIO.ink }} />
      </div>
      <p className="mt-4 text-[11px] uppercase tracking-[0.14em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>{label}</p>
      <p className="mt-1 text-[15px]" style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT, fontWeight: 500 }}>{value}</p>
    </div>
  );
  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" onClick={onClick} className="group block hover:-translate-y-0.5 transition-transform">
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className="group block w-full text-left hover:-translate-y-0.5 transition-transform">
      {inner}
    </button>
  );
}

function AtelierFooter({
  store,
  onNavigate,
}: {
  store: StoreProfile;
  onNavigate: (href: string) => void;
}) {
  return (
    <footer style={{ backgroundColor: STUDIO.ink, color: "#fff" }}>
      <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-16 lg:px-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <h3 className="text-xl" style={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
              {store.store_name}
            </h3>
            {store.description && (
              <p className="mt-3 max-w-sm text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.65)", fontFamily: DISPLAY_FONT }}>
                {store.description.trim().slice(0, 140)}
              </p>
            )}
            {(store.social_links?.instagram || store.social_links?.facebook) && (
              <div className="mt-5 flex items-center gap-4">
                {store.social_links?.instagram && (
                  <a href={store.social_links.instagram} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70">
                    <Instagram className="h-5 w-5" />
                  </a>
                )}
                {store.social_links?.facebook && (
                  <a href={store.social_links.facebook} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70">
                    <Facebook className="h-5 w-5" />
                  </a>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.5)", fontFamily: DISPLAY_FONT }}>Shop</p>
            <ul className="mt-4 space-y-2.5">
              {[
                { label: "All Products", tab: "products" },
                { label: "Bikes", tab: "bikes" },
                { label: "Rentals", tab: "rentals" },
              ].map(({ label, tab }) => (
                <li key={tab}>
                  <button type="button" onClick={() => onNavigate(tab)} className="text-sm transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.8)", fontFamily: DISPLAY_FONT }}>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.5)", fontFamily: DISPLAY_FONT }}>Store</p>
            <ul className="mt-4 space-y-2.5">
              {[
                { label: "Service", tab: "service" },
                { label: "About Us", tab: "about" },
              ].map(({ label, tab }) => (
                <li key={tab}>
                  <button type="button" onClick={() => onNavigate(tab)} className="text-sm transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.8)", fontFamily: DISPLAY_FONT }}>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.5)", fontFamily: DISPLAY_FONT }}>Contact</p>
            <ul className="mt-4 space-y-2.5">
              {store.address && (
                <li className="text-sm" style={{ color: "rgba(255,255,255,0.8)", fontFamily: DISPLAY_FONT }}>{store.address}</li>
              )}
              {store.phone && (
                <li>
                  <a href={`tel:${store.phone.replace(/\s/g, "")}`} className="text-sm transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.8)", fontFamily: DISPLAY_FONT }}>
                    {store.phone}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
          <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.5)", fontFamily: DISPLAY_FONT }}>
            © {new Date().getFullYear()} {store.store_name}
          </p>
          <a href="/marketplace" className="text-[11px] uppercase tracking-[0.12em] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.5)", fontFamily: DISPLAY_FONT }}>
            Yellow Jersey Marketplace
          </a>
        </div>
      </div>
    </footer>
  );
}

function HeroFallback({ store }: { store: StoreProfile }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #1f1f1f 0%, #111111 100%)" }}
    >
      <Bike className="h-24 w-24" style={{ color: "rgba(255,255,255,0.15)" }} />
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────

function firstProductImage(products: StoreProfile["categories"][number]["products"]): string | null {
  for (const p of products) {
    const url = p.card_url || p.primary_image_url;
    if (url && !url.startsWith("blob:")) return url;
  }
  return null;
}

function extractLocality(address: string): string {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || address;
}

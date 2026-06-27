"use client";

import * as React from "react";
import Image from "next/image";
import {
  Phone,
  MapPin,
  ChevronRight,
  Wrench,
  Bike,
  Star,
  Clock,
  Check,
  Gift,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { BundleOfferCard } from "@/components/marketplace/store-profile/bundle-offer-card";
import { STUDIO, DISPLAY_FONT } from "./atelier-theme";
import type {
  StoreProfile,
  OpeningHours,
  StoreService,
  StoreRental,
} from "@/lib/types/store";

const DAY_KEYS: (keyof OpeningHours)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];
const WEEK_ORDER: (keyof OpeningHours)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function moneyFull(n: number): string {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ════════════════════════════════════════════════════════════
// SERVICE
// ════════════════════════════════════════════════════════════

export function AtelierServiceTab({
  store,
  onCall,
}: {
  store: StoreProfile;
  onCall: () => void;
}) {
  const sorted = [...store.services].sort((a, b) => Number(b.highlight) - Number(a.highlight));

  return (
    <div style={{ backgroundColor: STUDIO.surface, color: STUDIO.ink, minHeight: "60vh" }}>
      <PageHeader title="Services" subtitle="Workshop & repairs" />
      <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-16 lg:px-12">
        {sorted.length === 0 ? (
          <EmptyState icon={Wrench} title="No services listed" body="This store hasn't listed any services yet." />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((s) => (
              <ServiceDetailCard key={s.id} service={s} />
            ))}
          </div>
        )}

        {store.phone && sorted.length > 0 && (
          <div
            className="mt-12 flex flex-col items-center justify-between gap-5 p-8 text-center sm:flex-row sm:text-left"
            style={{ backgroundColor: STUDIO.ink, borderRadius: 4 }}
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "#fff", opacity: 0.7, fontFamily: DISPLAY_FONT }}>
                Book a service
              </p>
              <h3 className="mt-2 text-2xl text-white" style={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
                Need a repair or a tune-up?
              </h3>
              <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.7)", fontFamily: DISPLAY_FONT }}>
                Call {store.store_name} to book your bike in with the workshop.
              </p>
            </div>
            <button
              type="button"
              onClick={onCall}
              className="group inline-flex shrink-0 items-center gap-2 px-7 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: "#fff", color: STUDIO.ink, borderRadius: 2, fontFamily: DISPLAY_FONT }}
            >
              <Phone className="h-4 w-4" />
              {store.phone}
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceDetailCard({ service }: { service: StoreService }) {
  const priceLabel = service.price != null
    ? service.price_from ? `from ${formatMoney(service.price)}` : formatMoney(service.price)
    : null;
  return (
    <div className="flex h-full flex-col p-6" style={{ backgroundColor: STUDIO.surfaceAlt, borderRadius: 4 }}>
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center" style={{ backgroundColor: STUDIO.ink, borderRadius: 999 }}>
          <Wrench className="h-5 w-5" style={{ color: "#fff" }} />
        </div>
        {service.highlight && (
          <span className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ backgroundColor: STUDIO.ink, color: "#fff", borderRadius: 2, fontFamily: DISPLAY_FONT }}>
            Featured
          </span>
        )}
      </div>
      <h3 className="mt-4 text-lg" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 600 }}>
        {service.name}
      </h3>
      {service.description && (
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
          {service.description}
        </p>
      )}
      {service.includes && service.includes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {service.includes.slice(0, 5).map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: STUDIO.inkSoft, fontFamily: DISPLAY_FONT }}>
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: STUDIO.ink }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between border-t pt-5" style={{ borderColor: STUDIO.line }}>
        {service.duration_minutes != null && (
          <span className="text-[11px] uppercase tracking-[0.1em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
            {service.duration_minutes} min
          </span>
        )}
        {priceLabel && (
          <span className="ml-auto text-[15px] font-semibold" style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}>
            {priceLabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// RENTALS
// ════════════════════════════════════════════════════════════

export function AtelierRentalsTab({
  store,
  onCall,
}: {
  store: StoreProfile;
  onCall: () => void;
}) {
  const rentals = store.rentals.filter((r) => r.is_available !== false);
  return (
    <div style={{ backgroundColor: STUDIO.surface, color: STUDIO.ink, minHeight: "60vh" }}>
      <PageHeader title="Rentals" subtitle="Hire a bike for the day or the week" />
      <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-16 lg:px-12">
        {rentals.length === 0 ? (
          <EmptyState icon={Bike} title="No rentals available" body="This store doesn't have any bikes for hire right now." />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rentals.map((r) => (
              <RentalCard key={r.id} rental={r} onCall={onCall} />
            ))}
          </div>
        )}

        {store.phone && rentals.length > 0 && (
          <div
            className="mt-12 flex flex-col items-center justify-between gap-5 p-8 text-center sm:flex-row sm:text-left"
            style={{ backgroundColor: STUDIO.surfaceAlt, border: `1px solid ${STUDIO.line}`, borderRadius: 4 }}
          >
            <div>
              <h3 className="text-xl" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>
                Check availability & book
              </h3>
              <p className="mt-1 text-sm" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
                Call {store.store_name} to reserve a rental.
              </p>
            </div>
            <button
              type="button"
              onClick={onCall}
              className="inline-flex shrink-0 items-center gap-2 px-7 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: STUDIO.ink, color: "#fff", borderRadius: 2, fontFamily: DISPLAY_FONT }}
            >
              <Phone className="h-4 w-4" />
              {store.phone}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RentalCard({ rental, onCall }: { rental: StoreRental; onCall: () => void }) {
  const hourly = rental.price_per_hour != null ? moneyFull(rental.price_per_hour) : null;
  const daily = rental.price_per_day != null ? moneyFull(rental.price_per_day) : null;
  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ backgroundColor: STUDIO.surfaceAlt, border: `1px solid ${STUDIO.line}`, borderRadius: 4 }}>
      <div className="relative aspect-[16/10] overflow-hidden" style={{ backgroundColor: STUDIO.surface }}>
        {rental.image_url ? (
          <Image src={rental.image_url} alt={rental.name} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center" style={{ backgroundColor: STUDIO.surfaceAlt }}>
            <Bike className="h-9 w-9" style={{ color: STUDIO.faint }} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 600 }}>{rental.name}</h3>
        {rental.description && (
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
            {rental.description}
          </p>
        )}
        <div className="mt-auto flex items-center gap-6 border-t pt-4" style={{ borderColor: STUDIO.line }}>
          {hourly && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>Hourly</p>
              <p className="text-[14px] font-semibold" style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}>{hourly}</p>
            </div>
          )}
          {daily && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>Daily</p>
              <p className="text-[14px] font-semibold" style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}>{daily}</p>
            </div>
          )}
          <button
            type="button"
            onClick={onCall}
            className="ml-auto text-[12px] font-semibold uppercase tracking-[0.06em] transition-opacity hover:opacity-60"
            style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}
          >
            Enquire →
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ABOUT
// ════════════════════════════════════════════════════════════

export function AtelierAboutTab({
  store,
  onOpenHours,
}: {
  store: StoreProfile;
  onOpenHours?: () => void;
}) {
  const todayKey = DAY_KEYS[new Date().getDay()];
  const description = store.description?.trim() ||
    `${store.store_name}${store.store_type ? ` — ${store.store_type}` : ""}. Visit us in store or get in touch for products, rentals and servicing.`;
  const directionsUrl = store.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
    : null;
  const hasHours = Boolean(store.opening_hours);

  return (
    <div style={{ backgroundColor: STUDIO.surface, color: STUDIO.ink, minHeight: "60vh" }}>
      <PageHeader title="About Us" subtitle={store.store_name} />
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-16 lg:px-12">
        <p className="text-base leading-[1.8]" style={{ color: STUDIO.inkSoft, fontFamily: DISPLAY_FONT }}>
          {description}
        </p>

        {store.rating != null && (
          <div className="mt-6 flex items-center gap-2">
            <Star className="h-5 w-5" style={{ color: STUDIO.ink, fill: STUDIO.ink }} />
            <span className="text-base font-semibold" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink }}>
              {store.rating.toFixed(1)}
            </span>
            {store.review_count != null && (
              <span className="text-sm" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
                · {store.review_count} reviews
              </span>
            )}
          </div>
        )}

        {(store.address || store.phone) && (
          <section className="mt-12">
            <h2 className="text-xs uppercase tracking-[0.14em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>Contact</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {store.address && (
                <ContactCard icon={MapPin} label="Address" value={store.address} href={directionsUrl ?? undefined} onClick={() => {}} />
              )}
              {store.phone && (
                <ContactCard icon={Phone} label="Phone" value={store.phone} href={`tel:${store.phone.replace(/\s/g, "")}`} onClick={() => {}} />
              )}
            </div>
          </section>
        )}

        {hasHours && (
          <section className="mt-12">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.14em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>Opening Hours</h2>
              <button
                type="button"
                onClick={onOpenHours}
                className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] transition-opacity hover:opacity-60"
                style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}
              >
                <Clock className="h-3.5 w-3.5" />
                Today
              </button>
            </div>
            <div className="mt-4 overflow-hidden" style={{ border: `1px solid ${STUDIO.line}`, borderRadius: 4 }}>
              {WEEK_ORDER.map((day, i) => {
                const h = store.opening_hours?.[day];
                const isToday = day === todayKey;
                const closed = !h || h.closed;
                return (
                  <div
                    key={day}
                    className="flex items-center justify-between px-5 py-3.5"
                    style={{
                      backgroundColor: isToday ? STUDIO.surfaceAlt : STUDIO.surface,
                      borderBottom: i < WEEK_ORDER.length - 1 ? `1px solid ${STUDIO.lineSoft}` : "none",
                    }}
                  >
                    <span className="capitalize" style={{ color: isToday ? STUDIO.ink : STUDIO.inkSoft, fontFamily: DISPLAY_FONT, fontWeight: isToday ? 600 : 400 }}>
                      {day}
                      {isToday && <span className="ml-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: STUDIO.muted }}>Today</span>}
                    </span>
                    <span className="tabular-nums text-[13px]" style={{ color: closed ? STUDIO.faint : STUDIO.ink, fontFamily: DISPLAY_FONT }}>
                      {closed ? "Closed" : `${h.open} — ${h.close}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {store.brands.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs uppercase tracking-[0.14em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>Brands we stock</h2>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {store.brands.map((b) => (
                <span key={b.id} className="px-4 py-2 text-[12px] font-medium uppercase tracking-[0.06em]" style={{ border: `1px solid ${STUDIO.line}`, color: STUDIO.inkSoft, borderRadius: 2, fontFamily: DISPLAY_FONT }}>
                  {b.name}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ContactCard({
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
  onClick: () => void;
}) {
  const inner = (
    <div className="flex h-full flex-col p-5 transition-all" style={{ backgroundColor: STUDIO.surfaceAlt, borderRadius: 4 }}>
      <div className="flex h-10 w-10 items-center justify-center" style={{ backgroundColor: STUDIO.surface, border: `1px solid ${STUDIO.line}`, borderRadius: 999 }}>
        <Icon className="h-4 w-4" style={{ color: STUDIO.ink }} />
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.14em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>{label}</p>
      <p className="mt-1 text-[14px]" style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT, fontWeight: 500 }}>{value}</p>
    </div>
  );
  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" onClick={onClick} className="group block transition-transform hover:-translate-y-0.5">
        {inner}
      </a>
    );
  }
  return <div>{inner}</div>;
}

// ════════════════════════════════════════════════════════════
// OFFERS
// ════════════════════════════════════════════════════════════

export function AtelierOffersTab({
  store,
  onCall,
}: {
  store: StoreProfile;
  onCall: () => void;
}) {
  const offers = store.offers ?? [];

  return (
    <div style={{ backgroundColor: STUDIO.surface, color: STUDIO.ink, minHeight: "60vh" }}>
      <PageHeader title="Offers" subtitle="Buy one, get extras free" />
      <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-16 lg:px-12">
        {offers.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="No offers right now"
            body="This store hasn't published any bundle offers yet."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((offer, index) => (
              <BundleOfferCard
                key={offer.id}
                offer={offer}
                accent="#ffde59"
                accentText="#0a0a0a"
                backgroundIndex={index}
                className="h-full w-full"
                onClaim={store.phone ? onCall : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── shared ───────────────────────────────────────────────

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ backgroundColor: STUDIO.surfaceAlt, borderBottom: `1px solid ${STUDIO.line}` }}>
      <div className="mx-auto max-w-[1400px] px-5 py-10 text-center sm:px-8 sm:py-14 lg:px-12">
        <h1 className="text-3xl tracking-[-0.01em] sm:text-4xl" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>{subtitle}</p>}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Wrench; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <Icon className="h-12 w-12" style={{ color: STUDIO.faint }} />
      <h3 className="mt-6 text-xl" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>{title}</h3>
      <p className="mt-2 max-w-sm text-sm" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>{body}</p>
    </div>
  );
}

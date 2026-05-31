"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Wrench, Clock, Star } from "lucide-react";
import type { StoreService } from "@/lib/types/store";

// ============================================================
// Services Section
// Rich service cards with pricing, duration and highlight tiers
// ============================================================

interface ServicesSectionProps {
  services: StoreService[];
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const hrs = minutes / 60;
  const rounded = Math.round(hrs * 2) / 2; // nearest 0.5
  return `~${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} hr${rounded >= 2 ? "s" : ""}`;
}

function formatPrice(price: number, priceFrom?: boolean): string {
  const formatted = price % 1 === 0
    ? `$${price.toFixed(0)}`
    : `$${price.toFixed(2)}`;
  return priceFrom ? `From ${formatted}` : formatted;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] as const } },
};

// ── Highlighted (featured) service card ──────────────────────
function HighlightCard({ service }: { service: StoreService }) {
  return (
    <motion.div variants={itemVariants}>
      <div className="relative flex gap-4 rounded-xl border border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50/60 p-5 overflow-hidden hover:shadow-sm transition-shadow">
        {/* Accent stripe */}
        <div className="absolute left-0 inset-y-0 w-1 bg-[#ffde59] rounded-l-xl" />

        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-yellow-700" />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-yellow-700">Featured</span>
              </div>
              <h3 className="text-sm font-bold text-gray-900 leading-snug">{service.name}</h3>
              {service.description && (
                <p className="mt-1 text-xs text-gray-600 leading-relaxed">{service.description}</p>
              )}
            </div>

            {/* Price */}
            {service.price != null && (
              <div className="flex-shrink-0 text-right">
                {service.price_from && (
                  <p className="text-[10px] text-gray-500 font-medium">From</p>
                )}
                <p className="text-xl font-extrabold text-gray-900 leading-none tracking-tight">
                  ${service.price % 1 === 0 ? service.price.toFixed(0) : service.price.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {/* Duration */}
          {service.duration_minutes != null && (
            <div className="mt-2.5 inline-flex items-center gap-1 text-xs text-gray-500 bg-white/80 rounded-full px-2.5 py-0.5 border border-yellow-100">
              <Clock className="h-3 w-3 flex-shrink-0" />
              {formatDuration(service.duration_minutes)}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Standard service card ────────────────────────────────────
function ServiceCard({ service }: { service: StoreService }) {
  const hasPrice = service.price != null;
  const hasDuration = service.duration_minutes != null;

  return (
    <motion.div variants={itemVariants} className="h-full">
      <div className="h-full flex flex-col rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
        {/* Top: icon + name + price */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
              <Wrench className="h-3.5 w-3.5 text-gray-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 leading-snug pt-0.5">{service.name}</h3>
          </div>
          {hasPrice && (
            <div className="flex-shrink-0 text-right">
              {service.price_from && (
                <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wide leading-none">From</p>
              )}
              <p className="text-sm font-bold text-gray-900 tabular-nums">
                ${service.price! % 1 === 0 ? service.price!.toFixed(0) : service.price!.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {/* Description */}
        {service.description && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 pl-[calc(2rem+10px)] flex-1">
            {service.description}
          </p>
        )}

        {/* Footer: duration */}
        {hasDuration && (
          <div className="mt-2.5 pl-[calc(2rem+10px)] flex items-center gap-1 text-xs text-gray-400">
            <Clock className="h-3 w-3 flex-shrink-0" />
            {formatDuration(service.duration_minutes!)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main export ──────────────────────────────────────────────
export function ServicesSection({ services }: ServicesSectionProps) {
  if (!services || services.length === 0) return null;

  const highlighted = services.filter((s) => s.highlight);
  const standard = services.filter((s) => !s.highlight);

  return (
    <section className="py-2 space-y-6">
      {/* Section header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Services</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {services.length} service{services.length !== 1 ? "s" : ""} available
        </p>
      </div>

      {/* Featured services */}
      {highlighted.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {highlighted.map((s) => (
            <HighlightCard key={s.id} service={s} />
          ))}
        </motion.div>
      )}

      {/* Standard services */}
      {standard.length > 0 && (
        <>
          {highlighted.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-widest flex-shrink-0">
                All services
              </span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
          )}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            {standard.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </motion.div>
        </>
      )}

      {/* Price note if any service has no price */}
      {services.some((s) => s.price == null) && (
        <p className="text-xs text-gray-400">
          * Some service prices are subject to inspection — contact us for a quote.
        </p>
      )}
    </section>
  );
}

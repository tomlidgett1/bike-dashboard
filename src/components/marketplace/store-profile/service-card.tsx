"use client";

import * as React from "react";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoreService } from "@/lib/types/store";

// ============================================================
// ServiceCard — "Clean Checklist" design
// White card: name + duration pill, bold price, a checklist of
// what's included, and a solid CTA. Featured services get an
// accent top-border, a "Popular" ribbon and an accent button.
// Shared by the storefront Home tab and the Services tab.
// ============================================================

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const hrs = minutes / 60;
  const rounded = Math.round(hrs * 2) / 2; // nearest 0.5
  return `~${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} hr${rounded >= 2 ? "s" : ""}`;
}

function formatPrice(price: number): string {
  return price % 1 === 0 ? `$${price.toFixed(0)}` : `$${price.toFixed(2)}`;
}

interface ServiceCardProps {
  service: StoreService;
  /** Store accent colour (used for the featured ribbon + button). */
  accent?: string;
  /** Readable text colour on top of the accent. */
  accentText?: string;
  /** When provided, renders the CTA button wired to this handler. */
  onBook?: () => void;
  bookLabel?: string;
  className?: string;
}

export function ServiceCard({
  service,
  accent = "#ffde59",
  accentText = "#0a0a0a",
  onBook,
  bookLabel = "Book service",
  className,
}: ServiceCardProps) {
  const featured = !!service.highlight;
  const hasPrice = service.price != null;
  const includes = service.includes?.filter((i) => i && i.trim().length > 0) ?? [];

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-2xl border bg-white p-5 transition-all duration-200",
        featured
          ? "border-gray-200 shadow-sm"
          : "border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg",
        className,
      )}
      style={featured ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}
    >
      {/* Featured ribbon */}
      {featured && (
        <span
          className="absolute -top-2.5 right-4 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm"
          style={{ backgroundColor: accent, color: accentText }}
        >
          Popular
        </span>
      )}

      {/* Header: name + duration */}
      <div className="flex items-start justify-between gap-2.5">
        <h3 className="text-[17px] font-extrabold leading-snug tracking-tight text-gray-900">
          {service.name}
        </h3>
        {service.duration_minutes != null && (
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
            <Clock className="h-3 w-3" />
            {formatDuration(service.duration_minutes)}
          </span>
        )}
      </div>

      {/* Price */}
      <div className="mt-3">
        {hasPrice ? (
          <>
            {service.price_from && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">From</p>
            )}
            <div className="text-[32px] font-extrabold leading-none tracking-tight text-gray-900">
              {formatPrice(service.price!)}
              {!service.price_from && (
                <span className="ml-1.5 align-baseline text-[13px] font-semibold text-gray-400">
                  / service
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold text-gray-500">Price on enquiry</p>
        )}
      </div>

      <div className="my-4 h-px bg-gray-100" />

      {/* What's included */}
      {includes.length > 0 ? (
        <div className="flex-1">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            What&apos;s included
          </p>
          <ul className="flex flex-col gap-2.5">
            {includes.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-gray-700">
                <span className="mt-0.5 grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-full bg-gray-900">
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : service.description ? (
        <p className="flex-1 text-[13.5px] leading-relaxed text-gray-500">{service.description}</p>
      ) : (
        <div className="flex-1" />
      )}

      {/* CTA */}
      {onBook && (
        <button
          type="button"
          onClick={onBook}
          className={cn(
            "mt-5 h-11 w-full rounded-xl text-sm font-bold transition cursor-pointer",
            !featured && "bg-gray-900 text-white hover:opacity-90",
          )}
          style={featured ? { backgroundColor: accent, color: accentText } : undefined}
        >
          {bookLabel}
        </button>
      )}
    </div>
  );
}

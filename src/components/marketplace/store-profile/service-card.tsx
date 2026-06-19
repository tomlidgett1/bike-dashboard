"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StoreService } from "@/lib/types/store";

// ============================================================
// ServiceCard — pricing-style card layout
// Shared by the storefront Home tab, Services tab, and settings.
// ============================================================

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const hrs = minutes / 60;
  const rounded = Math.round(hrs * 2) / 2;
  return `~${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} hr${rounded >= 2 ? "s" : ""}`;
}

function formatPrice(price: number): string {
  return price % 1 === 0 ? `$${price.toFixed(0)}` : `$${price.toFixed(2)}`;
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path
        d="M12.5 3.5L6 10L2.5 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CardPattern() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgb(0_0_0/0.055)_1px,transparent_1px)] [background-size:12px_12px]"
    />
  );
}

interface ServiceCardProps {
  service: StoreService;
  /** Store accent colour (used for the featured badge + button). */
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
  const durationLabel =
    service.duration_minutes != null ? formatDuration(service.duration_minutes) : null;

  return (
    <Card className={cn("relative flex h-full w-full flex-col", className)}>
      <CardPattern />
      <CardHeader className="relative z-10 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold tracking-tight">
            {service.name}
          </CardTitle>
          {featured && (
            <Badge
              className="rounded-md border-transparent"
              style={{ backgroundColor: accent, color: accentText }}
            >
              Popular
            </Badge>
          )}
        </div>

        {(service.description || durationLabel) && (
          <CardDescription>
            {service.description}
            {service.description && durationLabel && " · "}
            {durationLabel}
          </CardDescription>
        )}

        <div className="flex items-baseline gap-1 pt-2">
          {hasPrice ? (
            <>
              {service.price_from && (
                <span className="text-muted-foreground text-sm">From</span>
              )}
              <span className="text-4xl font-semibold tracking-tight">
                {formatPrice(service.price!)}
              </span>
              {!service.price_from && (
                <span className="text-muted-foreground text-sm">/ service</span>
              )}
            </>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              Price on enquiry
            </span>
          )}
        </div>
      </CardHeader>

      {includes.length > 0 ? (
        <CardContent className="relative z-10 flex flex-1 flex-col gap-2.5">
          {includes.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <CheckIcon />
              {item}
            </div>
          ))}
        </CardContent>
      ) : (
        <div className="relative z-10 min-h-0 flex-1" aria-hidden />
      )}

      {onBook && (
        <CardFooter className="relative z-10 mt-auto shrink-0">
          <Button
            type="button"
            className="w-full"
            onClick={onBook}
            style={
              featured
                ? { backgroundColor: accent, color: accentText }
                : undefined
            }
          >
            {bookLabel}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

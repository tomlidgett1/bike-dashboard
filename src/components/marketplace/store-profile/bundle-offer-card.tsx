"use client";

import * as React from "react";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { Package } from "@/components/layout/app-sidebar/dashboard-icons";
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
import type { StoreBundleOffer } from "@/lib/types/store";

// ============================================================
// BundleOfferCard — mirrors ServiceCard layout & principles
// Shared dot pattern, pricing hero, checklist, and CTA footer.
// ============================================================

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

const CARD_BACKGROUNDS = [
  "/service-cards/1.png",
  "/service-cards/2.png",
  "/service-cards/3.png",
  "/service-cards/4.png",
] as const;

function CardPattern() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgb(0_0_0/0.055)_1px,transparent_1px)] [background-size:12px_12px]"
    />
  );
}

function CardBackground({ index }: { index: number }) {
  const src = CARD_BACKGROUNDS[index % CARD_BACKGROUNDS.length];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${src}')` }}
    />
  );
}

function formatExpiry(expiresAt: string) {
  try {
    return format(parseISO(expiresAt), "d MMM yyyy");
  } catch {
    return expiresAt;
  }
}

function daysUntilExpiry(expiresAt: string) {
  try {
    const end = parseISO(expiresAt).getTime();
    return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
  } catch {
    return null;
  }
}

interface BundleOfferCardProps {
  offer: StoreBundleOffer;
  accent?: string;
  accentText?: string;
  onClaim?: (offer: StoreBundleOffer) => void;
  claimLabel?: string;
  backgroundIndex?: number;
  className?: string;
}

export function BundleOfferCard({
  offer,
  accent = "#ffde59",
  accentText = "#0a0a0a",
  onClaim,
  claimLabel = "View bundle details",
  backgroundIndex,
  className,
}: BundleOfferCardProps) {
  const hasBackground = backgroundIndex != null;
  const buyItem = offer.buy_product ?? offer.buy_service;
  const isService = !offer.buy_product && !!offer.buy_service;
  const buyVerb = isService ? "Book" : "Buy";
  const freeProducts = offer.free_products ?? [];
  const daysLeft = daysUntilExpiry(offer.expires_at);
  const urgent = daysLeft != null && daysLeft <= 7;
  const hasBuyPrice = buyItem?.price != null;

  const expiryLabel =
    daysLeft === 0
      ? "Ends today"
      : urgent
        ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
        : `Ends ${formatExpiry(offer.expires_at)}`;

  const descriptionParts = [
    offer.description?.trim(),
    buyItem ? `${buyVerb} ${buyItem.name}` : null,
    expiryLabel,
  ].filter(Boolean);

  return (
    <Card
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden",
        hasBackground && "border-foreground/10 bg-transparent",
        className,
      )}
    >
      {hasBackground ? <CardBackground index={backgroundIndex} /> : <CardPattern />}
      <CardHeader className="relative z-10 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold tracking-tight">{offer.name}</CardTitle>
          <Badge
            className="rounded-md border-transparent"
            style={{ backgroundColor: accent, color: accentText }}
          >
            Bundle
          </Badge>
        </div>

        {descriptionParts.length > 0 && (
          <CardDescription>{descriptionParts.join(" · ")}</CardDescription>
        )}

        <div className="flex items-baseline gap-1 pt-2">
          {hasBuyPrice ? (
            <>
              <span className="text-4xl font-semibold tracking-tight">
                {formatPrice(buyItem!.price!)}
              </span>
              <span className="text-muted-foreground text-sm">/ bundle</span>
            </>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">Price on enquiry</span>
          )}
        </div>
      </CardHeader>

      {freeProducts.length > 0 ? (
        <CardContent className="relative z-10 flex flex-1 flex-col gap-2.5">
          {freeProducts.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 text-sm">
              <CheckIcon />
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border/60 bg-white">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className="object-contain p-0.5"
                    sizes="40px"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <Package className="h-4 w-4 text-muted-foreground/40" />
                  </span>
                )}
              </div>
              <span className="min-w-0 flex-1 leading-snug">{item.name}</span>
            </div>
          ))}
        </CardContent>
      ) : (
        <div className="relative z-10 min-h-0 flex-1" aria-hidden />
      )}

      {onClaim && (
        <CardFooter className="relative z-10 mt-auto shrink-0">
          <Button
            type="button"
            className="w-full"
            onClick={() => onClaim(offer)}
            style={{ backgroundColor: accent, color: accentText }}
          >
            {claimLabel}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

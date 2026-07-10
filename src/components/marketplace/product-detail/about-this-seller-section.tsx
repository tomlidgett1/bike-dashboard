"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";

export interface ProductSellerProfile {
  id: string;
  name: string;
  logo_url: string | null;
  account_type: string | null;
  is_bicycle_store: boolean;
  store_type?: string | null;
  address?: string | null;
  website?: string | null;
  bio?: string | null;
  opening_hours?: import("@/lib/types/store").OpeningHours | null;
}

interface AboutThisSellerSectionProps {
  seller?: ProductSellerProfile | null;
  className?: string;
  /** When true, renders inside the product info card without outer page padding or card wrapper. */
  embedded?: boolean;
  /** When true, renders inside the purchase panel below buyer protection. */
  inPanel?: boolean;
  featureBullets?: string[];
  overviewContent?: React.ReactNode;
}

function KeyFeaturesList({
  featureBullets,
  compact = false,
}: {
  featureBullets: string[];
  compact?: boolean;
}) {
  if (featureBullets.length === 0) return null;

  return (
    <div>
      <h2
        className={cn(
          "font-bold text-gray-900",
          compact ? "text-sm" : "text-lg",
        )}
      >
        Key Features
      </h2>
      <ul className={cn("space-y-2", compact ? "mt-2" : "mt-3 space-y-2.5")}>
        {featureBullets.map((feature) => (
          <li
            key={feature}
            className={cn(
              "flex items-start gap-2 text-gray-600",
              compact ? "gap-1.5 text-xs" : "gap-2.5 text-sm",
            )}
          >
            <Check
              className={cn(
                "shrink-0 text-gray-900",
                compact ? "mt-0.5 h-3 w-3" : "mt-0.5 h-4 w-4",
              )}
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AboutThisSellerSection({
  seller = null,
  className,
  embedded = false,
  inPanel = false,
  featureBullets = [],
  overviewContent = null,
}: AboutThisSellerSectionProps) {
  const hasOverview = !!overviewContent;
  const hasFeatures = featureBullets.length > 0;
  const hasSeller = !!seller?.name;
  const profileHref = seller?.is_bicycle_store
    ? `/marketplace/store/${seller.id}`
    : `/marketplace/seller/${seller?.id}`;

  if (!inPanel && !hasSeller) return null;
  if (inPanel && !hasOverview && !hasFeatures && !hasSeller) return null;

  const overviewAndFeatures =
    hasOverview || hasFeatures ? (
      <div
        className={cn(
          hasOverview && hasFeatures
            ? "grid grid-cols-2 gap-x-4 gap-y-3"
            : "space-y-4",
        )}
      >
        {hasOverview && (
          <div className="min-w-0">
            <h2
              className={cn(
                "font-bold text-gray-900",
                inPanel ? "text-sm" : "text-lg",
              )}
            >
              Overview
            </h2>
            <div
              className={cn(
                "text-gray-600",
                inPanel ? "mt-2 text-xs leading-relaxed" : "mt-3 text-sm leading-relaxed",
              )}
            >
              {overviewContent}
            </div>
          </div>
        )}
        <KeyFeaturesList featureBullets={featureBullets} compact={inPanel} />
      </div>
    ) : null;

  const content = (
    <div className="space-y-4">
      {overviewAndFeatures}

      {hasSeller && (
        <p className={cn("text-gray-600", inPanel ? "text-xs" : "text-sm")}>
          Seller:{" "}
          <Link href={profileHref} className="font-semibold text-gray-900 hover:underline">
            {seller!.name}
          </Link>
        </p>
      )}
    </div>
  );

  if (inPanel) {
    return (
      <div className={cn("border-t border-gray-100 pt-4", className)}>
        {content}
      </div>
    );
  }

  if (embedded) {
    return (
      <div
        className={cn(
          "border-t border-gray-100 px-4 pt-4 pb-5 sm:px-5 sm:pt-5 sm:pb-6 lg:px-4 xl:px-5",
          className,
        )}
      >
        <div className="mx-auto max-w-[1536px]">{content}</div>
      </div>
    );
  }

  return (
    <section className={cn("px-4 sm:px-4 lg:px-3 xl:px-4", className)}>
      <div className="mx-auto max-w-[1536px]">
        <div className="rounded-md border border-gray-200 bg-white p-4 sm:p-5">{content}</div>
      </div>
    </section>
  );
}

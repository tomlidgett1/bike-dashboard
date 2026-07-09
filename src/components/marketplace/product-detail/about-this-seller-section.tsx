"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Clock, Globe, MapPin, Store, User, X } from '@/components/layout/app-sidebar/dashboard-icons';
import { getStoreOpenStatus } from "@/components/marketplace/store-profile/store-profile-chrome";
import type { OpeningHours } from "@/lib/types/store";
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
  opening_hours?: OpeningHours | null;
}

interface AboutThisSellerSectionProps {
  seller: ProductSellerProfile;
  className?: string;
  /** When true, renders inside the product info card without outer page padding or card wrapper. */
  embedded?: boolean;
}

function hasMeaningfulStoreData(seller: ProductSellerProfile): boolean {
  if (!seller.is_bicycle_store) {
    return Boolean(seller.name);
  }
  return Boolean(
    seller.name ||
      seller.logo_url ||
      seller.address ||
      seller.store_type ||
      seller.website ||
      seller.bio ||
      seller.opening_hours,
  );
}

function SellerAvatar({
  seller,
  logoError,
  onLogoError,
  size = "md",
}: {
  seller: ProductSellerProfile;
  logoError: boolean;
  onLogoError: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm" ? "h-10 w-10" : size === "lg" ? "h-16 w-16" : "h-14 w-14";
  const iconClass =
    size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50",
        dim,
      )}
    >
      {seller.logo_url && !logoError ? (
        <Image
          src={seller.logo_url}
          alt={seller.name}
          fill
          className="object-cover"
          onError={onLogoError}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {seller.is_bicycle_store ? (
            <Store className={cn(iconClass, "text-gray-400")} />
          ) : (
            <User className={cn(iconClass, "text-gray-400")} />
          )}
        </div>
      )}
    </div>
  );
}

function SellerDetailRows({
  seller,
  openStatus,
  websiteHref,
  clampBio = false,
}: {
  seller: ProductSellerProfile;
  openStatus: ReturnType<typeof getStoreOpenStatus> | null;
  websiteHref: string | null;
  clampBio?: boolean;
}) {
  return (
    <div className="space-y-3">
      {seller.bio && (
        <p
          className={cn(
            "text-sm leading-relaxed text-gray-600",
            clampBio && "line-clamp-3",
          )}
        >
          {seller.bio}
        </p>
      )}

      <div className="space-y-2.5 text-sm text-gray-600">
        {seller.address && (
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span>{seller.address}</span>
          </div>
        )}
        {openStatus && (
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 shrink-0 text-gray-400" />
            <span>{openStatus.label}</span>
          </div>
        )}
        {websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 text-gray-600 transition-colors hover:text-gray-900"
          >
            <Globe className="h-4 w-4 shrink-0 text-gray-400" />
            Visit website
          </a>
        )}
      </div>
    </div>
  );
}

export function AboutThisSellerSection({
  seller,
  className,
  embedded = false,
}: AboutThisSellerSectionProps) {
  const [logoError, setLogoError] = React.useState(false);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const openStatus = seller.is_bicycle_store
    ? getStoreOpenStatus(seller.opening_hours ?? undefined)
    : null;
  const profileHref = `/marketplace/${seller.is_bicycle_store ? "store" : "seller"}/${seller.id}`;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!isSheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSheetOpen]);

  if (!hasMeaningfulStoreData(seller)) return null;

  const websiteHref = seller.website?.startsWith("http")
    ? seller.website
    : seller.website
      ? `https://${seller.website}`
      : null;

  const sellerSubtitle = seller.is_bicycle_store
    ? seller.store_type || "Bicycle store"
    : "Individual seller";

  const mobileMeta = [sellerSubtitle, openStatus?.label].filter(Boolean).join(" · ");

  const mobileSheet =
    isSheetOpen && mounted
      ? createPortal(
          <div className="fixed inset-0 z-50 sm:hidden">
            <button
              type="button"
              aria-label="Close about this seller"
              className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
              onClick={() => setIsSheetOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="about-seller-title"
              className="absolute inset-x-0 bottom-0 flex max-h-[min(88dvh,720px)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
            >
              <div className="flex shrink-0 justify-center pb-1 pt-3">
                <div className="h-1 w-8 rounded-full bg-gray-300/80" />
              </div>

              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 pb-3">
                <h2
                  id="about-seller-title"
                  className="text-base font-semibold text-gray-900"
                >
                  About this seller
                </h2>
                <button
                  type="button"
                  onClick={() => setIsSheetOpen(false)}
                  className="rounded-md p-2 transition-colors hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="flex items-start gap-3">
                  <SellerAvatar
                    seller={seller}
                    logoError={logoError}
                    onLogoError={() => setLogoError(true)}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-base font-medium text-gray-900">{seller.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{sellerSubtitle}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <SellerDetailRows
                    seller={seller}
                    openStatus={openStatus}
                    websiteHref={websiteHref}
                  />
                </div>
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4">
                <Link
                  href={profileHref}
                  onClick={() => setIsSheetOpen(false)}
                  className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {seller.is_bicycle_store ? "View store profile" : "View seller profile"}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const content = (
    <>
      {/* Mobile — opens bottom sheet */}
      <div className="sm:hidden">
        <p className="mb-2 text-xs font-medium text-gray-500">Seller</p>
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors active:bg-gray-50"
        >
          <SellerAvatar
            seller={seller}
            logoError={logoError}
            onLogoError={() => setLogoError(true)}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{seller.name}</p>
            <p className="truncate text-xs text-gray-500">{mobileMeta}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
        </button>
      </div>

      {mobileSheet}

      {/* Tablet / desktop */}
      <div className="hidden sm:block">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          About this seller
        </p>

        <Link
          href={profileHref}
          className="group flex items-start gap-3 rounded-md border border-gray-200 bg-white px-3 py-3 transition-colors hover:bg-gray-50"
        >
          <SellerAvatar
            seller={seller}
            logoError={logoError}
            onLogoError={() => setLogoError(true)}
            size="sm"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{seller.name}</p>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {[sellerSubtitle, openStatus?.label].filter(Boolean).join(" · ")}
                </p>
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
            </div>

            {seller.bio ? (
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">
                {seller.bio}
              </p>
            ) : null}

            {seller.address ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="line-clamp-1">{seller.address}</span>
              </p>
            ) : null}
          </div>
        </Link>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div
        className={cn(
          "border-t border-gray-100 px-4 pt-4 pb-3 sm:px-5 sm:pt-4 lg:px-0 lg:pb-0",
          className,
        )}
      >
        {content}
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

"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Clock, Globe, MapPin, Store, User } from "lucide-react";
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

export function AboutThisSellerSection({
  seller,
  className,
  embedded = false,
}: AboutThisSellerSectionProps) {
  const [logoError, setLogoError] = React.useState(false);
  const openStatus = seller.is_bicycle_store ? getStoreOpenStatus(seller.opening_hours ?? undefined) : null;
  const profileHref = `/marketplace/${seller.is_bicycle_store ? "store" : "seller"}/${seller.id}`;

  if (!hasMeaningfulStoreData(seller)) return null;

  const websiteHref = seller.website?.startsWith("http")
    ? seller.website
    : seller.website
      ? `https://${seller.website}`
      : null;

  const content = (
    <>
      <h2 className="text-sm font-semibold text-gray-900">About this seller</h2>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
          {seller.logo_url && !logoError ? (
            <Image
              src={seller.logo_url}
              alt={seller.name}
              fill
              className="object-cover"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {seller.is_bicycle_store ? (
                <Store className="h-5 w-5 text-gray-400" />
              ) : (
                <User className="h-5 w-5 text-gray-400" />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-base font-medium text-gray-900">{seller.name}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {seller.is_bicycle_store
                ? seller.store_type || "Bicycle store"
                : "Individual seller"}
            </p>
          </div>

          {seller.bio && (
            <p className="text-sm leading-relaxed text-gray-600 line-clamp-3">{seller.bio}</p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
            {seller.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                {seller.address}
              </span>
            )}
            {openStatus && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                {openStatus.label}
              </span>
            )}
            {websiteHref && (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-gray-600 transition-colors hover:text-gray-900"
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                Visit website
              </a>
            )}
          </div>

          <Link
            href={profileHref}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            {seller.is_bicycle_store ? "View store profile" : "View seller profile"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className={cn("border-t border-gray-100 px-4 pt-5 pb-3 sm:px-5 lg:px-0", className)}>
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

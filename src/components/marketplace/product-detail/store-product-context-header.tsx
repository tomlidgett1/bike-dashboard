"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { CartButton } from "@/components/marketplace/cart-button";

type StoreProductContextHeaderProps = {
  storeId: string;
  storeName: string;
  storeLogo: string | null;
  accountType?: string | null;
};

function storeTypeLabel(accountType?: string | null): string {
  if (accountType === "bicycle_store") return "Bicycle store";
  if (accountType === "individual") return "Private seller";
  return "Store";
}

export function StoreProductContextHeader({
  storeId,
  storeName,
  storeLogo,
  accountType,
}: StoreProductContextHeaderProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const storeHref = `/marketplace/store/${storeId}`;

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-white/90 backdrop-blur-md transition-[border-color,box-shadow] duration-200",
        scrolled
          ? "border-b border-gray-200 shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_6px_16px_-12px_rgba(0,0,0,0.25)]"
          : "border-b border-gray-100"
      )}
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10">
        <div className="flex h-16 items-center justify-between gap-3 sm:h-[72px]">
          {/* Back to store — the entire cluster is one target */}
          <Link
            href={storeHref}
            className="group flex min-w-0 items-center gap-3 sm:gap-3.5"
            aria-label={`Back to ${storeName}`}
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-all group-hover:-translate-x-0.5 group-hover:border-gray-300 group-hover:text-gray-900">
              <ChevronLeft className="h-[18px] w-[18px]" />
            </span>

            <span className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-gray-200 sm:h-11 sm:w-11 flex items-center justify-center">
              {storeLogo ? (
                <Image
                  src={storeLogo}
                  alt=""
                  width={44}
                  height={44}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Store className="h-5 w-5 text-gray-400" />
              )}
            </span>

            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {storeTypeLabel(accountType)}
              </span>
              <span className="truncate text-[17px] font-bold leading-tight tracking-tight text-gray-900 transition-colors group-hover:text-gray-600 sm:text-lg">
                {storeName}
              </span>
            </span>
          </Link>

          {/* Global actions + quiet exit to Yellow Jersey */}
          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2.5">
            <CartButton className="rounded-full hover:bg-gray-100" />

            <span
              className="h-7 w-px bg-gray-200"
              aria-hidden="true"
            />

            <Link
              href="/marketplace"
              aria-label="Go to Yellow Jersey marketplace"
              className="inline-flex h-9 items-center gap-2 rounded-full px-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 sm:px-3"
              title="Yellow Jersey Marketplace"
            >
              <Image
                src="/yjlogo.svg"
                alt="Yellow Jersey"
                width={84}
                height={20}
                className="h-[18px] w-auto opacity-90 sm:h-5"
                unoptimized
              />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

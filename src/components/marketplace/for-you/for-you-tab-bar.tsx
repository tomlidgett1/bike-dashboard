"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Package, Store, Sparkles } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// Minimal standalone tab bar for the /for-you page.
// Mirrors the tab strip in UnifiedFilterBar but with "For You" active and
// no filter machinery — the For You page doesn't need any of that.

function UberLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/uber.png"
      alt="Uber"
      width={52}
      height={18}
      className={cn("h-4 w-auto max-w-none", className)}
      unoptimized
    />
  );
}

export function ForYouTabBar() {
  const router = useRouter();

  return (
    <div className="space-y-1.5">
      {/* Mobile */}
      <div className="sm:hidden px-3 pt-2 pb-1">
        <div className="grid grid-cols-4 gap-0.5 rounded-full bg-gray-100 p-0.5">
          <button
            type="button"
            className="flex h-8 min-w-0 cursor-pointer items-center justify-center rounded-full px-1.5 text-[13px] font-medium whitespace-nowrap bg-white text-gray-900 shadow-sm"
          >
            <span className="truncate">For You</span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/marketplace")}
            className="flex h-8 min-w-0 cursor-pointer items-center justify-center rounded-full px-1.5 text-[13px] font-medium whitespace-nowrap text-gray-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
          >
            <span className="truncate">Browse</span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/marketplace?space=stores")}
            className="flex h-8 min-w-0 cursor-pointer items-center justify-center rounded-full px-1.5 text-[13px] font-medium whitespace-nowrap text-gray-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
          >
            <span className="truncate">Stores</span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/marketplace?space=uber")}
            className="flex h-8 min-w-0 cursor-pointer items-center justify-center rounded-full px-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 text-gray-500"
            aria-label="Uber delivery"
          >
            <UberLogo />
          </button>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden sm:flex items-center gap-2.5">
        <div className="h-11 rounded-full bg-white border border-gray-200 shadow-sm p-1 inline-flex flex-shrink-0">
          <button
            type="button"
            className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap bg-gray-100 text-gray-900"
          >
            <Sparkles className="h-4 w-4" />
            For You
          </button>
          <button
            type="button"
            onClick={() => router.push("/marketplace")}
            className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-gray-500 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
          >
            <Package className="h-4 w-4" />
            Marketplace
          </button>
          <button
            type="button"
            onClick={() => router.push("/marketplace?space=stores")}
            className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-gray-500 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
          >
            <Store className="h-4 w-4" />
            Bike Stores
          </button>
          <button
            type="button"
            onClick={() => router.push("/marketplace?space=uber")}
            className="flex h-9 min-w-16 cursor-pointer items-center justify-center rounded-full px-2 text-sm font-medium whitespace-nowrap text-gray-500 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
            aria-label="Uber delivery"
          >
            <UberLogo className="h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

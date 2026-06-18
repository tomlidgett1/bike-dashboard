"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronRight } from "@/components/layout/app-sidebar/dashboard-icons";
import { UberDeliveryInfoSheet } from "@/components/marketplace/uber-delivery-info-sheet";
import { cn } from "@/lib/utils";

interface UberExpressTabBannerProps {
  className?: string;
}

export function UberExpressTabBanner({ className }: UberExpressTabBannerProps) {
  const [infoOpen, setInfoOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        className={cn(
          "relative w-full overflow-hidden rounded-md bg-gray-900 px-4 py-3.5 text-left",
          "ring-1 ring-black/[0.06] transition-opacity hover:opacity-95 active:opacity-90",
          className,
        )}
        aria-label="Learn about Uber Express delivery"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-[#0eb462]/20 blur-2xl"
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10">
            <Image
              src="/uber.png"
              alt=""
              width={44}
              height={16}
              aria-hidden
              style={{ filter: "brightness(0) invert(1)" }}
              className="h-3.5 w-auto object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-tight text-white">Uber Express</p>
            <p className="mt-0.5 text-[13px] leading-snug text-gray-400">
              From local stores to your door in{" "}
              <span className="font-medium text-[#0eb462]">~1 hour</span>
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
        </div>
      </button>
      <UberDeliveryInfoSheet open={infoOpen} onOpenChange={setInfoOpen} />
    </>
  );
}

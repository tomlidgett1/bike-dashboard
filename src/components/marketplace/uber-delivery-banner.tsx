"use client";

import * as React from "react";
import Image from "next/image";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Uber On-Demand Delivery Banner
// ============================================================
// A compact banner highlighting Uber Direct delivery capabilities
// Key differentiator for the marketplace

interface UberDeliveryBannerProps {
  className?: string;
}

export function UberDeliveryBanner({ className }: UberDeliveryBannerProps) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-900 rounded-md",
      className
    )}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10">
          <Zap className="h-3.5 w-3.5 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-tight">
            Get it in <span className="text-green-400">1 hour</span>
          </p>
          <p className="text-[10px] text-white/60">On-demand delivery to your door</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] text-white/50">via</span>
        <Image
          src="/uber.svg"
          alt="Uber"
          width={36}
          height={14}
          className="brightness-0 invert opacity-80"
        />
      </div>
    </div>
  );
}

// ============================================================
// Inline Uber Delivery Badge
// ============================================================
// Smaller inline badge for compact spaces

export function UberDeliveryBadge({ className }: { className?: string }) {
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 bg-black rounded-md",
      className
    )}>
      <Zap className="h-3 w-3 text-green-400" />
      <span className="text-xs font-semibold text-white">1hr</span>
      <div className="h-2.5 w-px bg-white/30" />
      <Image
        src="/uber.svg"
        alt="Uber"
        width={28}
        height={10}
        className="brightness-0 invert opacity-90"
      />
    </div>
  );
}


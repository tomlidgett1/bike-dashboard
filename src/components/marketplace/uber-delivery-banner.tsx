"use client";

import * as React from "react";
import Image from "next/image";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Uber On-Demand Delivery Banner
// ============================================================
// A compact banner highlighting Uber Direct delivery capabilities

interface UberDeliveryBannerProps {
  className?: string;
}

export function UberDeliveryBanner({ className }: UberDeliveryBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-900 rounded-md",
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10">
          <Zap className="h-3.5 w-3.5 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">
            Get it in <span className="text-green-400">1 hour</span>
          </p>
          <p className="text-[10px] text-white/60">On-demand delivery</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/50">via</span>
        <Image
          src="/uber.svg"
          alt="Uber"
          width={32}
          height={12}
          className="brightness-0 invert opacity-70"
        />
      </div>
    </div>
  );
}

// ============================================================
// Uber Delivery Badge (for product cards)
// ============================================================

interface UberDeliveryBadgeProps {
  className?: string;
}

export function UberDeliveryBadge({ className }: UberDeliveryBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 bg-gray-900 rounded-md",
        className
      )}
    >
      <Zap className="h-2.5 w-2.5 text-green-400" />
      <span className="text-[9px] font-medium text-white">1hr</span>
    </div>
  );
}

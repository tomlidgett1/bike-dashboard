"use client";

import * as React from "react";
import Image from "next/image";
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
          <Image
            src="/delivery.png"
            alt="Delivery"
            width={20}
            height={20}
            style={{ filter: "brightness(0) saturate(100%) invert(67%) sepia(93%) saturate(1352%) hue-rotate(87deg) brightness(95%) contrast(85%)" }}
          />
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
      <Image
        src="/delivery.png"
        alt="Delivery"
        width={10}
        height={10}
        style={{ filter: "brightness(0) saturate(100%) invert(67%) sepia(93%) saturate(1352%) hue-rotate(87deg) brightness(95%) contrast(85%)" }}
      />
      <span className="text-[9px] font-medium text-white">1hr</span>
    </div>
  );
}

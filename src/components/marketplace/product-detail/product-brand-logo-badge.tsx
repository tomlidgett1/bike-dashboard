"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface ProductBrandLogoBadgeProps {
  logoUrl: string;
  brandName?: string | null;
  className?: string;
  /** Align logo within its box. Defaults to left. */
  align?: "left" | "right";
  /** Visual size. Defaults to sm. */
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "h-7 w-14 sm:h-8 sm:w-16",
  md: "h-8 w-20 sm:h-9 sm:w-24",
  lg: "h-9 w-24 sm:h-10 sm:w-28",
  xl: "h-10 w-28 sm:h-11 sm:w-32",
} as const;

const sizePixels = {
  sm: "64px",
  md: "96px",
  lg: "112px",
  xl: "128px",
} as const;

export function ProductBrandLogoBadge({
  logoUrl,
  brandName,
  className,
  align = "left",
  size = "sm",
}: ProductBrandLogoBadgeProps) {
  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <Image
        src={logoUrl}
        alt={brandName ? `${brandName} logo` : "Brand logo"}
        fill
        className={cn(
          "object-contain",
          align === "right" ? "object-right" : "object-left",
        )}
        sizes={sizePixels[size]}
      />
    </div>
  );
}

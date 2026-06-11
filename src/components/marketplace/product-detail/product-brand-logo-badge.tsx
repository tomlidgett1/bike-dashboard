"use client";

import Image from "next/image";

interface ProductBrandLogoBadgeProps {
  logoUrl: string;
  brandName?: string | null;
}

export function ProductBrandLogoBadge({ logoUrl, brandName }: ProductBrandLogoBadgeProps) {
  return (
    <div className="relative h-8 w-16 sm:h-9 sm:w-20">
      <Image
        src={logoUrl}
        alt={brandName ? `${brandName} logo` : "Brand logo"}
        fill
        className="object-contain object-left"
        sizes="80px"
      />
    </div>
  );
}

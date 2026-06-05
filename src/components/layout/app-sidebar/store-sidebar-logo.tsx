"use client";

import * as React from "react";
import Image from "next/image";
import { Bike } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOptimizedImageUrl } from "@/lib/utils/image-cdn";

const SIDEBAR_LOGO_SIZE = 64;

function getSidebarLogoSrc(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  return (
    getOptimizedImageUrl(logoUrl, {
      width: SIDEBAR_LOGO_SIZE,
      height: SIDEBAR_LOGO_SIZE,
      quality: 75,
    }) ?? logoUrl
  );
}

/** Warm the browser cache for the sidebar logo (small transform URL). */
export function preloadStoreSidebarLogo(logoUrl: string | null | undefined) {
  if (typeof window === "undefined" || !logoUrl) return;
  const src = getSidebarLogoSrc(logoUrl);
  if (!src) return;
  const img = new window.Image();
  img.src = src;
}

type StoreSidebarLogoProps = {
  logoUrl?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  priority?: boolean;
};

/**
 * Store logo for the sidebar header — CDN-sized URL, priority load, stable cache key.
 */
export function StoreSidebarLogo({
  logoUrl,
  alt,
  className,
  iconClassName,
  priority = true,
}: StoreSidebarLogoProps) {
  const src = getSidebarLogoSrc(logoUrl);

  React.useEffect(() => {
    preloadStoreSidebarLogo(logoUrl);
  }, [logoUrl]);

  if (!src) {
    return <Bike className={cn("size-4", iconClassName)} />;
  }

  return (
    <Image
      key={logoUrl}
      src={src}
      alt={alt}
      width={32}
      height={32}
      sizes="32px"
      priority={priority}
      className={cn("size-8 object-cover", className)}
    />
  );
}

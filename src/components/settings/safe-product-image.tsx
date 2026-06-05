"use client";

import Image from "next/image";

const NEXT_IMAGE_HOSTS = new Set([
  "res.cloudinary.com",
  "images.unsplash.com",
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "images.bike24.com",
  "i.ebayimg.com",
  "thumbs.ebayimg.com",
]);

function canUseNextImage(src: string) {
  if (src.startsWith("/")) return true;

  try {
    const url = new URL(src);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "frjcluhuictnbimitvrm.supabase.co") {
      return (
        url.pathname.startsWith("/storage/v1/object/public/") ||
        url.pathname.startsWith("/storage/v1/render/image/public/")
      );
    }

    return url.protocol === "https:" && NEXT_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

interface SafeProductImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

export function SafeProductImage({
  src,
  alt,
  width,
  height,
  className,
}: SafeProductImageProps) {
  if (canUseNextImage(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={className}
    />
  );
}

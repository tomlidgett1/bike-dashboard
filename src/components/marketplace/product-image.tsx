'use client';

// ============================================================
// Responsive Product Image Component
// ============================================================
// Automatically serves optimal image format and size

import React, { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { ImageVariants, ImageFormats } from '@/lib/services/image-processing/types';

interface ProductImageProps {
  variants: ImageVariants;
  formats: ImageFormats;
  alt: string;
  className?: string;
  priority?: boolean;
  fill?: boolean;
  sizes?: string;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * Responsive product image with automatic format selection
 * Uses Next.js Image for optimization + Picture element for format selection
 */
export function ProductImage({
  variants,
  formats,
  alt,
  className,
  priority = false,
  fill = false,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  onLoad,
  onError,
}: ProductImageProps) {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleError = () => {
    setImageError(true);
    setIsLoading(false);
    onError?.();
  };

  const handleLoad = () => {
    setIsLoading(false);
    onLoad?.();
  };

  // Get base URL from environment
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const storageBase = `${baseUrl}/storage/v1/object/public/product-images/`;

  // Construct URLs
  const getImageUrl = (path: string) => `${storageBase}${path}`;

  // If image failed to load or no variants available, show placeholder
  if (imageError || !variants.original) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-gray-100 rounded-md',
          className
        )}
      >
        <svg
          className="h-12 w-12 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-md" />
      )}

      {/* Use Next.js Image for optimization */}
      <Image
        src={getImageUrl(variants.medium || variants.original)}
        alt={alt}
        fill={fill}
        sizes={sizes}
        className={cn(
          'object-cover transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100'
        )}
        priority={priority}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? 'eager' : 'lazy'}
      />
    </div>
  );
}

/**
 * Optimized Picture element for maximum browser support
 */
export function OptimizedProductImage({
  variants,
  formats,
  alt,
  className,
  width = 800,
  height = 600,
}: ProductImageProps & { width?: number; height?: number }) {
  const [imageError, setImageError] = useState(false);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const storageBase = `${baseUrl}/storage/v1/object/public/product-images/`;
  const getImageUrl = (path: string) => `${storageBase}${path}`;

  if (imageError || !variants.original) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-gray-100 rounded-md',
          className
        )}
        style={{ width, height }}
      >
        <svg
          className="h-12 w-12 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <picture>
      {/* AVIF format for modern browsers (best compression) */}
      {formats.avif?.large && (
        <source
          type="image/avif"
          srcSet={`${getImageUrl(formats.avif.large)} 1200w, ${
            formats.avif.medium ? getImageUrl(formats.avif.medium) : ''
          } 800w`}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      )}

      {/* WebP format for good compression + support */}
      {formats.webp?.large && (
        <source
          type="image/webp"
          srcSet={`${getImageUrl(formats.webp.large)} 1200w, ${
            formats.webp.medium ? getImageUrl(formats.webp.medium) : ''
          } 800w`}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      )}

      {/* JPEG fallback for universal support */}
      <img
        src={getImageUrl(variants.medium || variants.original)}
        alt={alt}
        className={cn('object-cover rounded-md', className)}
        width={width}
        height={height}
        loading="lazy"
        onError={() => setImageError(true)}
      />
    </picture>
  );
}

/**
 * Product thumbnail component (150px)
 */
export function ProductThumbnail({
  variants,
  formats,
  alt,
  className,
}: ProductImageProps) {
  return (
    <ProductImage
      variants={variants}
      formats={formats}
      alt={alt}
      className={cn('h-[150px] w-[150px] rounded-md', className)}
      sizes="150px"
    />
  );
}

/**
 * Product card image component (400px)
 */
export function ProductCardImage({
  variants,
  formats,
  alt,
  className,
}: ProductImageProps) {
  return (
    <ProductImage
      variants={variants}
      formats={formats}
      alt={alt}
      className={cn('aspect-square w-full rounded-md', className)}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
    />
  );
}

/**
 * Product hero image component (large, 1200px)
 */
export function ProductHeroImage({
  variants,
  formats,
  alt,
  className,
  priority = true,
}: ProductImageProps) {
  return (
    <ProductImage
      variants={variants}
      formats={formats}
      alt={alt}
      className={cn('aspect-video w-full rounded-md', className)}
      sizes="(max-width: 1024px) 100vw, 1200px"
      priority={priority}
    />
  );
}









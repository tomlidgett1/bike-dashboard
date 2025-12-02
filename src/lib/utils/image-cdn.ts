// ============================================================
// Image CDN Utilities
// Optimized image loading with Supabase Image Transformations
// 
// Supabase Pro plan enabled - transforms work at the CDN edge
// See: https://supabase.com/docs/guides/storage/serving/image-transformations
// ============================================================

/**
 * Image size presets for common use cases
 * Each preset is optimised for the specific display context
 * These will work when Supabase transforms are enabled
 */
export const IMAGE_PRESETS = {
  // Product card in grid (300-400px display, 2x for retina)
  productCard: { width: 400, quality: 75 },
  
  // Search dropdown thumbnail (48px display, 2x for retina)
  thumbnail: { width: 100, quality: 70 },
  
  // Product detail main image
  productDetail: { width: 800, quality: 85 },
  
  // Product detail zoom/gallery
  productZoom: { width: 1200, quality: 90 },
  
  // Store logo (small display)
  storeLogo: { width: 80, quality: 75 },
} as const;

/**
 * Generates optimized image URL with Supabase Image Transformations
 * Uses the /render/image/ endpoint for CDN edge resizing
 * 
 * @param imageUrl - The original image URL
 * @param options - Transformation options (width, height, quality, format)
 * @returns Optimised URL with Supabase transformation endpoint
 */
export function getOptimizedImageUrl(
  imageUrl: string | null,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'origin';
  } = {}
): string | null {
  if (!imageUrl) return null;

  const { width, height, quality = 80, format } = options;

  // If it's a Supabase Storage URL, use the render/image endpoint
  if (imageUrl.includes('supabase.co/storage')) {
    try {
      // Transform: /storage/v1/object/public/ → /storage/v1/render/image/public/
      const transformedUrl = imageUrl.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      );
      
      const url = new URL(transformedUrl);
      
      if (width) url.searchParams.set('width', width.toString());
      if (height) url.searchParams.set('height', height.toString());
      url.searchParams.set('quality', quality.toString());
      
      // Supabase auto-converts to WebP, use 'origin' to keep original format
      if (format) {
        url.searchParams.set('format', format);
      }
      
      return url.toString();
    } catch {
      return imageUrl;
    }
  }

  // Return original URL for non-Supabase images
  return imageUrl;
}

/**
 * Convenience function for product card images
 * Optimised for grid display (~400px width, 75% quality)
 */
export function getProductCardImageUrl(imageUrl: string | null): string | null {
  return getOptimizedImageUrl(imageUrl, IMAGE_PRESETS.productCard);
}

/**
 * Convenience function for thumbnail images
 * Optimised for search dropdowns (~100px width, 70% quality)
 */
export function getThumbnailImageUrl(imageUrl: string | null): string | null {
  return getOptimizedImageUrl(imageUrl, IMAGE_PRESETS.thumbnail);
}

/**
 * Generates responsive image srcset for different screen sizes
 */
export function getResponsiveSrcSet(
  imageUrl: string | null,
  sizes: number[] = [320, 640, 960, 1280, 1920]
): string | null {
  if (!imageUrl) return null;

  const srcset = sizes
    .map((size) => {
      const optimizedUrl = getOptimizedImageUrl(imageUrl, {
        width: size,
        quality: 80,
      });
      return `${optimizedUrl} ${size}w`;
    })
    .join(', ');

  return srcset;
}

/**
 * Generates a blur data URL placeholder for images
 * Used for better perceived performance during image loading
 */
export function getBlurDataUrl(imageUrl: string | null): string {
  if (!imageUrl) {
    // Return a neutral gray blur placeholder
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YzZjRmNiIvPjwvc3ZnPg==';
  }

  // Generate a tiny blurred version (10x10px) for instant loading
  const tinyUrl = getOptimizedImageUrl(imageUrl, {
    width: 10,
    height: 10,
    quality: 10,
  });

  // For now, return the tiny image URL
  // In production, you might want to convert this to base64
  return tinyUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZjNmNGY2Ii8+PC9zdmc+';
}

/**
 * Validates if an image URL is from an allowed domain
 */
export function isAllowedImageDomain(imageUrl: string): boolean {
  const allowedDomains = [
    'supabase.co',
    'supabase.in',
    'localhost',
  ];

  try {
    const url = new URL(imageUrl);
    return allowedDomains.some(domain => url.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Generates optimized image props for Next.js Image component
 */
export function getImageProps(
  imageUrl: string | null,
  alt: string,
  options: {
    width?: number;
    height?: number;
    priority?: boolean;
  } = {}
) {
  const { width = 800, height = 600, priority = false } = options;

  return {
    src: getOptimizedImageUrl(imageUrl, { width, height }) || '/placeholder-product.svg',
    alt,
    width,
    height,
    placeholder: 'blur' as const,
    blurDataURL: getBlurDataUrl(imageUrl),
    priority,
    quality: 80,
  };
}






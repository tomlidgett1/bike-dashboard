// ============================================================
// Image CDN Utilities
// Optimized image loading with transformations and placeholders
// ============================================================

/**
 * Generates optimized image URL with transformations
 * Supports Supabase Storage transformations
 */
export function getOptimizedImageUrl(
  imageUrl: string | null,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'auto';
  } = {}
): string | null {
  if (!imageUrl) return null;

  const { width, height, quality = 80, format = 'webp' } = options;

  // If it's already a Supabase Storage URL, add transformation params
  if (imageUrl.includes('supabase')) {
    const url = new URL(imageUrl);
    
    if (width) url.searchParams.set('width', width.toString());
    if (height) url.searchParams.set('height', height.toString());
    url.searchParams.set('quality', quality.toString());
    
    // Supabase Storage auto-converts to WebP when supported
    if (format !== 'auto') {
      url.searchParams.set('format', format);
    }
    
    return url.toString();
  }

  // Return original URL for non-Supabase images
  return imageUrl;
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


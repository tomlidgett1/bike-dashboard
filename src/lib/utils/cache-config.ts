// ============================================================
// Cache Configuration for Image CDN
// ============================================================

/**
 * Cache control headers for different content types
 */
export const CACHE_HEADERS = {
  // Images: Cache for 1 year (immutable)
  images: {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'CDN-Cache-Control': 'public, max-age=31536000',
    'Vary': 'Accept',
  },

  // API responses: Cache for 5 minutes
  api: {
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
  },

  // Product data: Cache for 1 minute, revalidate in background
  productData: {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
  },

  // No cache for dynamic/user-specific content
  noCache: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
} as const;

/**
 * Generates cache headers with version parameter for cache busting
 */
export function getCacheHeaders(
  type: keyof typeof CACHE_HEADERS,
  version?: string
): Record<string, string> {
  const headers: Record<string, string> = { ...CACHE_HEADERS[type] };

  if (version) {
    headers['ETag'] = `"${version}"`;
  }

  return headers;
}

/**
 * Generates cache version from timestamp
 */
export function generateCacheVersion(): string {
  return Date.now().toString(36);
}

/**
 * Checks if browser supports WebP
 */
export function supportsWebP(): boolean {
  if (typeof window === 'undefined') return false;

  const canvas = document.createElement('canvas');
  if (canvas.getContext && canvas.getContext('2d')) {
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  }
  return false;
}

/**
 * Checks if browser supports AVIF
 */
export function supportsAVIF(): boolean {
  if (typeof window === 'undefined') return false;

  const canvas = document.createElement('canvas');
  if (canvas.getContext && canvas.getContext('2d')) {
    return canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0;
  }
  return false;
}

/**
 * Gets the best supported image format
 */
export function getBestImageFormat(): 'avif' | 'webp' | 'jpeg' {
  if (supportsAVIF()) return 'avif';
  if (supportsWebP()) return 'webp';
  return 'jpeg';
}

/**
 * Preloads critical images
 */
export function preloadImage(src: string, type: 'image/avif' | 'image/webp' | 'image/jpeg' = 'image/webp'): void {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  link.type = type;
  document.head.appendChild(link);
}

/**
 * Implements intersection observer for lazy loading
 */
export function createLazyLoadObserver(
  callback: (entry: IntersectionObserverEntry) => void,
  options?: IntersectionObserverInit
): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }

  return new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        callback(entry);
      }
    });
  }, {
    rootMargin: '50px',
    threshold: 0.01,
    ...options,
  });
}






// ============================================================
// Image Optimizer
// ============================================================
// Note: This is a server-side utility for image processing
// In production, you'd use Sharp or similar for server-side processing
// For now, this provides the structure and client-side processing

import type {
  ImageSize,
  ImageFormat,
  ProcessedImage,
  ImageVariants,
  ImageFormats,
  ProcessImageResult,
  IMAGE_SIZES,
} from './types';

/**
 * Calculates dimensions maintaining aspect ratio
 */
export function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxSize: number
): { width: number; height: number } {
  if (maxSize === 0) {
    return { width: originalWidth, height: originalHeight };
  }

  const aspectRatio = originalWidth / originalHeight;

  if (originalWidth > originalHeight) {
    return {
      width: Math.min(maxSize, originalWidth),
      height: Math.round(Math.min(maxSize, originalWidth) / aspectRatio),
    };
  } else {
    return {
      width: Math.round(Math.min(maxSize, originalHeight) * aspectRatio),
      height: Math.min(maxSize, originalHeight),
    };
  }
}

/**
 * Generates storage path for processed image
 */
export function generateStoragePath(
  baseId: string,
  type: 'canonical' | 'custom',
  size: ImageSize,
  format: ImageFormat,
  userId?: string,
  productId?: string
): string {
  const uuid = crypto.randomUUID();

  if (type === 'canonical') {
    return `canonical/${baseId}/${size}/${uuid}.${format}`;
  } else {
    return `custom/${userId}/${productId}/${size}/${uuid}.${format}`;
  }
}

/**
 * Client-side image resizing using Canvas API
 */
export async function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('This function must run in the browser'));
      return;
    }
    
    const img = new window.Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      const dims = calculateDimensions(img.width, img.height, maxWidth);
      canvas.width = dims.width;
      canvas.height = dims.height;

      // Use high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, 0, 0, dims.width, dims.height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        0.9 // Quality setting
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Converts image to WebP format
 */
export async function convertToWebP(file: File, quality: number = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('This function must run in the browser'));
      return;
    }
    
    const img = new window.Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create WebP blob'));
          }
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Validates image file
 */
export function validateImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF images.',
    };
  }

  // Check file size (10MB max)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size exceeds 10MB limit.',
    };
  }

  return { valid: true };
}

/**
 * Gets image dimensions from file
 */
export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('This function must run in the browser'));
      return;
    }
    
    const img = new window.Image();

    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height,
      });
      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
      URL.revokeObjectURL(img.src);
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Optimizes image quality based on size
 */
export function getOptimalQuality(size: ImageSize): number {
  switch (size) {
    case 'thumbnail':
      return 0.75;
    case 'small':
      return 0.8;
    case 'medium':
      return 0.85;
    case 'large':
      return 0.9;
    case 'original':
      return 0.92;
    default:
      return 0.85;
  }
}

/**
 * Generates cache-busting version parameter
 */
export function generateCacheVersion(): string {
  return Date.now().toString(36);
}

/**
 * Constructs CDN URL with cache parameters
 */
export function getCDNUrl(
  storagePath: string,
  options?: {
    cacheVersion?: string;
    width?: number;
    height?: number;
    quality?: number;
  }
): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let url = `${baseUrl}/storage/v1/object/public/product-images/${storagePath}`;

  const params = new URLSearchParams();

  if (options?.cacheVersion) {
    params.append('v', options.cacheVersion);
  }

  if (options?.width) {
    params.append('width', options.width.toString());
  }

  if (options?.height) {
    params.append('height', options.height.toString());
  }

  if (options?.quality) {
    params.append('quality', options.quality.toString());
  }

  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  return url;
}

/**
 * Generates srcset for responsive images
 */
export function generateSrcSet(
  variants: Partial<ImageVariants>,
  format: ImageFormat = 'webp'
): string {
  const entries: string[] = [];

  if (variants.thumbnail) {
    entries.push(`${getCDNUrl(variants.thumbnail)} 150w`);
  }
  if (variants.small) {
    entries.push(`${getCDNUrl(variants.small)} 400w`);
  }
  if (variants.medium) {
    entries.push(`${getCDNUrl(variants.medium)} 800w`);
  }
  if (variants.large) {
    entries.push(`${getCDNUrl(variants.large)} 1200w`);
  }

  return entries.join(', ');
}

/**
 * Creates blur placeholder data URL
 */
export async function generateBlurDataURL(file: File): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('This function must run in the browser');
  }
  
  const blob = await resizeImage(file, 20, 20);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}


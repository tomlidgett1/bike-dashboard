/**
 * Cloudinary Image CDN Integration
 * 
 * Images are uploaded directly to Cloudinary via Edge Function
 * for ultra-fast delivery (~200-500ms first loads globally).
 * 
 * This file provides:
 * 1. URL helpers for images already on Cloudinary
 * 2. Fallback to Supabase for legacy images
 */

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

/**
 * Check if a URL is from Cloudinary
 */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('res.cloudinary.com');
}

/**
 * Check if Cloudinary is configured
 */
export function isCloudinaryConfigured(): boolean {
  return !!CLOUDINARY_CLOUD_NAME;
}

/**
 * Get the best image URL for product cards
 * - Uses cardUrl if available (pre-generated on Cloudinary)
 * - Falls back to original URL for legacy images
 */
export function getCardImageUrl(
  imageData: { url?: string; cardUrl?: string } | string | null | undefined
): string | null {
  if (!imageData) return null;
  
  // If it's just a string URL
  if (typeof imageData === 'string') {
    return imageData;
  }
  
  // Prefer pre-generated cardUrl (Cloudinary)
  if (imageData.cardUrl) {
    return imageData.cardUrl;
  }
  
  // Fallback to original URL
  return imageData.url || null;
}

/**
 * Get the best image URL for thumbnails (search dropdowns)
 * - Uses thumbnailUrl if available (pre-generated on Cloudinary)
 * - Falls back to original URL for legacy images
 */
export function getThumbnailUrl(
  imageData: { url?: string; thumbnailUrl?: string } | string | null | undefined
): string | null {
  if (!imageData) return null;
  
  // If it's just a string URL
  if (typeof imageData === 'string') {
    return imageData;
  }
  
  // Prefer pre-generated thumbnailUrl (Cloudinary)
  if (imageData.thumbnailUrl) {
    return imageData.thumbnailUrl;
  }
  
  // Fallback to original URL
  return imageData.url || null;
}

/**
 * Get the best image URL for detail pages
 * - Uses detailUrl if available (pre-generated on Cloudinary)
 * - Falls back to original URL for legacy images
 */
export function getDetailImageUrl(
  imageData: { url?: string; detailUrl?: string } | string | null | undefined
): string | null {
  if (!imageData) return null;
  
  // If it's just a string URL
  if (typeof imageData === 'string') {
    return imageData;
  }
  
  // Prefer pre-generated detailUrl (Cloudinary)
  if (imageData.detailUrl) {
    return imageData.detailUrl;
  }
  
  // Fallback to original URL
  return imageData.url || null;
}

/**
 * Upload image to Cloudinary via Edge Function
 */
export async function uploadToCloudinary(
  file: File,
  listingId: string,
  index: number,
  accessToken: string
): Promise<{
  url: string;
  cardUrl: string;
  thumbnailUrl: string;
  detailUrl?: string;
  id: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('listingId', listingId);
  formData.append('index', index.toString());

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-to-cloudinary`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  const result = await response.json();
  return {
    url: result.data.url,
    cardUrl: result.data.cardUrl,
    thumbnailUrl: result.data.thumbnailUrl,
    detailUrl: result.data.detailUrl,
    id: result.data.id,
  };
}

import {
  buildCloudinaryImageUrl,
  extractCloudinaryPublicId,
} from "@/lib/utils/cloudinary-transforms";

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
  imageData: { url?: string; cardUrl?: string; publicId?: string; cloudinaryPublicId?: string } | string | null | undefined
): string | null {
  if (!imageData) return null;
  
  // If it's just a string URL
  if (typeof imageData === 'string') {
    return imageData;
  }
  
  const generated = buildCloudinaryImageUrl(
    imageData.cloudinaryPublicId || imageData.publicId || extractCloudinaryPublicId(imageData.url),
    "grid_card"
  );
  if (generated) return generated;

  // Prefer pre-generated cardUrl (legacy Cloudinary column)
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
  imageData: { url?: string; thumbnailUrl?: string; publicId?: string; cloudinaryPublicId?: string } | string | null | undefined
): string | null {
  if (!imageData) return null;
  
  // If it's just a string URL
  if (typeof imageData === 'string') {
    return imageData;
  }
  
  const generated = buildCloudinaryImageUrl(
    imageData.cloudinaryPublicId || imageData.publicId || extractCloudinaryPublicId(imageData.url),
    "thumbnail"
  );
  if (generated) return generated;

  // Prefer pre-generated thumbnailUrl (legacy Cloudinary column)
  if (imageData.thumbnailUrl) {
    return imageData.thumbnailUrl;
  }
  
  // Fallback to original URL
  return imageData.url || null;
}

/**
 * Get the best image URL for mobile product cards (200px)
 * - Uses mobileCardUrl if available (pre-generated on Cloudinary)
 * - Falls back to cardUrl, then original URL for legacy images
 */
export function getMobileCardImageUrl(
  imageData: { url?: string; mobileCardUrl?: string; cardUrl?: string; publicId?: string; cloudinaryPublicId?: string } | string | null | undefined
): string | null {
  if (!imageData) return null;
  
  // If it's just a string URL
  if (typeof imageData === 'string') {
    return imageData;
  }
  
  const generated = buildCloudinaryImageUrl(
    imageData.cloudinaryPublicId || imageData.publicId || extractCloudinaryPublicId(imageData.url),
    "mobile_card"
  );
  if (generated) return generated;

  // Prefer pre-generated mobileCardUrl (legacy Cloudinary column)
  if (imageData.mobileCardUrl) {
    return imageData.mobileCardUrl;
  }
  
  // Fall back to cardUrl if mobileCardUrl not available
  if (imageData.cardUrl) {
    return imageData.cardUrl;
  }
  
  // Fallback to original URL
  return imageData.url || null;
}

/**
 * Get the best image URL for gallery/detail pages
 * - Uses galleryUrl if available (1200px landscape, padded - shows full product)
 * - Falls back to detailUrl, then original URL for legacy images
 */
export function getGalleryImageUrl(
  imageData: { url?: string; galleryUrl?: string; detailUrl?: string; publicId?: string; cloudinaryPublicId?: string } | string | null | undefined
): string | null {
  if (!imageData) return null;
  
  // If it's just a string URL
  if (typeof imageData === 'string') {
    return imageData;
  }
  
  const generated = buildCloudinaryImageUrl(
    imageData.cloudinaryPublicId || imageData.publicId || extractCloudinaryPublicId(imageData.url),
    "web_hero"
  );
  if (generated) return generated;

  // Prefer pre-generated galleryUrl (legacy Cloudinary column)
  if (imageData.galleryUrl) {
    return imageData.galleryUrl;
  }
  
  // Fallback to detailUrl
  if (imageData.detailUrl) {
    return imageData.detailUrl;
  }
  
  // Fallback to original URL
  return imageData.url || null;
}

/**
 * Get the best image URL for fullscreen/zoom
 * - Uses detailUrl if available (2000px high-res)
 * - Falls back to original URL for legacy images
 */
export function getDetailImageUrl(
  imageData: { url?: string; detailUrl?: string; publicId?: string; cloudinaryPublicId?: string } | string | null | undefined
): string | null {
  if (!imageData) return null;
  
  // If it's just a string URL
  if (typeof imageData === 'string') {
    return imageData;
  }
  
  const generated = buildCloudinaryImageUrl(
    imageData.cloudinaryPublicId || imageData.publicId || extractCloudinaryPublicId(imageData.url),
    "zoom"
  );
  if (generated) return generated;

  // Prefer pre-generated detailUrl (legacy Cloudinary column)
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
  mobileCardUrl: string;
  thumbnailUrl: string;
  galleryUrl?: string;
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
    mobileCardUrl: result.data.mobileCardUrl,
    thumbnailUrl: result.data.thumbnailUrl,
    galleryUrl: result.data.galleryUrl,
    detailUrl: result.data.detailUrl,
    id: result.data.id,
  };
}

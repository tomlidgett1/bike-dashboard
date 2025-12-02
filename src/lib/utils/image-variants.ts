/**
 * Image Variant Generator
 * Server-side utility for generating thumbnail and card image variants
 * Uses Sharp for high-quality, fast image processing
 */

import sharp from 'sharp';

// ============================================================
// Types
// ============================================================

export interface ImageVariantSizes {
  thumbnail: number;  // Width for search thumbnails
  card: number;       // Width for product cards
  original: number;   // Max width for original (0 = no resize)
}

export interface GeneratedVariants {
  original: Buffer;
  card: Buffer;
  thumbnail: Buffer;
  metadata: {
    originalWidth: number;
    originalHeight: number;
    format: string;
  };
}

export interface UploadedVariantUrls {
  url: string;         // Original/full-size URL
  cardUrl: string;     // 400px card URL
  thumbnailUrl: string; // 100px thumbnail URL
}

// ============================================================
// Configuration
// ============================================================

export const VARIANT_SIZES: ImageVariantSizes = {
  thumbnail: 100,  // 100px - for search dropdowns
  card: 400,       // 400px - for product cards
  original: 1200,  // 1200px max - for full view (keeps large images manageable)
};

const WEBP_QUALITY = {
  thumbnail: 70,
  card: 80,
  original: 85,
};

// ============================================================
// Main Functions
// ============================================================

/**
 * Generate all image variants from a buffer
 * @param inputBuffer - The original image buffer
 * @returns Promise with all three variant buffers
 */
export async function generateImageVariants(
  inputBuffer: Buffer | ArrayBuffer
): Promise<GeneratedVariants> {
  // Convert ArrayBuffer to Buffer if needed
  const buffer = Buffer.isBuffer(inputBuffer) 
    ? inputBuffer 
    : Buffer.from(inputBuffer);

  // Get original image metadata
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width || 800;
  const originalHeight = metadata.height || 600;
  const format = metadata.format || 'jpeg';

  // Process in parallel for speed
  const [original, card, thumbnail] = await Promise.all([
    // Original - resize if too large, convert to WebP
    processVariant(buffer, VARIANT_SIZES.original, WEBP_QUALITY.original, originalWidth),
    
    // Card - 400px for product cards
    processVariant(buffer, VARIANT_SIZES.card, WEBP_QUALITY.card, originalWidth),
    
    // Thumbnail - 100px for search dropdowns
    processVariant(buffer, VARIANT_SIZES.thumbnail, WEBP_QUALITY.thumbnail, originalWidth),
  ]);

  return {
    original,
    card,
    thumbnail,
    metadata: {
      originalWidth,
      originalHeight,
      format,
    },
  };
}

/**
 * Process a single variant - resize and convert to WebP
 */
async function processVariant(
  buffer: Buffer,
  maxWidth: number,
  quality: number,
  originalWidth: number
): Promise<Buffer> {
  let pipeline = sharp(buffer);

  // Only resize if maxWidth > 0 and original is larger
  if (maxWidth > 0 && originalWidth > maxWidth) {
    pipeline = pipeline.resize(maxWidth, null, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Convert to WebP for optimal file size
  return pipeline
    .webp({ quality })
    .toBuffer();
}

/**
 * Generate storage paths for all variants
 * Path structure: {user_id}/{listing_id}/{timestamp}-{variant}.webp
 * User ID must be first folder to satisfy RLS policy
 */
export function generateVariantPaths(
  userId: string,
  listingId: string,
  timestamp: number
): { original: string; card: string; thumbnail: string } {
  // User ID MUST be first folder (RLS policy checks this)
  const basePath = `${userId}/${listingId}`;
  
  return {
    original: `${basePath}/${timestamp}-original.webp`,
    card: `${basePath}/${timestamp}-card.webp`,
    thumbnail: `${basePath}/${timestamp}-thumbnail.webp`,
  };
}

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


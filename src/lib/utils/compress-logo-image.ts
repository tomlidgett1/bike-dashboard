/**
 * Server-side store logo compression (Sharp).
 * Keeps logos small for fast storefront and header loading.
 */

import sharp from 'sharp';

export const STORE_LOGO_MAX_DIMENSION = 512;
export const STORE_LOGO_WEBP_QUALITY = 80;

export interface CompressLogoResult {
  buffer: Buffer;
  contentType: 'image/webp';
  extension: 'webp';
}

/**
 * Resize to fit within max dimension, convert to WebP, strip metadata.
 */
export async function compressLogoImage(
  input: Buffer | ArrayBuffer
): Promise<CompressLogoResult> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const optimized = await sharp(buffer)
    .rotate()
    .resize({
      width: STORE_LOGO_MAX_DIMENSION,
      height: STORE_LOGO_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: STORE_LOGO_WEBP_QUALITY, effort: 4 })
    .toBuffer();

  return {
    buffer: optimized,
    contentType: 'image/webp',
    extension: 'webp',
  };
}

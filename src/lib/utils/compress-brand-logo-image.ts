/**
 * Brand product-page logos: keep the cropped aspect ratio (no square pad).
 * Store CRM logos still use compressLogoImage for email-safe squares.
 */

import sharp from 'sharp';

export const BRAND_LOGO_MAX_DIMENSION = 512;

export interface CompressBrandLogoResult {
  buffer: Buffer;
  contentType: 'image/png';
  extension: 'png';
}

export async function compressBrandLogoImage(
  input: Buffer | ArrayBuffer,
): Promise<CompressBrandLogoResult> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const optimized = await sharp(buffer)
    .rotate()
    .resize({
      width: BRAND_LOGO_MAX_DIMENSION,
      height: BRAND_LOGO_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toBuffer();

  return {
    buffer: optimized,
    contentType: 'image/png',
    extension: 'png',
  };
}

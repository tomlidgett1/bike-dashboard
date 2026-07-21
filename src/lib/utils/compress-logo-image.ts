/**
 * Server-side store logo compression (Sharp).
 *
 * Logos are embedded in CRM marketing emails, so the output must be
 * email-client safe: PNG (WebP is unsupported or badly transcoded by several
 * mobile mail clients/proxies) and square (email clients often ignore
 * object-fit, so a non-square source gets squashed inside fixed-size slots).
 */

import sharp from 'sharp';

export const STORE_LOGO_MAX_DIMENSION = 512;

export interface CompressLogoResult {
  buffer: Buffer;
  contentType: 'image/png';
  extension: 'png';
}

/**
 * Resize to fit within max dimension, pad to a square transparent canvas,
 * convert to PNG, strip metadata.
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
      // contain pads to an exact square so email clients never distort it
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      withoutEnlargement: true,
    })
    // Level 6 is ~2–4× faster than 9 with negligible size difference for logos.
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toBuffer();

  return {
    buffer: optimized,
    contentType: 'image/png',
    extension: 'png',
  };
}

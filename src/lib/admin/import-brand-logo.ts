import sharp from 'sharp';
import { compressBrandLogoImage } from '@/lib/utils/compress-brand-logo-image';

const MAX_BYTES = 5 * 1024 * 1024;

/** Crop rectangle as percentages of the image (0–100). */
export type BrandLogoCropPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function isValidPercentCrop(
  crop: BrandLogoCropPixels | null | undefined,
): crop is BrandLogoCropPixels {
  if (!crop) return false;
  return (
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) &&
    Number.isFinite(crop.height) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= 100.5 &&
    crop.y + crop.height <= 100.5
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function applyCropAndTrim(
  buffer: Buffer,
  crop?: BrandLogoCropPixels | null,
): Promise<Buffer> {
  // Orient first so dimensions match what the browser showed in the crop UI.
  const oriented = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });
  let working = oriented.data;
  const maxW = oriented.info.width;
  const maxH = oriented.info.height;

  if (isValidPercentCrop(crop) && maxW >= 8 && maxH >= 8) {
    // Percentages stay correct even if the downloaded file differs in pixel size
    // from the preview the admin cropped in the browser.
    const left = clamp(Math.floor((crop.x / 100) * maxW), 0, maxW - 1);
    const top = clamp(Math.floor((crop.y / 100) * maxH), 0, maxH - 1);
    const width = clamp(Math.ceil((crop.width / 100) * maxW), 1, maxW - left);
    const height = clamp(Math.ceil((crop.height / 100) * maxH), 1, maxH - top);

    if (width >= 8 && height >= 8 && left + width <= maxW && top + height <= maxH) {
      try {
        working = await sharp(working).extract({ left, top, width, height }).toBuffer();
      } catch (error) {
        console.warn('[import-brand-logo] extract failed, using full image', {
          left,
          top,
          width,
          height,
          maxW,
          maxH,
          crop,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  // Knock out remaining near-white / transparent padding around the mark.
  try {
    return await sharp(working).trim({ threshold: 16 }).toBuffer();
  } catch {
    return working;
  }
}

export async function importBrandLogoFromUrl(options: {
  imageUrl: string;
  storagePathPrefix: string;
  crop?: BrandLogoCropPixels | null;
  upload: (path: string, buffer: Buffer, contentType: string) => Promise<{ error: Error | null }>;
  getPublicUrl: (path: string) => string;
}): Promise<{ url: string } | { error: string }> {
  const imageUrl = options.imageUrl.trim();

  if (!imageUrl.startsWith('https://')) {
    return { error: 'A valid HTTPS image URL is required' };
  }

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return { error: 'Invalid image URL' };
  }

  if (isPrivateHost(parsed.hostname)) {
    return { error: 'Image URL is not allowed' };
  }

  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; YellowJerseyStore/1.0)',
      Accept: 'image/*,*/*;q=0.8',
    },
    redirect: 'follow',
    // Don't hang the approve UI on slow third-party image hosts.
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    return { error: `Could not download image (${response.status})` };
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';
  const arrayBuffer = await response.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_BYTES) {
    return { error: 'Image exceeds 5MB limit' };
  }

  if (!contentType.startsWith('image/')) {
    return { error: 'URL did not return an image' };
  }

  const rawBuffer = Buffer.from(arrayBuffer);
  const timestamp = Date.now();
  let uploadBuffer: Buffer = rawBuffer;
  let uploadContentType = contentType;
  let ext = 'png';

  if (contentType === 'image/svg+xml') {
    // SVG can't be pixel-cropped reliably; store as-is.
    ext = 'svg';
    uploadContentType = 'image/svg+xml';
  } else {
    const prepared = await applyCropAndTrim(rawBuffer, options.crop);
    // Keep cropped aspect ratio — square padding would reintroduce whitespace.
    const compressed = await compressBrandLogoImage(prepared);
    uploadBuffer = compressed.buffer;
    uploadContentType = compressed.contentType;
    ext = compressed.extension;
  }

  const path = `${options.storagePathPrefix}/${timestamp}.${ext}`;
  const { error: uploadError } = await options.upload(path, uploadBuffer, uploadContentType);

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  return { url: options.getPublicUrl(path) };
}

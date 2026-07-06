import { compressLogoImage } from '@/lib/utils/compress-logo-image';

const MAX_BYTES = 5 * 1024 * 1024;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export async function importBrandLogoFromUrl(options: {
  imageUrl: string;
  storagePathPrefix: string;
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
    ext = 'svg';
    uploadContentType = 'image/svg+xml';
  } else {
    const compressed = await compressLogoImage(rawBuffer);
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

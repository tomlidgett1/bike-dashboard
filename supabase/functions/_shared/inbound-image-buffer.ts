import type { ExtractedMedia, NormalisedIncomingMessage } from './linq.ts';

type InboundImageCandidate = Pick<NormalisedIncomingMessage, 'text' | 'images' | 'audio'>;

export function shouldBufferInboundImages(message: InboundImageCandidate): boolean {
  return message.text.trim().length === 0 &&
    message.images.length > 0 &&
    message.audio.length === 0;
}

export function shouldConsumeBufferedImages(message: InboundImageCandidate): boolean {
  return message.text.trim().length > 0;
}

export function dedupeExtractedMedia(images: ExtractedMedia[]): ExtractedMedia[] {
  const seen = new Set<string>();
  const deduped: ExtractedMedia[] = [];

  for (const image of images) {
    const key = `${image.url}\u0000${image.mimeType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(image);
  }

  return deduped;
}

export function mergeBufferedImages<T extends Pick<NormalisedIncomingMessage, 'images'>>(
  message: T,
  pendingImages: ExtractedMedia[],
): T {
  if (pendingImages.length === 0) return message;
  return {
    ...message,
    images: dedupeExtractedMedia([...pendingImages, ...message.images]),
  };
}

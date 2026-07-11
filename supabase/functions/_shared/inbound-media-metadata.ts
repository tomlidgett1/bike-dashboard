import type { ExtractedMedia } from './linq.ts';

const SYNTHETIC_INBOUND_PLACEHOLDERS = new Set([
  "what's in this image?",
  'whats in this image?',
]);

/** True for AI-only placeholder text that must never appear as customer speech in the inbox. */
export function isSyntheticInboundPlaceholder(text: string): boolean {
  return SYNTHETIC_INBOUND_PLACEHOLDERS.has(text.trim().toLowerCase());
}

/** Persist LINQ media on conversation_messages.metadata so brand inboxes can render photos. */
export function mediaMetadataFromParts(parts: {
  images?: ExtractedMedia[];
  audio?: ExtractedMedia[];
  files?: ExtractedMedia[];
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (parts.images && parts.images.length > 0) {
    metadata.images = parts.images.map((image) => ({
      url: image.url || undefined,
      mimeType: image.mimeType,
      mime_type: image.mimeType,
      filename: image.filename,
      attachmentId: image.attachmentId,
      attachment_id: image.attachmentId,
    }));
  }
  if (parts.audio && parts.audio.length > 0) metadata.audio = parts.audio;
  if (parts.files && parts.files.length > 0) metadata.files = parts.files;
  return metadata;
}

/**
 * History text for inbound turns. Photo-only messages keep empty content — attachment ids
 * live in metadata and are lazy-loaded via GET /v3/attachments/{id} per LINQ docs.
 */
export function historyContentForInbound(text: string, images: ExtractedMedia[] = []): string {
  const trimmed = text.trim();
  if (trimmed && !isSyntheticInboundPlaceholder(trimmed)) return trimmed;
  if (images.length === 0) return '';
  const urls = images.map((image) => image.url).filter(Boolean);
  return urls.length > 0 ? urls.join('\n') : '';
}

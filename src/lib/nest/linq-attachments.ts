import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";

const LINQ_BASE_URL =
  pickServerEnv(["LINQ_API_BASE_URL"]) || "https://api.linqapp.com/api/partner/v3";

export type LinqAttachmentMeta = {
  attachmentId: string;
  mimeType?: string;
  filename?: string;
  url?: string;
};

export type LinqChatMessage = {
  id: string;
  created_at: string;
  is_from_me?: boolean;
  from_handle?: { handle?: string };
  parts?: Array<Record<string, unknown>>;
};

function linqToken(): string | null {
  return pickServerEnv(["LINQ_API_TOKEN"]) ?? null;
}

async function linqFetch(path: string): Promise<Response> {
  const token = linqToken();
  if (!token) throw new Error("LINQ_API_TOKEN is not configured");
  return fetch(`${LINQ_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

/** LINQ-recommended lazy load: GET /v3/attachments/{attachmentId} for a fresh download_url. */
export async function fetchLinqAttachmentDownloadUrl(
  attachmentId: string,
): Promise<string | null> {
  const id = attachmentId.trim();
  if (!id) return null;

  const res = await linqFetch(`/attachments/${encodeURIComponent(id)}`);
  if (!res.ok) {
    console.error("[linq-attachments] retrieve failed:", res.status, id);
    return null;
  }

  const payload = (await res.json()) as Record<string, unknown>;
  const url = typeof payload.download_url === "string" ? payload.download_url.trim() : "";
  return url || null;
}

function isImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("image/");
}

function isImageFilename(filename: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|heic|heif)(?:\?|$)/i.test(filename);
}

export function extractImageAttachmentsFromLinqParts(
  parts: unknown[] | undefined,
): LinqAttachmentMeta[] {
  if (!Array.isArray(parts)) return [];

  const images: LinqAttachmentMeta[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== "object") continue;
    const part = raw as Record<string, unknown>;
    if (part.type !== "media") continue;

    const attachmentId =
      (typeof part.id === "string" && part.id.trim()) ||
      (typeof part.attachment_id === "string" && part.attachment_id.trim()) ||
      "";
    if (!attachmentId) continue;

    const mimeType =
      typeof part.mime_type === "string" ? part.mime_type : undefined;
    const filename = typeof part.filename === "string" ? part.filename : undefined;
    const url = typeof part.url === "string" ? part.url : undefined;

    const imageLike =
      (mimeType && isImageMime(mimeType)) ||
      (filename && isImageFilename(filename)) ||
      (url && /cdn\.linqapp\.com/i.test(url));

    if (!imageLike) continue;

    images.push({
      attachmentId,
      mimeType,
      filename,
      url,
    });
  }
  return images;
}

/** GET /v3/chats/{chatId}/messages — used to backfill attachment ids for inbox display. */
export async function fetchLinqChatMessages(
  chatId: string,
  limit = 200,
): Promise<LinqChatMessage[]> {
  const id = chatId.trim();
  if (!id) return [];

  const res = await linqFetch(
    `/chats/${encodeURIComponent(id)}/messages?limit=${Math.min(Math.max(limit, 1), 200)}`,
  );
  if (!res.ok) {
    console.error("[linq-attachments] chat messages failed:", res.status, id);
    return [];
  }

  const payload = (await res.json()) as Record<string, unknown>;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return messages.filter(
    (row): row is LinqChatMessage =>
      !!row && typeof row === "object" && typeof (row as LinqChatMessage).id === "string",
  );
}

export function linqAttachmentProxyUrl(attachmentId: string): string {
  return `/api/store/linq-attachment?id=${encodeURIComponent(attachmentId.trim())}`;
}

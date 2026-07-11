import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";

const LINQ_BASE_URL =
  pickServerEnv(["LINQ_API_BASE_URL"]) || "https://api.linqapp.com/api/partner/v3";

export type LinqMessagePart =
  | { type: "text"; value: string }
  | { type: "media"; attachment_id: string }
  | { type: "media"; url: string };

function linqToken(): string {
  const token = pickServerEnv(["LINQ_API_TOKEN"]);
  if (!token) throw new Error("LINQ_API_TOKEN is not configured");
  return token;
}

type LinqAttachmentCreateResponse = {
  attachment_id?: string;
  upload_url?: string;
  required_headers?: Record<string, string>;
};

export async function uploadLinqAttachmentBytes(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<string> {
  const token = linqToken();
  const res = await fetch(`${LINQ_BASE_URL}/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename,
      content_type: contentType,
      size_bytes: bytes.byteLength,
    }),
  });

  const payload = (await res.json()) as LinqAttachmentCreateResponse & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || `Linq attachment create failed (${res.status})`);
  }

  const attachmentId = payload.attachment_id?.trim();
  const uploadUrl = payload.upload_url?.trim();
  if (!attachmentId || !uploadUrl) {
    throw new Error("Linq did not return attachment upload details.");
  }

  const uploadHeaders = payload.required_headers ?? {};
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: uploadHeaders,
    body: Buffer.from(bytes),
  });

  if (!uploadRes.ok) {
    throw new Error(`Linq attachment upload failed (${uploadRes.status})`);
  }

  return attachmentId;
}

export async function linqSendMessageParts(
  chatId: string,
  parts: LinqMessagePart[],
): Promise<{ chatId: string; providerMessageId: string | null }> {
  if (parts.length === 0) {
    throw new Error("At least one message part is required.");
  }

  const token = linqToken();
  const res = await fetch(`${LINQ_BASE_URL}/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: { parts },
    }),
  });

  const payload = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const detail = typeof payload === "object" ? JSON.stringify(payload).slice(0, 240) : String(payload);
    throw new Error(`Linq ${res.status}: ${detail}`);
  }

  const topMessage =
    payload.message && typeof payload.message === "object"
      ? (payload.message as Record<string, unknown>)
      : null;
  const providerMessageId =
    typeof topMessage?.id === "string" && topMessage.id.trim() ? topMessage.id.trim() : null;

  return { chatId, providerMessageId };
}

export function buildLinqSendParts(
  content: string,
  attachmentIds: string[] = [],
): LinqMessagePart[] {
  const parts: LinqMessagePart[] = [];
  const text = content.trim();
  if (text) {
    parts.push({ type: "text", value: text });
  }
  for (const attachmentId of attachmentIds) {
    const id = attachmentId.trim();
    if (id) parts.push({ type: "media", attachment_id: id });
  }
  return parts;
}

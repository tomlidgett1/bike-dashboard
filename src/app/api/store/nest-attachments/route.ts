import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { uploadLinqAttachmentBytes } from "@/lib/nest/linq-outbound-media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_PREFIXES = ["image/", "application/pdf", "video/mp4", "video/quicktime"];
const ALLOWED_EXACT = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
]);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isAllowedContentType(contentType: string): boolean {
  const type = contentType.trim().toLowerCase();
  if (!type) return false;
  if (ALLOWED_EXACT.has(type)) return true;
  return ALLOWED_PREFIXES.some((prefix) => type.startsWith(prefix));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json({ error: "file is required." }, 400);
    }

    if (file.size <= 0) {
      return json({ error: "File is empty." }, 400);
    }
    if (file.size > MAX_BYTES) {
      return json({ error: "File must be 20 MB or smaller." }, 400);
    }

    const contentType = (file.type || "application/octet-stream").trim().toLowerCase();
    if (!isAllowedContentType(contentType)) {
      return json(
        { error: "Only photos, videos, and PDFs can be attached." },
        400,
      );
    }

    const filename = (file.name || "attachment").trim() || "attachment";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const attachmentId = await uploadLinqAttachmentBytes(bytes, filename, contentType);

    return json({
      attachmentId,
      filename,
      contentType,
      sizeBytes: file.size,
    });
  } catch (error) {
    console.error("[store/nest-attachments] POST failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not upload attachment.",
      },
      500,
    );
  }
}

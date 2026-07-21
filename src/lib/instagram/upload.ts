/**
 * Upload Instagram post images to Cloudinary via the existing Supabase edge function.
 */

import sharp from "sharp";

function getSupabaseFunctionUrl(functionName: string): string {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`;
}

function getInternalEdgeSecret(): string {
  const secret =
    process.env.INTERNAL_EDGE_SHARED_SECRET?.trim() ||
    process.env.NEST_INTERNAL_EDGE_SHARED_SECRET?.trim();
  if (!secret) {
    throw new Error("INTERNAL_EDGE_SHARED_SECRET is not configured.");
  }
  return secret;
}

export async function uploadInstagramJpegToCloudinary(params: {
  ownerUserId: string;
  jpegBytes: Buffer;
  index?: number;
}): Promise<{ url: string; publicId: string }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(params.jpegBytes)], { type: "image/jpeg" }),
    "instagram.jpg",
  );
  form.append("listingId", `store-instagram-${params.ownerUserId}`);
  form.append("index", String(params.index ?? Date.now()));

  const response = await fetch(getSupabaseFunctionUrl("upload-to-cloudinary"), {
    method: "POST",
    headers: {
      "x-internal-secret": getInternalEdgeSecret(),
    },
    body: form,
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    data?: { url?: string; publicId?: string };
  };

  if (!response.ok || !data.success || !data.data?.url) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Cloudinary upload via Supabase failed (${response.status}).`,
    );
  }

  return {
    url: String(data.data.url),
    publicId: String(data.data.publicId || ""),
  };
}

/** Normalise uploads to Instagram-friendly JPEG (max edge 1440, under 8MB). */
export async function prepareInstagramUploadJpeg(
  source: Buffer,
): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize({
      width: 1440,
      height: 1440,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

export async function uploadInstagramImageFiles(params: {
  ownerUserId: string;
  files: Array<{ bytes: Buffer; name?: string }>;
}): Promise<Array<{ url: string; publicId: string }>> {
  if (params.files.length === 0) {
    throw new Error("Add at least one photo.");
  }
  if (params.files.length > 10) {
    throw new Error("Instagram carousels support up to 10 photos.");
  }

  const uploaded: Array<{ url: string; publicId: string }> = [];
  for (let index = 0; index < params.files.length; index += 1) {
    const jpegBytes = await prepareInstagramUploadJpeg(params.files[index].bytes);
    if (jpegBytes.byteLength > 8 * 1024 * 1024) {
      throw new Error(
        `Photo ${index + 1} is still too large after compression (max 8MB).`,
      );
    }
    uploaded.push(
      await uploadInstagramJpegToCloudinary({
        ownerUserId: params.ownerUserId,
        jpegBytes,
        index: Date.now() + index,
      }),
    );
  }
  return uploaded;
}

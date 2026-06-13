import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  uploadRemoteListingImageToCloudinary,
  type CloudinaryListingImage,
} from "@/lib/marketplace/cloudinary-listing-images";
import { buildListingFormDataFromAnalysis } from "@/lib/marketplace/listing-analysis-form-data";
import type { ListingAnalysisResult } from "@/lib/ai/schemas";

type IncomingImage =
  | string
  | {
      url?: unknown;
      mimeType?: unknown;
      mime_type?: unknown;
      filename?: unknown;
      attachmentId?: unknown;
      attachment_id?: unknown;
    };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function getInternalSecrets(): string[] {
  return [
    process.env.INTERNAL_EDGE_SHARED_SECRET,
    process.env.NEST_INTERNAL_EDGE_SHARED_SECRET,
    process.env.NEST_SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SECRET_KEYS,
    process.env.NEW_SUPABASE_SECRET_KEY,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function readInternalToken(request: NextRequest): string {
  const headerSecret = request.headers.get("x-internal-secret")?.trim();
  if (headerSecret) return headerSecret;
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function authorizeInternalRequest(request: NextRequest): boolean {
  const received = readInternalToken(request);
  if (!received) return false;
  return getInternalSecrets().some((secret) => timingSafeEqual(received, secret));
}

function firstInternalSecret(): string | null {
  return (
    process.env.NEST_SUPABASE_SECRET_KEY?.trim() ||
    getInternalSecrets()[0] ||
    null
  );
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalisePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, "");
  if (/^\+[1-9]\d{8,14}$/.test(cleaned)) return cleaned;
  return null;
}

function normaliseImages(value: unknown): IncomingImage[] {
  if (!Array.isArray(value)) return [];

  const images: IncomingImage[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const url = item.trim();
      if (url) images.push(url);
      continue;
    }

    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) continue;

    images.push({
      url,
      mimeType: row.mimeType ?? row.mime_type,
      filename: row.filename,
      attachmentId: row.attachmentId ?? row.attachment_id,
    });
  }

  return images;
}

function imageUrlOf(image: IncomingImage): string {
  return typeof image === "string" ? image : String(image.url || "");
}

function getPublicBaseUrl(request: NextRequest): string {
  const explicit =
    process.env.YELLOW_JERSEY_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_YELLOW_JERSEY_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, "")}`;

  const origin = request.headers.get("origin") || request.nextUrl.origin;
  return origin.replace(/\/+$/, "");
}

async function detectPhotoGroupCount(imageUrls: string[]): Promise<number> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = firstInternalSecret();
  if (!supabaseUrl || !secret) return 1;

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/group-photos-ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({ imageUrls }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.groups)) return 1;
    return Math.max(1, data.groups.length);
  } catch (error) {
    console.warn("[text-upload] photo grouping check failed:", error);
    return 1;
  }
}

async function analyzeListing(params: {
  imageUrls: string[];
  userHints: Record<string, unknown>;
}): Promise<ListingAnalysisResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = firstInternalSecret();
  if (!supabaseUrl || !secret) {
    throw new Error("Yellow Jersey text upload analysis is not configured");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/analyze-listing-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({
      imageUrls: params.imageUrls,
      userHints: params.userHints,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.analysis) {
    throw new Error(
      typeof data.error === "string"
        ? data.details
          ? `${data.error}: ${data.details}`
          : data.error
        : "AI analysis failed",
    );
  }

  return data.analysis as ListingAnalysisResult;
}

export async function POST(request: NextRequest) {
  if (!authorizeInternalRequest(request)) {
    return json({ error: "unauthorised" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = await request.json();
    payload = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const phoneE164 = normalisePhone(payload.phoneE164 ?? payload.phone_e164 ?? payload.phone);
  const images = normaliseImages(payload.images ?? payload.imageUrls ?? payload.image_urls);
  const mode = payload.mode === "bulk" ? "bulk" : "single";
  const userHints =
    payload.userHints && typeof payload.userHints === "object"
      ? payload.userHints as Record<string, unknown>
      : {};

  if (!phoneE164) {
    return json({ error: "phoneE164 is required" }, 400);
  }
  if (images.length === 0) {
    return json({ error: "at least one image is required" }, 400);
  }
  if (images.length > 30) {
    return json({ error: "text upload supports up to 30 images" }, 400);
  }

  const token = nanoid(28);
  const imageUrls = images.map(imageUrlOf);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const uploadedImages: CloudinaryListingImage[] = [];
    for (let index = 0; index < imageUrls.length; index++) {
      uploadedImages.push(await uploadRemoteListingImageToCloudinary({
        imageUrl: imageUrls[index],
        token,
        index,
      }));
    }

    // Bulk mode skips server-side analysis — the photos are handed to the
    // bulk upload flow, which groups and analyses them with the user's auth.
    // Even when the sender didn't say "bulk", multi-photo uploads are checked
    // for distinct products so several items never collapse into one listing.
    let isBulk = mode === "bulk" && uploadedImages.length > 1;
    if (!isBulk && uploadedImages.length > 1) {
      const groupCount = await detectPhotoGroupCount(
        uploadedImages.map((image) => image.url),
      );
      if (groupCount > 1) {
        console.log(`[text-upload] detected ${groupCount} products — routing to bulk flow`);
        isBulk = true;
      }
    }

    let analysis: ListingAnalysisResult | null = null;
    let formData: Record<string, unknown> = { bulk: true };

    if (!isBulk) {
      // A single listing holds at most 10 photos.
      if (uploadedImages.length > 10) uploadedImages.length = 10;
      analysis = await analyzeListing({
        imageUrls: uploadedImages.map((image) => image.url),
        userHints,
      });
      formData = buildListingFormDataFromAnalysis(
        analysis,
        uploadedImages.map((image) => image.url),
        uploadedImages,
      );
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("marketplace_text_upload_sessions")
      .insert({
        session_token: token,
        phone_e164: phoneE164,
        source: "nest",
        image_urls: imageUrls,
        uploaded_images: uploadedImages,
        analysis,
        form_data: formData,
        status: "ready",
        expires_at: expiresAt,
      });

    if (error) {
      console.error("[text-upload] session insert failed:", error);
      return json({ error: "handoff session could not be saved" }, 500);
    }

    const handoffUrl = isBulk
      ? `${getPublicBaseUrl(request)}/marketplace/sell?mode=bulk&textUploadToken=${encodeURIComponent(token)}`
      : `${getPublicBaseUrl(request)}/marketplace/sell?textUploadToken=${encodeURIComponent(token)}`;

    return json({
      ok: true,
      token,
      handoffUrl,
      expiresAt,
      imageCount: uploadedImages.length,
      title: typeof formData.title === "string" ? formData.title : null,
    });
  } catch (error) {
    console.error("[text-upload] processing failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "text upload processing failed",
      },
      500,
    );
  }
}

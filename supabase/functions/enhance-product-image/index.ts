import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { cloudinaryUploadAuthHeader } from "../_shared/cloudinary-auth.ts";
import { buildCloudinaryUrls, CLOUDINARY_EAGER_TRANSFORMS } from "../_shared/cloudinary-transforms.ts";
import {
  callOpenAIEcommerceHeroEdit,
  downloadImageAsBase64,
  ECOMMERCE_HERO_PROMPT,
  OPENAI_ECOMMERCE_IMAGE_MODEL,
} from "../_shared/ecommerce-hero-openai.ts";

// ============================================================
// Enhance Product Image — ecommerce primer + shadow (sync upload flow)
// ============================================================
// OpenAI Images Edit: gpt-image-2 → light grey studio background + soft shadow.
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🚀 [ENHANCE-IMAGE] Starting image enhancement...");

    // Get required environment variables
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME")?.trim();
    const CLOUDINARY_API_KEY = Deno.env.get("CLOUDINARY_API_KEY")?.trim();
    const CLOUDINARY_API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET")?.trim();

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error("Cloudinary credentials not configured");
    }

    // Parse request body
    const body = await req.json();
    const { imageUrl, listingId } = body;

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🖼️ [ENHANCE-IMAGE] Processing image: ${imageUrl.substring(0, 80)}...`);

    // Step 1: Download source image
    console.log(`📥 [ENHANCE-IMAGE] Downloading source image...`);
    const downloaded = await downloadImageAsBase64(imageUrl);

    if (!downloaded) {
      console.error(`❌ [ENHANCE-IMAGE] All download strategies failed for: ${imageUrl}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to download source image (blocked by the source site after all retry strategies)",
          code: "SOURCE_DOWNLOAD_FAILED",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(
      `✅ [ENHANCE-IMAGE] Downloaded image (${(downloaded.base64.length / 1024).toFixed(0)}KB base64, ${downloaded.mimeType})`,
    );

    // Step 2: OpenAI Images Edit (gpt-image-2)
    console.log(`🤖 [ENHANCE-IMAGE] Calling OpenAI ${OPENAI_ECOMMERCE_IMAGE_MODEL}...`);
    const heroImageBase64 = await callOpenAIEcommerceHeroEdit(
      OPENAI_API_KEY,
      downloaded.base64,
      downloaded.mimeType,
      ECOMMERCE_HERO_PROMPT,
    );
    
    if (!heroImageBase64) {
      throw new Error("OpenAI returned no image");
    }
    console.log(`✅ [ENHANCE-IMAGE] Generated enhanced image (${(heroImageBase64.length / 1024).toFixed(0)}KB base64)`);

    // Step 3: Upload to Cloudinary
    console.log(`☁️ [ENHANCE-IMAGE] Uploading to Cloudinary...`);
    const identifier = listingId || `quick-${Date.now()}`;
    const cloudinaryResult = await uploadToCloudinary(
      heroImageBase64,
      identifier,
      CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET
    );
    
    if (!cloudinaryResult.success) {
      throw new Error(cloudinaryResult.error || "Cloudinary upload failed");
    }
    console.log(`✅ [ENHANCE-IMAGE] Uploaded to Cloudinary: ${cloudinaryResult.publicId}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url: cloudinaryResult.url,
          cardUrl: cloudinaryResult.cardUrl,
          thumbnailUrl: cloudinaryResult.thumbnailUrl,
          galleryUrl: cloudinaryResult.galleryUrl,
          detailUrl: cloudinaryResult.detailUrl,
          publicId: cloudinaryResult.publicId,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ [ENHANCE-IMAGE] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Enhancement failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================
// Helper Functions
// ============================================================

/**
 * Uploads base64 image to Cloudinary with e-commerce variants
 */
async function uploadToCloudinary(
  imageBase64: string,
  identifier: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string
): Promise<{
  success: boolean;
  url?: string;
  publicId?: string;
  cardUrl?: string;
  thumbnailUrl?: string;
  galleryUrl?: string;
  detailUrl?: string;
  error?: string;
}> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `bike-marketplace/enhanced/${identifier}/${timestamp}`;

    const dataUri = `data:image/png;base64,${imageBase64}`;

    const formData = new FormData();
    formData.append("file", dataUri);
    formData.append("public_id", publicId);
    formData.append("angle", "ignore");
    formData.append("eager", CLOUDINARY_EAGER_TRANSFORMS);
    formData.append("eager_async", "false");

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        headers: { Authorization: cloudinaryUploadAuthHeader(apiKey, apiSecret) },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cloudinary error:", errorText);
      return { success: false, error: `Cloudinary upload failed: ${errorText}` };
    }

    const result = await response.json();
    const urls = buildCloudinaryUrls(cloudName, result.public_id);
    const thumbnailUrl = urls.thumbnailUrl;
    const cardUrl = urls.cardUrl;
    const galleryUrl = urls.galleryUrl;
    const detailUrl = urls.detailUrl;

    // Pre-warm CDN cache
    fetch(cardUrl).catch(() => {});
    fetch(thumbnailUrl).catch(() => {});

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      cardUrl,
      thumbnailUrl,
      galleryUrl,
      detailUrl,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}


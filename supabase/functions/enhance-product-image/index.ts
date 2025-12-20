import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ============================================================
// Enhance Product Image - Synchronous Background Removal
// ============================================================
// Uses OpenAI GPT Image 1.5 Edit API to transform a product image
// into a professional e-commerce hero shot with clean background.
// This is a synchronous version for use during upload flow.
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// The prompt that instructs GPT Image 1.5 to preserve the product exactly
const ECOMMERCE_HERO_PROMPT = `Place this exact product photograph on a soft light gray e-commerce background (not pure white - use a subtle off-white/very light gray tone like #F5F5F5 or #F8F8F8). Create a perfect 1024x1024 square hero product shot. Add subtle professional product photography shadows beneath the product to give it depth and grounding.

CRITICAL REQUIREMENTS:
1. Do NOT alter, enhance, clean, repair, or modify the product itself in ANY way
2. Preserve every scratch, dirt mark, scuff, wear sign, and imperfection exactly as shown
3. The product must remain photographically identical to the input - same colours, same condition, same details
4. Only change the BACKGROUND to a soft light gray/off-white tone and add realistic soft shadows beneath the product
5. Centre the product in the frame with appropriate padding for a professional e-commerce look
6. Ensure the entire product is visible within the square frame
7. Maintain the original image quality and sharpness of the product

The goal is to make this look like a professional product listing photo while showing the true condition of the item.`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🚀 [ENHANCE-IMAGE] Starting image enhancement...");

    // Get required environment variables
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const CLOUDINARY_API_KEY = Deno.env.get("CLOUDINARY_API_KEY");
    const CLOUDINARY_API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET");

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

    // Step 1: Download source image and convert to base64
    console.log(`📥 [ENHANCE-IMAGE] Downloading source image...`);
    const imageBase64 = await downloadImageAsBase64(imageUrl);
    
    if (!imageBase64) {
      throw new Error("Failed to download source image");
    }
    console.log(`✅ [ENHANCE-IMAGE] Downloaded image (${(imageBase64.length / 1024).toFixed(0)}KB base64)`);

    // Step 2: Call OpenAI GPT Image 1.5 Edit API
    console.log(`🤖 [ENHANCE-IMAGE] Calling OpenAI GPT Image 1.5...`);
    const heroImageBase64 = await callOpenAIImageEdit(
      OPENAI_API_KEY,
      imageBase64,
      ECOMMERCE_HERO_PROMPT
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
 * Downloads an image from URL and returns base64 encoded string
 */
async function downloadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BikeMarketplace/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Failed to download image: HTTP ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.startsWith("image/")) {
      console.error(`Invalid content type: ${contentType}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to base64 in chunks to avoid stack overflow
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  } catch (error) {
    console.error("Error downloading image:", error);
    return null;
  }
}

/**
 * Calls OpenAI GPT Image 1.5 Edit API
 */
async function callOpenAIImageEdit(
  apiKey: string,
  imageBase64: string,
  prompt: string
): Promise<string | null> {
  try {
    // Convert base64 to blob for the image field
    const binaryString = atob(imageBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "image/png" });
    
    // Create form data for multipart upload
    const formData = new FormData();
    formData.append("image", blob, "source.png");
    formData.append("prompt", prompt);
    formData.append("model", "gpt-image-1.5");
    formData.append("size", "1024x1024");
    formData.append("quality", "high");

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI API error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.data || !result.data[0]) {
      throw new Error("No image in OpenAI response");
    }

    // GPT Image models return base64 encoded images
    return result.data[0].b64_json;
  } catch (error) {
    console.error("OpenAI Image Edit error:", error);
    throw error;
  }
}

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

    // Standard eager transformations matching existing system
    const eagerTransforms = "w_100,c_limit,q_auto:low,f_webp|w_200,ar_1:1,c_fill,g_center,q_auto:good,f_webp|w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp|w_1200,ar_4:3,c_pad,b_white,q_auto:best,f_webp|w_2000,c_limit,q_auto:best,f_webp";

    // Generate signature
    const signatureString = `eager=${eagerTransforms}&eager_async=false&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Build data URI
    const dataUri = `data:image/png;base64,${imageBase64}`;

    // Create form data
    const formData = new FormData();
    formData.append("file", dataUri);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("signature", signature);
    formData.append("public_id", publicId);
    formData.append("eager", eagerTransforms);
    formData.append("eager_async", "false");

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cloudinary error:", errorText);
      return { success: false, error: `Cloudinary upload failed: ${errorText}` };
    }

    const result = await response.json();
    const baseUrl = `https://res.cloudinary.com/${cloudName}/image/upload`;

    // Build variant URLs matching existing system
    const thumbnailUrl = `${baseUrl}/w_100,c_limit,q_auto:low,f_webp/${result.public_id}`;
    const cardUrl = `${baseUrl}/w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${result.public_id}`;
    const galleryUrl = `${baseUrl}/w_1200,ar_4:3,c_pad,b_white,q_auto:best,f_webp/${result.public_id}`;
    const detailUrl = `${baseUrl}/w_2000,c_limit,q_auto:best,f_webp/${result.public_id}`;

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


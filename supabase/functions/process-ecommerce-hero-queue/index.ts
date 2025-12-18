import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Process E-Commerce Hero Queue
// ============================================================
// Uses OpenAI GPT Image 1.5 Edit API to transform product images
// into professional e-commerce hero shots with clean backgrounds
// while preserving exact product condition (scratches, dirt, wear)
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// The prompt that instructs GPT Image 1.5 to preserve the product exactly
const ECOMMERCE_HERO_PROMPT = `Place this exact product photograph on a pure white e-commerce background. Create a perfect 1024x1024 square hero product shot. Add subtle professional product photography shadows beneath the product to give it depth and grounding.

CRITICAL REQUIREMENTS:
1. Do NOT alter, enhance, clean, repair, or modify the product itself in ANY way
2. Preserve every scratch, dirt mark, scuff, wear sign, and imperfection exactly as shown
3. The product must remain photographically identical to the input - same colours, same condition, same details
4. Only change the BACKGROUND to pure white and add realistic soft shadows beneath the product
5. Centre the product in the frame with appropriate padding for a professional e-commerce look
6. Ensure the entire product is visible within the square frame
7. Maintain the original image quality and sharpness of the product

The goal is to make this look like a professional product listing photo while showing the true condition of the item.`;

interface QueueItem {
  id: string;
  product_id: string;
  source_image_id: string | null;
  source_image_url: string;
  status: string;
}

interface ProcessResult {
  success: boolean;
  queueId: string;
  productId: string;
  error?: string;
  cloudinaryUrl?: string;
  cardUrl?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🚀 [ECOMMERCE-HERO] Starting queue processing...");

    // Get required environment variables
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const CLOUDINARY_API_KEY = Deno.env.get("CLOUDINARY_API_KEY");
    const CLOUDINARY_API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error("Cloudinary credentials not configured");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    // Create Supabase client with service role (for queue operations)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body for optional parameters
    let batchSize = 5;
    try {
      const body = await req.json();
      if (body.batchSize && typeof body.batchSize === "number") {
        batchSize = Math.min(Math.max(body.batchSize, 1), 10); // Limit 1-10
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    // First, reset any stuck items (processing for > 5 minutes)
    const { data: resetCount } = await supabase.rpc("reset_stuck_ecommerce_hero_items");
    if (resetCount && resetCount > 0) {
      console.log(`⚠️ [ECOMMERCE-HERO] Reset ${resetCount} stuck items`);
    }

    // Fetch pending queue items (atomically marks them as processing)
    const { data: queueItems, error: fetchError } = await supabase
      .rpc("get_pending_ecommerce_hero_items", { batch_size: batchSize });

    if (fetchError) {
      console.error("❌ [ECOMMERCE-HERO] Failed to fetch queue items:", fetchError);
      throw new Error(`Failed to fetch queue: ${fetchError.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
      console.log("✅ [ECOMMERCE-HERO] No pending items in queue");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending items" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 [ECOMMERCE-HERO] Processing ${queueItems.length} items...`);

    const results: ProcessResult[] = [];

    // Process each queue item
    for (const item of queueItems as QueueItem[]) {
      console.log(`\n🖼️ [ECOMMERCE-HERO] Processing item ${item.id} for product ${item.product_id}`);
      
      try {
        // Step 1: Download source image and convert to base64
        console.log(`📥 [ECOMMERCE-HERO] Downloading source image...`);
        const imageBase64 = await downloadImageAsBase64(item.source_image_url);
        
        if (!imageBase64) {
          throw new Error("Failed to download source image");
        }
        console.log(`✅ [ECOMMERCE-HERO] Downloaded image (${(imageBase64.length / 1024).toFixed(0)}KB base64)`);

        // Step 2: Call OpenAI GPT Image 1.5 Edit API
        console.log(`🤖 [ECOMMERCE-HERO] Calling OpenAI GPT Image 1.5...`);
        const heroImageBase64 = await callOpenAIImageEdit(
          OPENAI_API_KEY,
          imageBase64,
          ECOMMERCE_HERO_PROMPT
        );
        
        if (!heroImageBase64) {
          throw new Error("OpenAI returned no image");
        }
        console.log(`✅ [ECOMMERCE-HERO] Generated hero image (${(heroImageBase64.length / 1024).toFixed(0)}KB base64)`);

        // Step 3: Upload to Cloudinary
        console.log(`☁️ [ECOMMERCE-HERO] Uploading to Cloudinary...`);
        const cloudinaryResult = await uploadToCloudinary(
          heroImageBase64,
          item.product_id,
          CLOUDINARY_CLOUD_NAME,
          CLOUDINARY_API_KEY,
          CLOUDINARY_API_SECRET
        );
        
        if (!cloudinaryResult.success) {
          throw new Error(cloudinaryResult.error || "Cloudinary upload failed");
        }
        console.log(`✅ [ECOMMERCE-HERO] Uploaded to Cloudinary: ${cloudinaryResult.publicId}`);

        // Step 4: Mark queue item as completed
        await supabase.rpc("complete_ecommerce_hero_item", {
          p_queue_id: item.id,
          p_cloudinary_url: cloudinaryResult.url,
          p_card_url: cloudinaryResult.cardUrl,
          p_thumbnail_url: cloudinaryResult.thumbnailUrl,
          p_gallery_url: cloudinaryResult.galleryUrl,
          p_detail_url: cloudinaryResult.detailUrl,
          p_public_id: cloudinaryResult.publicId,
        });

        // Step 5: Update product's cached image URL, primary_image_url, and mark as optimized
        const { error: updateError } = await supabase
          .from("products")
          .update({
            cached_image_url: cloudinaryResult.cardUrl,
            cached_thumbnail_url: cloudinaryResult.thumbnailUrl,
            primary_image_url: cloudinaryResult.galleryUrl || cloudinaryResult.detailUrl || cloudinaryResult.cardUrl,
            has_displayable_image: true,
            hero_background_optimized: true,
          })
          .eq("id", item.product_id);

        if (updateError) {
          console.error(`⚠️ [ECOMMERCE-HERO] Failed to update product cached image:`, updateError);
        } else {
          console.log(`✅ [ECOMMERCE-HERO] Updated product ${item.product_id} cached_image_url, primary_image_url, and marked as optimized`);
        }

        // Step 6: Preserve original image and create new product_images record
        
        // First, check how many images exist in product_images for this product
        const { data: existingImages } = await supabase
          .from("product_images")
          .select("id, cloudinary_url, card_url, external_url")
          .eq("product_id", item.product_id);
        
        // If source_image_id is null, the original image came from JSONB, not product_images
        // We need to preserve it by inserting it into product_images first
        if (!item.source_image_id) {
          // Check if this source URL already exists in product_images
          const sourceAlreadyExists = existingImages?.some(img => 
            img.cloudinary_url === item.source_image_url || 
            img.card_url === item.source_image_url ||
            img.external_url === item.source_image_url
          );
          
          if (!sourceAlreadyExists) {
            console.log(`📦 [ECOMMERCE-HERO] Preserving original JSONB image in product_images...`);
            // Insert the original source image to preserve it
            const { error: preserveError } = await supabase
              .from("product_images")
              .insert({
                product_id: item.product_id,
                external_url: item.source_image_url,
                cloudinary_url: item.source_image_url,
                card_url: item.source_image_url,
                is_primary: false,
                is_downloaded: false,
                is_ai_generated: false,
                approval_status: "approved",
                sort_order: existingImages ? existingImages.length + 1 : 1, // Put after existing images
              });
            
            if (preserveError) {
              console.error(`⚠️ [ECOMMERCE-HERO] Failed to preserve original image:`, preserveError);
            } else {
              console.log(`✅ [ECOMMERCE-HERO] Preserved original JSONB image`);
            }
          }
        }
        
        // Set any existing primary images to false
        await supabase
          .from("product_images")
          .update({ is_primary: false })
          .eq("product_id", item.product_id)
          .eq("is_primary", true);
        
        // Insert new primary image (the AI-transformed one)
        const { error: imageRecordError } = await supabase
          .from("product_images")
          .insert({
            product_id: item.product_id,
            cloudinary_url: cloudinaryResult.url,
            card_url: cloudinaryResult.cardUrl,
            thumbnail_url: cloudinaryResult.thumbnailUrl,
            gallery_url: cloudinaryResult.galleryUrl,
            detail_url: cloudinaryResult.detailUrl,
            external_url: cloudinaryResult.url,
            is_primary: true,
            is_downloaded: true,
            is_ai_generated: true,
            approval_status: "approved",
            sort_order: 0,
            width: 1024,
            height: 1024,
            mime_type: "image/webp",
          });

        if (imageRecordError) {
          console.error(`⚠️ [ECOMMERCE-HERO] Failed to insert image record:`, imageRecordError);
        } else {
          console.log(`✅ [ECOMMERCE-HERO] Inserted new primary image for product ${item.product_id}`);
        }

        results.push({
          success: true,
          queueId: item.id,
          productId: item.product_id,
          cloudinaryUrl: cloudinaryResult.url,
          cardUrl: cloudinaryResult.cardUrl,
        });

        console.log(`✅ [ECOMMERCE-HERO] Completed item ${item.id}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`❌ [ECOMMERCE-HERO] Failed item ${item.id}:`, errorMessage);
        
        // Mark as failed
        await supabase.rpc("fail_ecommerce_hero_item", {
          p_queue_id: item.id,
          p_error_message: errorMessage,
        });

        results.push({
          success: false,
          queueId: item.id,
          productId: item.product_id,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`\n🏁 [ECOMMERCE-HERO] Processing complete: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        successCount,
        failCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ [ECOMMERCE-HERO] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Processing failed",
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
    // Detect mime type from base64 header or default to png
    const mimeType = "image/png";
    const dataUri = `data:${mimeType};base64,${imageBase64}`;

    // Create form data for multipart upload
    const formData = new FormData();
    
    // Convert base64 to blob for the image field
    const binaryString = atob(imageBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "image/png" });
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
  productId: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string
): Promise<{
  success: boolean;
  url?: string;
  publicId?: string;
  cardUrl?: string;
  thumbnailUrl?: string;
  mobileCardUrl?: string;
  galleryUrl?: string;
  detailUrl?: string;
  error?: string;
}> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `bike-marketplace/ecommerce-hero/${productId}/${timestamp}`;

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
    const mobileCardUrl = `${baseUrl}/w_200,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${result.public_id}`;
    const cardUrl = `${baseUrl}/w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${result.public_id}`;
    const galleryUrl = `${baseUrl}/w_1200,ar_4:3,c_pad,b_white,q_auto:best,f_webp/${result.public_id}`;
    const detailUrl = `${baseUrl}/w_2000,c_limit,q_auto:best,f_webp/${result.public_id}`;

    // Pre-warm CDN cache
    fetch(cardUrl).catch(() => {});
    fetch(thumbnailUrl).catch(() => {});
    fetch(mobileCardUrl).catch(() => {});

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      cardUrl,
      thumbnailUrl,
      mobileCardUrl,
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


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cloudinaryUploadAuthHeader } from "../_shared/cloudinary-auth.ts";
import { buildCloudinaryUrls, CLOUDINARY_EAGER_TRANSFORMS } from "../_shared/cloudinary-transforms.ts";
import {
  callOpenAIEcommerceHeroEdit,
  downloadImageAsBase64,
  ECOMMERCE_HERO_PROMPT,
  OPENAI_ECOMMERCE_IMAGE_MODEL,
} from "../_shared/ecommerce-hero-openai.ts";

// ============================================================
// Process E-Commerce Hero Queue
// ============================================================
// OpenAI Images Edit (gpt-image-2): light grey primer + soft studio shadow.
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME")?.trim();
    const CLOUDINARY_API_KEY = Deno.env.get("CLOUDINARY_API_KEY")?.trim();
    const CLOUDINARY_API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET")?.trim();
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
        // Step 1: Download source image
        console.log(`📥 [ECOMMERCE-HERO] Downloading source image...`);
        const downloaded = await downloadImageAsBase64(item.source_image_url);

        if (!downloaded) {
          throw new Error("Failed to download source image");
        }
        console.log(
          `✅ [ECOMMERCE-HERO] Downloaded image (${(downloaded.base64.length / 1024).toFixed(0)}KB base64, ${downloaded.mimeType})`,
        );

        // Step 2: OpenAI Images Edit (gpt-image-2)
        console.log(`🤖 [ECOMMERCE-HERO] Calling OpenAI ${OPENAI_ECOMMERCE_IMAGE_MODEL}...`);
        const heroImageBase64 = await callOpenAIEcommerceHeroEdit(
          OPENAI_API_KEY,
          downloaded.base64,
          downloaded.mimeType,
          ECOMMERCE_HERO_PROMPT,
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

        // Step 5: Update product's cached image URL, primary_image_url, images JSONB, and mark as optimized
        // IMPORTANT: We need to update the images JSONB array because the product page reads from there first
        
        // First, get current images array
        const { data: currentProduct } = await supabase
          .from("products")
          .select("images")
          .eq("id", item.product_id)
          .single();
        
        // Build the new AI image entry for JSONB
        const aiImageEntry = {
          id: `ai-hero-${Date.now()}`,
          url: cloudinaryResult.url,
          cardUrl: cloudinaryResult.cardUrl,
          mobileCardUrl: cloudinaryResult.mobileCardUrl,
          thumbnailUrl: cloudinaryResult.thumbnailUrl,
          galleryUrl: cloudinaryResult.galleryUrl,
          detailUrl: cloudinaryResult.detailUrl,
          isPrimary: true,
          order: 0,
          source: "ai_hero",
          isAiGenerated: true,
        };
        
        // Get existing images and mark them as non-primary, shift order
        const existingJsonbImages = (currentProduct?.images as any[]) || [];
        const updatedImages = [
          aiImageEntry,
          ...existingJsonbImages.map((img: any, idx: number) => ({
            ...img,
            isPrimary: false,
            order: idx + 1,
          })),
        ];
        
        console.log(`📦 [ECOMMERCE-HERO] Updating images JSONB with AI hero image (total: ${updatedImages.length} images)`);
        
        const { error: updateError } = await supabase
          .from("products")
          .update({
            images: updatedImages,
            cached_image_url: cloudinaryResult.cardUrl,
            cached_thumbnail_url: cloudinaryResult.thumbnailUrl,
            primary_image_url: cloudinaryResult.galleryUrl || cloudinaryResult.detailUrl || cloudinaryResult.cardUrl,
            has_displayable_image: true,
            hero_background_optimized: true,
          })
          .eq("id", item.product_id);

        if (updateError) {
          console.error(`⚠️ [ECOMMERCE-HERO] Failed to update product:`, updateError);
        } else {
          console.log(`✅ [ECOMMERCE-HERO] Updated product ${item.product_id}: images JSONB, cached_image_url, primary_image_url, hero_background_optimized`);
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

    const dataUri = `data:image/png;base64,${imageBase64}`;

    const formData = new FormData();
    formData.append("file", dataUri);
    formData.append("public_id", publicId);
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
    const mobileCardUrl = urls.mobileCardUrl;
    const cardUrl = urls.cardUrl;
    const galleryUrl = urls.galleryUrl;
    const detailUrl = urls.detailUrl;

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


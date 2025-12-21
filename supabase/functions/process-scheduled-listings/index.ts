import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Process Scheduled Listings
// ============================================================
// Checks for scheduled listings that are due to be published
// and creates them as products in the database.
// Designed to run on a cron schedule (every 5 minutes).
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ScheduledListing {
  id: string;
  target_user_id: string;
  scheduled_for: string;
  form_data: any;
  images: any[];
}

interface ProcessResult {
  success: boolean;
  scheduledId: string;
  productId?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🕐 [SCHEDULED] Starting scheduled listings processing...");

    // Get required environment variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch pending listings that are due (scheduled_for <= NOW)
    const { data: dueListings, error: fetchError } = await supabase
      .from("scheduled_listings")
      .select("id, target_user_id, scheduled_for, form_data, images")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(10); // Process up to 10 at a time

    if (fetchError) {
      console.error("❌ [SCHEDULED] Error fetching due listings:", fetchError);
      throw new Error(`Failed to fetch due listings: ${fetchError.message}`);
    }

    if (!dueListings || dueListings.length === 0) {
      console.log("✅ [SCHEDULED] No listings due for publishing");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No listings due for publishing",
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📋 [SCHEDULED] Found ${dueListings.length} listings to publish`);

    // Process each listing
    const results: ProcessResult[] = [];

    for (const listing of dueListings as ScheduledListing[]) {
      try {
        console.log(`📝 [SCHEDULED] Publishing listing ${listing.id} for user ${listing.target_user_id}`);

        const formData = listing.form_data || {};
        const images = listing.images || [];

        // Map form data to database columns (matching the bulk API pattern)
        const productData = {
          user_id: listing.target_user_id,
          listing_type: "private_listing",
          listing_source: "scheduled",
          listing_status: "active",

          // Basic info
          description: formData.title || "",
          brand: formData.brand || null,
          model: formData.model || null,
          model_year: formData.modelYear || null,
          price: formData.price || 0,
          marketplace_category: formData.marketplace_category || "Bicycles",
          marketplace_subcategory: formData.marketplace_subcategory || null,

          // Images - use the images from formData if available, otherwise from listing.images
          images: formData.images || images.map((img: any, index: number) => ({
            id: img.id,
            url: img.url,
            cardUrl: img.cardUrl,
            thumbnailUrl: img.thumbnailUrl,
            galleryUrl: img.galleryUrl,
            detailUrl: img.detailUrl,
            order: index,
            isPrimary: index === 0,
          })),
          primary_image_url:
            formData.primaryImageUrl ||
            images[0]?.cardUrl ||
            images[0]?.url ||
            null,

          // Bike fields
          frame_size: formData.frameSize || null,
          frame_material: formData.frameMaterial || null,
          bike_type: formData.bikeType || null,
          groupset: formData.groupset || null,
          wheel_size: formData.wheelSize || null,
          suspension_type: formData.suspensionType || null,
          bike_weight: formData.bikeWeight || null,
          color_primary: formData.colorPrimary || null,
          color_secondary: formData.colorSecondary || null,

          // Part fields
          part_type_detail: formData.partTypeDetail || null,
          compatibility_notes: formData.compatibilityNotes || null,
          material: formData.material || null,
          weight: formData.weight || null,

          // Apparel fields
          size: formData.size || null,
          gender_fit: formData.genderFit || null,
          apparel_material: formData.apparelMaterial || null,

          // Condition and descriptions
          product_description: formData.productDescription || null,
          condition_rating: formData.conditionRating || null,
          condition_details: formData.conditionDetails || null,
          seller_notes: formData.sellerNotes || null,
          wear_notes: formData.wearNotes || null,
          usage_estimate: formData.usageEstimate || null,

          // Dates
          published_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days

          // System fields
          qoh: 1,
          is_active: true,
          system_sku: `SCHEDULED-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          lightspeed_item_id: `scheduled-${listing.id}`,
        };

        // Insert the product
        const { data: product, error: insertError } = await supabase
          .from("products")
          .insert(productData)
          .select("id")
          .single();

        if (insertError) {
          console.error(`❌ [SCHEDULED] Error creating product for ${listing.id}:`, insertError);

          // Mark as failed
          await supabase
            .from("scheduled_listings")
            .update({
              status: "failed",
              form_data: {
                ...formData,
                publish_error: insertError.message,
              },
            })
            .eq("id", listing.id);

          results.push({
            success: false,
            scheduledId: listing.id,
            error: insertError.message,
          });
          continue;
        }

        console.log(`✅ [SCHEDULED] Created product ${product.id} from scheduled listing ${listing.id}`);

        // Update the scheduled listing as published
        await supabase
          .from("scheduled_listings")
          .update({
            status: "published",
            published_product_id: product.id,
            published_at: new Date().toISOString(),
          })
          .eq("id", listing.id);

        results.push({
          success: true,
          scheduledId: listing.id,
          productId: product.id,
        });
      } catch (err) {
        console.error(`❌ [SCHEDULED] Exception processing ${listing.id}:`, err);

        results.push({
          success: false,
          scheduledId: listing.id,
          error: err instanceof Error ? err.message : "Unknown error",
        });

        // Mark as failed
        await supabase
          .from("scheduled_listings")
          .update({
            status: "failed",
            form_data: {
              ...listing.form_data,
              publish_error: err instanceof Error ? err.message : "Unknown error",
            },
          })
          .eq("id", listing.id);
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`✅ [SCHEDULED] Complete: ${successful} published, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} listings`,
        processed: results.length,
        successful,
        failed,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ [SCHEDULED] Fatal error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});


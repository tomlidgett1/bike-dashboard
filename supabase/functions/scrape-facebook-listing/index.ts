import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  cleanFacebookListingUrl,
  scrapeFacebookMarketplaceListing,
} from "../_shared/facebook-marketplace-scraper.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { facebookUrl } = await req.json();
    if (!facebookUrl) {
      return new Response(
        JSON.stringify({ error: "Facebook URL is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { listingUrl } = cleanFacebookListingUrl(facebookUrl);
    console.log(`🔍 [FB SCRAPER] Processing URL: ${listingUrl}`);

    const scrapedData = await scrapeFacebookMarketplaceListing(facebookUrl);

    console.log(`✅ [FB SCRAPER] Successfully scraped listing:`, {
      title: scrapedData.title,
      price: scrapedData.price,
      currency: scrapedData.currency,
      imageCount: scrapedData.images.length,
      location: scrapedData.location,
      condition: scrapedData.condition,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: scrapedData,
        source_url: listingUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ [FB SCRAPER] Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Invalid Facebook Marketplace URL") ? 400 : 500;

    return new Response(
      JSON.stringify({ error: message }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

// ============================================================
// Facebook Marketplace Scraper Edge Function
// ============================================================
// Extracts listing data from Facebook Marketplace URLs using Apify API
// Returns: images, title, price, description, location, condition

const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const APIFY_ACTOR_ID = "SlV9BkqOpAp9eb44q"; // pratikdani/facebook-marketplace-scraper

interface FacebookListingData {
  url?: string;
  title?: string;
  name?: string;
  price?: number | string;
  final_price?: number; // pratikdani actor uses this
  initial_price?: number; // pratikdani actor uses this
  priceRaw?: string;
  currency?: string;
  description?: string;
  seller_description?: string; // pratikdani actor uses this
  location?: string;
  condition?: string;
  category?: string;
  root_category?: string; // pratikdani actor uses this
  breadcrumbs?: Array<{
    breadcrumbs_name: string;
    breadcrumbs_url: string;
  }>;
  images?: string[];
  image?: string;
  seller?: {
    name?: string;
    location?: string;
    url?: string;
  };
}

interface ScrapedResult {
  title: string;
  price: number;
  currency: string;
  description: string;
  location: string;
  condition: string | null;
  category: string | null;
  images: string[];
}

function extractPrice(priceData: any): { amount: number; currency: string } {
  // Handle various price formats
  if (typeof priceData === 'number') {
    return { amount: priceData, currency: 'AUD' };
  }
  
  if (typeof priceData === 'string') {
    // Remove currency symbols and parse
    const cleaned = priceData.replace(/[^0-9.,]/g, '').replace(/,/g, '');
    const amount = parseFloat(cleaned);
    
    // Detect currency from string
    let currency = 'AUD';
    if (priceData.includes('$') && priceData.includes('US')) currency = 'USD';
    else if (priceData.includes('€')) currency = 'EUR';
    else if (priceData.includes('£')) currency = 'GBP';
    
    return { amount: isNaN(amount) ? 0 : amount, currency };
  }
  
  return { amount: 0, currency: 'AUD' };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const { facebookUrl } = await req.json();

    if (!facebookUrl) {
      return new Response(
        JSON.stringify({ error: "Facebook URL is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate Facebook Marketplace URL format
    const fbUrlPattern = /facebook\.com\/marketplace\/item\/\d+/;
    if (!fbUrlPattern.test(facebookUrl)) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid Facebook Marketplace URL. Expected format: facebook.com/marketplace/item/[id]" 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Clean the URL by removing query parameters
    // Input: https://www.facebook.com/marketplace/item/123/?ref=category_feed&referral_code=null
    // Output: https://www.facebook.com/marketplace/item/123
    let cleanedUrl = facebookUrl;
    try {
      const urlObj = new URL(facebookUrl);
      // Remove all query parameters and hash
      cleanedUrl = `${urlObj.origin}${urlObj.pathname}`;
      // Remove trailing slash if present
      cleanedUrl = cleanedUrl.replace(/\/$/, '');
      console.log(`🧹 [FB SCRAPER] Cleaned URL: ${facebookUrl} → ${cleanedUrl}`);
    } catch (err) {
      console.warn(`⚠️ [FB SCRAPER] Could not parse URL, using as-is: ${facebookUrl}`);
    }

    console.log(`🔍 [FB SCRAPER] Processing URL: ${cleanedUrl}`);

    // Check if API token is configured
    if (!APIFY_API_TOKEN) {
      return new Response(
        JSON.stringify({ 
          error: "Scraping service not configured. Please contact administrator." 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Call Apify API to scrape the listing
    // Using pratikdani/facebook-marketplace-scraper actor
    const apifyRunUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;
    
    console.log(`📡 [FB SCRAPER] Calling Apify actor: ${APIFY_ACTOR_ID}`);
    
    const apifyResponse = await fetch(apifyRunUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: cleanedUrl, // Use cleaned URL without query parameters
      }),
    });

    console.log(`📊 [FB SCRAPER] Response status: ${apifyResponse.status}`);
    console.log(`📊 [FB SCRAPER] Response headers:`, Object.fromEntries(apifyResponse.headers.entries()));

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      console.error("❌ [FB SCRAPER] Apify API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to scrape listing. The listing may no longer be available or may be private." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if response has content
    const responseText = await apifyResponse.text();
    console.log(`📊 [FB SCRAPER] Response body length: ${responseText.length}`);
    console.log(`📊 [FB SCRAPER] Response preview: ${responseText.substring(0, 200)}`);

    if (!responseText || responseText.trim().length === 0) {
      console.error("❌ [FB SCRAPER] Empty response from Apify");
      return new Response(
        JSON.stringify({ error: "No data returned from scraper. The listing may be private or require login." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse the response
    let results: FacebookListingData[];
    try {
      results = JSON.parse(responseText);
    } catch (parseError) {
      console.error("❌ [FB SCRAPER] JSON parse error:", parseError);
      console.error("❌ [FB SCRAPER] Response was:", responseText.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse scraper response. Please try again." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📦 [FB SCRAPER] Received ${results.length} results from Apify`);

    if (!results || results.length === 0) {
      return new Response(
        JSON.stringify({ error: "No data found. The listing may be private, deleted, or in an unsupported format." }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const listing = results[0];

    // Extract and normalize data
    const title = listing.title || listing.name || "Untitled";
    // pratikdani actor uses final_price and initial_price
    const priceValue = listing.final_price || listing.initial_price || listing.price || 0;
    const { amount: price, currency } = extractPrice(priceValue);
    const description = listing.seller_description || listing.description || "";
    const location = listing.location || listing.seller?.location || "";
    const condition = listing.condition || null;
    // Use root_category or extract from breadcrumbs if available
    const category = listing.root_category || listing.category || 
                     (listing.breadcrumbs && listing.breadcrumbs.length > 0 
                       ? listing.breadcrumbs[0].breadcrumbs_name 
                       : null);
    
    // Collect all images
    const images: string[] = [];
    if (listing.images && Array.isArray(listing.images)) {
      images.push(...listing.images);
    }
    if (listing.image && !images.includes(listing.image)) {
      images.push(listing.image);
    }

    // Validate minimum required data
    if (!title || title === "Untitled") {
      return new Response(
        JSON.stringify({ 
          error: "Could not extract title from listing. The listing may require login or may be in an unsupported format." 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✅ [FB SCRAPER] Successfully scraped listing:`, {
      title,
      price,
      currency,
      imageCount: images.length,
      location,
      condition,
    });

    // Format the response
    const scrapedData: ScrapedResult = {
      title,
      price,
      currency,
      description,
      location,
      condition,
      category,
      images,
    };

    return new Response(
      JSON.stringify({ 
        success: true,
        data: scrapedData,
        source_url: cleanedUrl, // Return cleaned URL
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("❌ [FB SCRAPER] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

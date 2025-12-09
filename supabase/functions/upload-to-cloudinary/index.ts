import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Upload to Cloudinary Edge Function
// Uploads images directly to Cloudinary for ultra-fast delivery
// ~200-500ms first loads globally (bypasses Supabase Storage)
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
    // Get Cloudinary credentials from environment
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Cloudinary credentials not configured");
    }

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check content type to determine if it's a file upload or URL
    const contentType = req.headers.get("content-type") || "";
    let dataUri: string;
    let listingId = "temp";
    let index = "0";

    if (contentType.includes("application/json")) {
      // JSON body with image URL (for Facebook import)
      const body = await req.json();
      const imageUrl = body.imageUrl;
      listingId = body.listingId || "temp";
      index = body.index?.toString() || "0";

      if (!imageUrl) {
        return new Response(
          JSON.stringify({ error: "imageUrl is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`📸 [CLOUDINARY] Downloading from URL for user ${user.id}, listing ${listingId}`);

      // Download the image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.statusText}`);
      }

      const arrayBuffer = await imageResponse.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

      // Chunked base64 encoding
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      dataUri = `data:${mimeType};base64,${base64}`;

    } else {
      // Form data with file upload
      const formData = await req.formData();
      const file = formData.get("file") as File;
      listingId = formData.get("listingId")?.toString() || "temp";
      index = formData.get("index")?.toString() || "0";

      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`📸 [CLOUDINARY] Uploading file for user ${user.id}, listing ${listingId}`);

      // Convert file to base64 (chunked to avoid stack overflow)
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      dataUri = `data:${file.type};base64,${base64}`;
    }

    // Generate signature for secure upload
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `bike-marketplace/listings/${user.id}/${listingId}/${timestamp}-${index}`;
    
    // Create signature (Cloudinary requires signed uploads)
    // Variants: thumbnail (100px), mobile_card (200px), card (400px), gallery (1200px landscape), detail (2000px)
    // Card variants use c_fill,g_center for predictable center cropping (no borders)
    // Gallery uses ar_4:3,c_pad with white background for full product display on detail pages
    const eagerTransforms = 'w_100,c_limit,q_auto:low,f_webp|w_200,ar_1:1,c_fill,g_center,q_auto:good,f_webp|w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp|w_1200,ar_4:3,c_pad,b_white,q_auto:best,f_webp|w_2000,c_limit,q_auto:best,f_webp';
    const signatureString = `eager=${eagerTransforms}&eager_async=false&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Upload to Cloudinary
    const cloudinaryForm = new FormData();
    cloudinaryForm.append("file", dataUri);
    cloudinaryForm.append("api_key", apiKey);
    cloudinaryForm.append("timestamp", timestamp.toString());
    cloudinaryForm.append("signature", signature);
    cloudinaryForm.append("public_id", publicId);
    cloudinaryForm.append("eager", eagerTransforms);
    cloudinaryForm.append("eager_async", "false");

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: cloudinaryForm,
      }
    );

    if (!cloudinaryResponse.ok) {
      const errorText = await cloudinaryResponse.text();
      console.error("Cloudinary error:", errorText);
      throw new Error(`Cloudinary upload failed: ${errorText}`);
    }

    const result = await cloudinaryResponse.json();
    console.log(`✅ [CLOUDINARY] Uploaded: ${result.public_id}`);

    // Build optimized URLs
    const baseUrl = `https://res.cloudinary.com/${cloudName}/image/upload`;
    
    const thumbnailUrl = `${baseUrl}/w_100,c_limit,q_auto:low,f_webp/${result.public_id}`;
    const mobileCardUrl = `${baseUrl}/w_200,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${result.public_id}`;
    const cardUrl = `${baseUrl}/w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${result.public_id}`;
    const galleryUrl = `${baseUrl}/w_1200,ar_4:3,c_pad,b_white,q_auto:best,f_webp/${result.public_id}`;
    const detailUrl = `${baseUrl}/w_2000,c_limit,q_auto:best,f_webp/${result.public_id}`;

    // Pre-warm CDN cache by requesting the most commonly used variants
    // This runs in background, doesn't block response
    console.log(`🔥 [CLOUDINARY] Pre-warming cache for: ${cardUrl}, ${galleryUrl}`);
    fetch(cardUrl).catch(() => {}); // Desktop card
    fetch(mobileCardUrl).catch(() => {}); // Mobile card
    fetch(galleryUrl).catch(() => {}); // Gallery (product pages)
    fetch(thumbnailUrl).catch(() => {}); // Thumbnail

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: `img-${timestamp}-${index}`,
          url: result.secure_url,
          cardUrl: cardUrl,
          mobileCardUrl: mobileCardUrl,
          thumbnailUrl: thumbnailUrl,
          galleryUrl: galleryUrl,
          detailUrl: detailUrl,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        },
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Upload failed" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});


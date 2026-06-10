import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cloudinaryUploadAuthHeader } from "../_shared/cloudinary-auth.ts";
import { buildCloudinaryUrls, CLOUDINARY_EAGER_TRANSFORMS } from "../_shared/cloudinary-transforms.ts";

// ============================================================
// Upload to Cloudinary Edge Function
// Uploads images directly to Cloudinary for ultra-fast delivery
// ~200-500ms first loads globally (bypasses Supabase Storage)
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-internal-secret, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INTERNAL_EDGE_SHARED_SECRET =
  Deno.env.get("INTERNAL_EDGE_SHARED_SECRET") ||
  Deno.env.get("NEST_INTERNAL_EDGE_SHARED_SECRET") ||
  Deno.env.get("NEST_SUPABASE_SECRET_KEY") ||
  Deno.env.get("SUPABASE_SECRET_KEY") ||
  Deno.env.get("SUPABASE_SECRET_KEYS") ||
  Deno.env.get("NEW_SUPABASE_SECRET_KEY") ||
  "";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isInternalRequest(req: Request): boolean {
  const received =
    req.headers.get("x-internal-secret")?.trim() ||
    (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(
    received &&
      INTERNAL_EDGE_SHARED_SECRET &&
      timingSafeEqual(received, INTERNAL_EDGE_SHARED_SECRET),
  );
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get Cloudinary credentials from environment
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")?.trim();
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY")?.trim();
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET")?.trim();

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        "Cloudinary credentials not configured for Edge Functions. In Supabase Dashboard → Project Settings → Edge Functions → Secrets, set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET (from Cloudinary console). Or run: supabase secrets set --project-ref <ref> CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...",
      );
    }

    const internalRequest = isInternalRequest(req);

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader && !internalRequest) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userId = "text-upload";
    if (!internalRequest) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader! } } }
      );

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = user.id;
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

      console.log(`📸 [CLOUDINARY] Downloading from URL for user ${userId}, listing ${listingId}`);
      console.log(`📸 [CLOUDINARY] URL: ${imageUrl.substring(0, 100)}...`);

      // Download the image with browser-like headers to avoid 403 Forbidden
      const imageResponse = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.google.com/',
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site',
        },
      });
      
      if (!imageResponse.ok) {
        console.error(`📸 [CLOUDINARY] Download failed: ${imageResponse.status} ${imageResponse.statusText}`);
        throw new Error(`Failed to download image: ${imageResponse.statusText}`);
      }
      
      console.log(`📸 [CLOUDINARY] Download successful, content-type: ${imageResponse.headers.get('content-type')}`);
      console.log(`📸 [CLOUDINARY] Content-length: ${imageResponse.headers.get('content-length')} bytes`);

      const arrayBuffer = await imageResponse.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";
      const fileSizeKB = (uint8Array.length / 1024).toFixed(1);
      
      console.log(`📸 [CLOUDINARY] Downloaded image: ${fileSizeKB}KB, type: ${mimeType}`);

      // Chunked base64 encoding
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      dataUri = `data:${mimeType};base64,${base64}`;
      
      console.log(`📸 [CLOUDINARY] Base64 encoded, total length: ${base64.length} characters`);

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

      console.log(`🔍 [CLOUDINARY] ====== UPLOAD REQUEST ======`);
      console.log(`🔍 [CLOUDINARY] user: ${userId}`);
      console.log(`🔍 [CLOUDINARY] listingId: ${listingId}`);
      console.log(`🔍 [CLOUDINARY] index received: ${index}`);
      console.log(`🔍 [CLOUDINARY] file name: ${file.name}`);
      console.log(`🔍 [CLOUDINARY] file size: ${file.size} bytes`);

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

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = internalRequest
      ? `bike-marketplace/text-upload/${listingId}/${timestamp}-${index}`
      : `bike-marketplace/listings/${userId}/${listingId}/${timestamp}-${index}`;

    // Upload to Cloudinary (Basic Auth — no manual signature; see Cloudinary upload API docs)
    const cloudinaryForm = new FormData();
    cloudinaryForm.append("file", dataUri);
    cloudinaryForm.append("public_id", publicId);
    // Keep pixel orientation as downloaded — do not apply EXIF auto-rotate on ingest.
    cloudinaryForm.append("angle", "ignore");
    cloudinaryForm.append("eager", CLOUDINARY_EAGER_TRANSFORMS);
    cloudinaryForm.append("eager_async", "false");

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        headers: { Authorization: cloudinaryUploadAuthHeader(apiKey, apiSecret) },
        body: cloudinaryForm,
      }
    );

    if (!cloudinaryResponse.ok) {
      const errorText = await cloudinaryResponse.text();
      console.error("Cloudinary error:", errorText);
      throw new Error(`Cloudinary upload failed: ${errorText}`);
    }

    const result = await cloudinaryResponse.json();
    
    console.log(`✅ [CLOUDINARY] Upload successful! Original dimensions: ${result.width}x${result.height} (${(result.width * result.height / 1000000).toFixed(1)}MP)`);
    console.log(`✅ [CLOUDINARY] Format: ${result.format}, Bytes: ${(result.bytes / 1024).toFixed(1)}KB`);
    
    const urls = buildCloudinaryUrls(cloudName, result.public_id);
    const thumbnailUrl = urls.thumbnailUrl;
    const mobileCardUrl = urls.mobileCardUrl;
    const cardUrl = urls.cardUrl;
    const galleryUrl = urls.galleryUrl;
    const detailUrl = urls.detailUrl;

    console.log(`🔍 [CLOUDINARY] ====== UPLOAD COMPLETE ======`);
    console.log(`🔍 [CLOUDINARY] index: ${index}`);
    console.log(`🔍 [CLOUDINARY] public_id: ${result.public_id}`);
    console.log(`🔍 [CLOUDINARY] cardUrl (400px): ${cardUrl}`);
    console.log(`🔍 [CLOUDINARY] galleryUrl (1200px): ${galleryUrl}`);
    console.log(`🔍 [CLOUDINARY] detailUrl (2000px): ${detailUrl}`);

    // Pre-warm CDN cache by requesting the most commonly used variants
    // This runs in background, doesn't block response
    console.log(`🔥 [CLOUDINARY] Pre-warming cache for cardUrl and galleryUrl`);
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

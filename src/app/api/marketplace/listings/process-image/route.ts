import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { 
  generateImageVariants, 
  generateVariantPaths,
  formatFileSize 
} from "@/lib/utils/image-variants";

// ============================================================
// Process Image with Variants
// POST /api/marketplace/listings/process-image
// 
// Accepts either:
// - imageUrl: URL to download image from (for Facebook import)
// - file: Direct file upload
// 
// Returns pre-generated variants (thumbnail, card, original)
// ============================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    let inputBuffer: Buffer;
    let listingId = 'temp';
    let imageIndex = 0;

    // Handle different input types
    if (contentType.includes('application/json')) {
      // JSON body with image URL (for Facebook import)
      const body = await request.json();
      const { imageUrl, listingId: lid, index } = body;
      
      if (!imageUrl) {
        return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
      }
      
      listingId = lid || 'temp';
      imageIndex = index || 0;

      console.log(`📸 [PROCESS-IMAGE] Downloading from URL: ${imageUrl.substring(0, 50)}...`);

      // Download image from URL
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BikeMarketplace/1.0)',
        },
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to download image: ${response.statusText}` },
          { status: 400 }
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
      
      console.log(`📸 [PROCESS-IMAGE] Downloaded: ${formatFileSize(inputBuffer.length)}`);

    } else if (contentType.includes('multipart/form-data')) {
      // Form data with file upload
      const formData = await request.formData();
      const file = formData.get("file") as File;
      listingId = (formData.get("listingId") as string) || 'temp';
      imageIndex = parseInt((formData.get("index") as string) || '0');

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      // Validate file type
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!validTypes.includes(file.type)) {
        return NextResponse.json(
          { error: "Invalid file type. Only JPEG, PNG, and WebP are supported." },
          { status: 400 }
        );
      }

      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: "File size exceeds 10MB limit" },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
      
      console.log(`📸 [PROCESS-IMAGE] Received file: ${formatFileSize(inputBuffer.length)}`);

    } else {
      return NextResponse.json(
        { error: "Invalid content type. Use JSON with imageUrl or multipart form-data." },
        { status: 400 }
      );
    }

    const timestamp = Date.now();

    // Generate all variants using Sharp
    console.log(`📸 [PROCESS-IMAGE] Generating variants...`);
    const variants = await generateImageVariants(inputBuffer);

    console.log(`📸 [PROCESS-IMAGE] Variants: original=${formatFileSize(variants.original.length)}, card=${formatFileSize(variants.card.length)}, thumbnail=${formatFileSize(variants.thumbnail.length)}`);

    // Generate storage paths
    const paths = generateVariantPaths(user.id, listingId, timestamp + imageIndex);

    // Upload all variants in parallel
    console.log(`📸 [PROCESS-IMAGE] Uploading to storage...`);
    
    const uploadPromises = [
      supabase.storage
        .from("listing-images")
        .upload(paths.original, variants.original, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: false,
        }),
      supabase.storage
        .from("listing-images")
        .upload(paths.card, variants.card, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: false,
        }),
      supabase.storage
        .from("listing-images")
        .upload(paths.thumbnail, variants.thumbnail, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: false,
        }),
    ];

    const [originalResult, cardResult, thumbnailResult] = await Promise.all(uploadPromises);

    // Check for errors
    if (originalResult.error || cardResult.error || thumbnailResult.error) {
      const errorMsg = originalResult.error?.message || cardResult.error?.message || thumbnailResult.error?.message;
      console.error("Upload error:", errorMsg);
      return NextResponse.json(
        { error: `Upload failed: ${errorMsg}` },
        { status: 500 }
      );
    }

    // Get public URLs
    const { data: originalUrl } = supabase.storage
      .from("listing-images")
      .getPublicUrl(paths.original);
    const { data: cardUrl } = supabase.storage
      .from("listing-images")
      .getPublicUrl(paths.card);
    const { data: thumbnailUrl } = supabase.storage
      .from("listing-images")
      .getPublicUrl(paths.thumbnail);

    const processingTime = Date.now() - startTime;
    console.log(`✅ [PROCESS-IMAGE] Complete in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      data: {
        id: `img-${timestamp}-${imageIndex}`,
        url: originalUrl.publicUrl,
        cardUrl: cardUrl.publicUrl,
        thumbnailUrl: thumbnailUrl.publicUrl,
        storagePath: paths.original,
        metadata: {
          originalWidth: variants.metadata.originalWidth,
          originalHeight: variants.metadata.originalHeight,
          processingTimeMs: processingTime,
        },
      },
    });
  } catch (error) {
    console.error("Error in image processing:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}







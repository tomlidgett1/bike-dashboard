import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { 
  generateImageVariants, 
  generateVariantPaths,
  formatFileSize 
} from "@/lib/utils/image-variants";

// ============================================================
// Upload Listing Image with Pre-generated Variants
// POST /api/marketplace/listings/upload-image
// 
// Generates thumbnail (100px), card (400px), and original variants
// for instant loading without on-demand transformation
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

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const listingId = formData.get("listingId") as string;

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

    const timestamp = Date.now();
    const effectiveListingId = listingId || 'temp';

    console.log(`📸 [UPLOAD] Processing image for listing ${effectiveListingId}...`);
    console.log(`📸 [UPLOAD] Original size: ${formatFileSize(file.size)}`);

    // Convert file to buffer for Sharp processing
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Generate all variants using Sharp
    console.log(`📸 [UPLOAD] Generating variants...`);
    const variants = await generateImageVariants(inputBuffer);

    console.log(`📸 [UPLOAD] Variant sizes: original=${formatFileSize(variants.original.length)}, card=${formatFileSize(variants.card.length)}, thumbnail=${formatFileSize(variants.thumbnail.length)}`);

    // Generate storage paths for all variants
    const paths = generateVariantPaths(user.id, effectiveListingId, timestamp);

    // Upload all variants in parallel
    console.log(`📸 [UPLOAD] Uploading ${Object.keys(paths).length} variants to storage...`);
    
    const uploadPromises = [
      // Original
      supabase.storage
        .from("listing-images")
        .upload(paths.original, variants.original, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: false,
        }),
      // Card (400px)
      supabase.storage
        .from("listing-images")
        .upload(paths.card, variants.card, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: false,
        }),
      // Thumbnail (100px)
      supabase.storage
        .from("listing-images")
        .upload(paths.thumbnail, variants.thumbnail, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: false,
        }),
    ];

    const [originalResult, cardResult, thumbnailResult] = await Promise.all(uploadPromises);

    // Check for upload errors
    if (originalResult.error) {
      console.error("Original upload error:", originalResult.error);
      return NextResponse.json(
        { error: `Original upload failed: ${originalResult.error.message}` },
        { status: 500 }
      );
    }
    if (cardResult.error) {
      console.error("Card upload error:", cardResult.error);
      return NextResponse.json(
        { error: `Card upload failed: ${cardResult.error.message}` },
        { status: 500 }
      );
    }
    if (thumbnailResult.error) {
      console.error("Thumbnail upload error:", thumbnailResult.error);
      return NextResponse.json(
        { error: `Thumbnail upload failed: ${thumbnailResult.error.message}` },
        { status: 500 }
      );
    }

    // Get public URLs for all variants
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
    console.log(`✅ [UPLOAD] Complete in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      data: {
        id: `img-${timestamp}`,
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
    console.error("Error in image upload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

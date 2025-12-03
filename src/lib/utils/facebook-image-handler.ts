import { createClient } from "@/lib/supabase/client";
import type { ListingImage } from "@/lib/types/listing";

// ============================================================
// Facebook Image Handler
// ============================================================
// Downloads images from Facebook CDN and uploads to Cloudinary
// for ultra-fast image delivery (~200-500ms first loads)

/**
 * Process a single Facebook image through Cloudinary Edge Function
 */
async function uploadToCloudinary(
  imageUrl: string,
  listingId: string,
  index: number,
  accessToken: string
): Promise<{
  url: string;
  cardUrl: string;
  mobileCardUrl: string;
  thumbnailUrl: string;
}> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-to-cloudinary`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl,
        listingId,
        index,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload to Cloudinary');
  }

  const result = await response.json();
  return {
    url: result.data.url,
    cardUrl: result.data.cardUrl,
    mobileCardUrl: result.data.mobileCardUrl,
    thumbnailUrl: result.data.thumbnailUrl,
  };
}

/**
 * Main function: Downloads Facebook images and uploads to Cloudinary
 * Returns array of ListingImage objects with permanent URLs and variants
 */
export async function processFacebookImages(
  facebookImageUrls: string[],
  onProgress?: (current: number, total: number) => void
): Promise<ListingImage[]> {
  if (!facebookImageUrls || facebookImageUrls.length === 0) {
    throw new Error("No images provided");
  }

  const supabase = createClient();
  
  // Get current user and session
  const { data: { session }, error: authError } = await supabase.auth.getSession();
  if (authError || !session) {
    throw new Error("Authentication required to upload images");
  }

  const uploadedImages: ListingImage[] = [];
  const errors: string[] = [];
  const listingId = `fb-${Date.now()}`;

  console.log(`📸 [FB IMAGE HANDLER] Uploading ${facebookImageUrls.length} images to Cloudinary...`);

  for (let i = 0; i < facebookImageUrls.length; i++) {
    const imageUrl = facebookImageUrls[i];
    
    try {
      console.log(`📸 [FB IMAGE HANDLER] Processing image ${i + 1}/${facebookImageUrls.length}`);
      
      // Upload to Cloudinary via Edge Function
      const { url, cardUrl, mobileCardUrl, thumbnailUrl } = await uploadToCloudinary(
        imageUrl,
        listingId,
        i,
        session.access_token
      );
      
      // Add to results with all variant URLs
      uploadedImages.push({
        id: `fb-img-${Date.now()}-${i}`,
        url,
        cardUrl,
        mobileCardUrl,
        thumbnailUrl,
        order: i,
        isPrimary: i === 0,
      });

      console.log(`✅ [FB IMAGE HANDLER] Image ${i + 1} uploaded to Cloudinary`);
      
      // Report progress
      if (onProgress) {
        onProgress(i + 1, facebookImageUrls.length);
      }
    } catch (error) {
      console.error(`❌ [FB IMAGE HANDLER] Failed to process image ${i + 1}:`, error);
      errors.push(`Image ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  if (uploadedImages.length === 0) {
    throw new Error(
      `Failed to upload any images. Errors: ${errors.join(", ")}`
    );
  }

  if (errors.length > 0) {
    console.warn(`⚠️ [FB IMAGE HANDLER] Some images failed: ${errors.join(", ")}`);
  }

  console.log(
    `✅ [FB IMAGE HANDLER] Successfully uploaded ${uploadedImages.length}/${facebookImageUrls.length} images to Cloudinary`
  );

  return uploadedImages;
}

/**
 * Validates that Cloudinary is configured
 */
export async function validateStorageBucket(): Promise<{
  exists: boolean;
  error?: string;
}> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    return {
      exists: false,
      error: "Cloudinary not configured",
    };
  }
  return { exists: true };
}

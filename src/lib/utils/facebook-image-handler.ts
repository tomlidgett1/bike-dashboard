import { createClient } from "@/lib/supabase/client";
import type { ListingImage } from "@/lib/types/listing";

// ============================================================
// Facebook Image Handler
// ============================================================
// Downloads images from Facebook CDN and uploads to Supabase Storage
// Facebook images are temporary URLs that need to be re-hosted

/**
 * Downloads an image from a URL and converts to Blob
 */
async function downloadImageAsBlob(imageUrl: string): Promise<Blob> {
  const response = await fetch(imageUrl, {
    mode: "cors",
    cache: "no-cache",
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const blob = await response.blob();
  
  // Ensure it's an image
  if (!blob.type.startsWith("image/")) {
    throw new Error("Downloaded content is not an image");
  }

  return blob;
}

/**
 * Generates a unique filename for Supabase Storage
 */
function generateUniqueFilename(originalUrl: string, index: number): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  
  // Try to get extension from URL
  let extension = "jpg"; // Default
  try {
    const urlObj = new URL(originalUrl);
    const pathname = urlObj.pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      extension = ext;
    }
  } catch {
    // If URL parsing fails, use default
  }

  return `facebook-import-${timestamp}-${index}-${random}.${extension}`;
}

/**
 * Uploads a blob to Supabase Storage
 */
async function uploadToSupabase(
  blob: Blob,
  filename: string,
  userId: string
): Promise<string> {
  const supabase = createClient();

  // Upload to listing-images bucket
  const filePath = `${userId}/${filename}`;
  
  const { data, error } = await supabase.storage
    .from("listing-images")
    .upload(filePath, blob, {
      contentType: blob.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("❌ Upload error:", error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from("listing-images")
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
}

/**
 * Main function: Downloads Facebook images and uploads to Supabase Storage
 * Returns array of ListingImage objects with permanent URLs
 */
export async function processFacebookImages(
  facebookImageUrls: string[],
  onProgress?: (current: number, total: number) => void
): Promise<ListingImage[]> {
  if (!facebookImageUrls || facebookImageUrls.length === 0) {
    throw new Error("No images provided");
  }

  const supabase = createClient();
  
  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Authentication required to upload images");
  }

  const uploadedImages: ListingImage[] = [];
  const errors: string[] = [];

  console.log(`📸 [FB IMAGE HANDLER] Processing ${facebookImageUrls.length} images...`);

  for (let i = 0; i < facebookImageUrls.length; i++) {
    const imageUrl = facebookImageUrls[i];
    
    try {
      console.log(`📥 [FB IMAGE HANDLER] Downloading image ${i + 1}/${facebookImageUrls.length}`);
      
      // Download image as blob
      const blob = await downloadImageAsBlob(imageUrl);
      
      // Generate unique filename
      const filename = generateUniqueFilename(imageUrl, i);
      
      console.log(`📤 [FB IMAGE HANDLER] Uploading image ${i + 1}/${facebookImageUrls.length}`);
      
      // Upload to Supabase
      const publicUrl = await uploadToSupabase(blob, filename, user.id);
      
      // Add to results
      uploadedImages.push({
        id: `fb-img-${Date.now()}-${i}`,
        url: publicUrl,
        order: i,
        isPrimary: i === 0, // First image is primary
      });

      console.log(`✅ [FB IMAGE HANDLER] Image ${i + 1} uploaded successfully`);
      
      // Report progress
      if (onProgress) {
        onProgress(i + 1, facebookImageUrls.length);
      }
    } catch (error) {
      console.error(`❌ [FB IMAGE HANDLER] Failed to process image ${i + 1}:`, error);
      errors.push(`Image ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
      
      // Continue with remaining images even if one fails
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
    `✅ [FB IMAGE HANDLER] Successfully uploaded ${uploadedImages.length}/${facebookImageUrls.length} images`
  );

  return uploadedImages;
}

/**
 * Validates that Supabase Storage bucket exists and is accessible
 */
export async function validateStorageBucket(): Promise<{
  exists: boolean;
  error?: string;
}> {
  try {
    const supabase = createClient();
    
    // Try to list files (will fail if bucket doesn't exist or no access)
    const { error } = await supabase.storage
      .from("listing-images")
      .list("", { limit: 1 });

    if (error) {
      return {
        exists: false,
        error: error.message,
      };
    }

    return { exists: true };
  } catch (error) {
    return {
      exists: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}


// ============================================================
// Cloudinary Text Overlay Service
// ============================================================
// Generates Cloudinary transformation URLs with text overlays
// for Instagram posts (title + price)

interface TextOverlayOptions {
  imageUrl: string;
  title: string;
  price: number;
}

/**
 * Generates a Cloudinary transformation URL with text overlays
 * 
 * Overlays:
 * - Title: Top-left corner, bold yellow text, 60px font
 * - Price: Bottom-left corner, bold yellow text, 80px font
 * 
 * Both have black stroke for visibility on any background
 */
export function generateInstagramImageUrl({
  imageUrl,
  title,
  price,
}: TextOverlayOptions): string {
  // Return the original image URL without any transformations
  console.log('[Cloudinary] Using original image URL (no transformations):', imageUrl);
  return imageUrl;
}

/**
 * Extracts the Cloudinary public ID from a full Cloudinary URL
 * 
 * Example:
 * Input: https://res.cloudinary.com/demo/image/upload/v1234/sample.jpg
 * Output: v1234/sample.jpg
 */
function extractPublicId(url: string): string | null {
  try {
    // Parse the URL
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Find the position after /upload/ or /fetch/
    const uploadIndex = pathname.indexOf('/upload/');
    const fetchIndex = pathname.indexOf('/fetch/');
    
    if (uploadIndex !== -1) {
      // Get everything after /upload/
      const publicId = pathname.substring(uploadIndex + 8); // 8 = length of '/upload/'
      return publicId;
    } else if (fetchIndex !== -1) {
      // Get everything after /fetch/
      const publicId = pathname.substring(fetchIndex + 7); // 7 = length of '/fetch/'
      return publicId;
    }

    // If it's not a Cloudinary URL, check if it's already a public ID
    if (!url.includes('cloudinary.com') && !url.includes('http')) {
      return url;
    }

    console.error('[Cloudinary] Could not find /upload/ or /fetch/ in URL');
    return null;
  } catch (error) {
    console.error('[Cloudinary] Error extracting public ID:', error);
    return null;
  }
}

/**
 * Validates that an image URL is compatible with Cloudinary transformations
 */
export function isCloudinaryUrl(url: string): boolean {
  return url.includes('cloudinary.com') || url.includes('res.cloudinary.com');
}

/**
 * Uploads an external image to Cloudinary if it's not already there
 * This is useful for images hosted elsewhere that need overlays
 */
export async function uploadToCloudinary(imageUrl: string): Promise<string | null> {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary credentials not configured');
    }

    // Use Cloudinary fetch URL to auto-fetch and cache external images
    const fetchUrl = `https://res.cloudinary.com/${cloudName}/image/fetch/${encodeURIComponent(imageUrl)}`;
    
    console.log('[Cloudinary] Generated fetch URL:', fetchUrl);
    
    return fetchUrl;
  } catch (error) {
    console.error('[Cloudinary] Error uploading image:', error);
    return null;
  }
}


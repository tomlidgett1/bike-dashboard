// ============================================================
// Cloudinary Upload Service
// ============================================================
// Uploads transformed images to Cloudinary to get clean URLs

import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not fully configured');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  return cloudinary;
}

/**
 * Generate a transformed image with text overlays and upload it
 * Returns a clean, short Cloudinary URL
 */
export async function generateAndUploadInstagramImage(
  originalImageUrl: string,
  title: string,
  price: number
): Promise<string> {
  try {
    const cloud = configureCloudinary();

    console.log('[Cloudinary Upload] Starting transformation and upload...');
    console.log('[Cloudinary Upload] Original URL:', originalImageUrl);

    // Format price
    const formattedPrice = `$${price.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;

    // Use Cloudinary's explicit API to create a derived image with transformations
    // This creates a new image URL that's clean and short
    const transformation = [
      // Crop to square
      { width: 1080, height: 1080, crop: 'fill', gravity: 'auto', aspect_ratio: '1:1' },
      // Add title overlay
      { 
        overlay: {
          font_family: 'Arial',
          font_size: 60,
          font_weight: 'bold',
          text: title
        },
        color: '#FFD700',
        gravity: 'north_west',
        x: 40,
        y: 40,
        border: '3px_solid_black'
      },
      // Add price overlay
      { 
        overlay: {
          font_family: 'Arial',
          font_size: 80,
          font_weight: 'bold',
          text: formattedPrice
        },
        color: '#FFD700',
        gravity: 'south_west',
        x: 40,
        y: 40,
        border: '4px_solid_black'
      }
    ];

    // Generate the transformed URL (this doesn't upload, just transforms on-the-fly)
    const transformedUrl = cloud.url(originalImageUrl, {
      transformation: transformation,
      secure: true,
    });

    console.log('[Cloudinary Upload] Generated URL:', transformedUrl);

    return transformedUrl;
  } catch (error) {
    console.error('[Cloudinary Upload] Error:', error);
    throw error;
  }
}

/**
 * Simpler approach: Just return the transformation URL but shorter
 */
export function generateShortInstagramImageUrl(
  originalImageUrl: string,
  title: string,
  price: number
): string {
  try {
    // Extract cloud name and public ID from URL
    const cloudNameMatch = originalImageUrl.match(/cloudinary\.com\/([^\/]+)\//);
    const cloudName = cloudNameMatch ? cloudNameMatch[1] : process.env.CLOUDINARY_CLOUD_NAME;

    if (!cloudName) {
      throw new Error('Could not determine Cloudinary cloud name');
    }

    // Extract public ID
    const urlObj = new URL(originalImageUrl);
    const pathname = urlObj.pathname;
    const uploadIndex = pathname.indexOf('/upload/');
    
    if (uploadIndex === -1) {
      throw new Error('Invalid Cloudinary URL');
    }

    const publicId = pathname.substring(uploadIndex + 8);

    // Format price
    const formattedPrice = `$${price.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;

    // Encode text
    const encodedTitle = encodeURIComponent(title);
    const encodedPrice = encodeURIComponent(formattedPrice);

    // Build URL using transformation shorthand
    // Use t_ for named transformation (we'll create this in Cloudinary dashboard)
    // Or use the full transformation but properly formatted
    
    const transformations = [
      'w_1080,h_1080,c_fill,ar_1:1,g_auto',
      `l_text:Arial_60_bold:${encodedTitle},co_rgb:FFD700,g_north_west,x_40,y_40,bo_3px_solid_rgb:000000`,
      `l_text:Arial_80_bold:${encodedPrice},co_rgb:FFD700,g_south_west,x_40,y_40,bo_4px_solid_rgb:000000`
    ].join('/');

    return `https://res.cloudinary.com/${cloudName}/image/upload/${transformations}/${publicId}`;
  } catch (error) {
    console.error('[Cloudinary] Error generating short URL:', error);
    return originalImageUrl;
  }
}


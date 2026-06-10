// ============================================================
// Cloudinary Upload Helper
// Uploads images to Cloudinary and creates optimised variants
// ============================================================

import { cloudinaryUploadAuthHeader } from "./cloudinary-auth.ts";
import { buildCloudinaryUrls, CLOUDINARY_EAGER_TRANSFORMS } from "./cloudinary-transforms.ts";

export interface CloudinaryUploadResult {
  success: boolean;
  cloudinaryUrl?: string;
  cloudinaryPublicId?: string;
  thumbnailUrl?: string;
  mobileCardUrl?: string;
  cardUrl?: string;
  mobileHeroUrl?: string;
  galleryUrl?: string;
  detailUrl?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  error?: string;
}

/**
 * Downloads an image and uploads it to Cloudinary with optimised variants
 */
export async function uploadToCloudinary(
  externalUrl: string,
  canonicalProductId: string,
  sortOrder: number
): Promise<CloudinaryUploadResult> {
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')?.trim()
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY')?.trim()
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')?.trim()

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      success: false,
      error: 'Cloudinary credentials not configured',
    }
  }

  try {
    console.log(`📥 [CLOUDINARY] Downloading image from: ${externalUrl}`)

    // Download image
    const imageResponse = await fetch(externalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BikeMarketplace/1.0)',
      },
    })

    if (!imageResponse.ok) {
      return {
        success: false,
        error: `HTTP ${imageResponse.status}: ${imageResponse.statusText}`,
      }
    }

    const contentType = imageResponse.headers.get('content-type')
    if (!contentType || !contentType.startsWith('image/')) {
      return {
        success: false,
        error: `Invalid content type: ${contentType}`,
      }
    }

    const arrayBuffer = await imageResponse.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const fileSize = uint8Array.length

    // Validate file size
    if (fileSize > 10 * 1024 * 1024) {
      return {
        success: false,
        error: 'Image too large (>10MB)',
      }
    }

    if (fileSize < 10 * 1024) {
      return {
        success: false,
        error: 'Image too small (likely a placeholder)',
      }
    }

    console.log(`✓ [CLOUDINARY] Downloaded ${(fileSize / 1024).toFixed(0)}KB`)

    // Convert to base64 in chunks
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    const base64 = btoa(binary)
    const mimeType = contentType || 'image/jpeg'
    const dataUri = `data:${mimeType};base64,${base64}`

    // public_id includes timestamp for uniqueness
    const timestamp = Math.floor(Date.now() / 1000)
    const publicId = `bike-marketplace/canonical/${canonicalProductId}/${timestamp}-${sortOrder}`
    
    console.log(`📤 [CLOUDINARY] Uploading to Cloudinary: ${publicId}`)

    const cloudinaryForm = new FormData()
    cloudinaryForm.append('file', dataUri)
    cloudinaryForm.append('public_id', publicId)
    cloudinaryForm.append('angle', 'ignore')
    cloudinaryForm.append('eager', CLOUDINARY_EAGER_TRANSFORMS)
    cloudinaryForm.append('eager_async', 'false')

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        headers: { Authorization: cloudinaryUploadAuthHeader(apiKey, apiSecret) },
        body: cloudinaryForm,
      }
    )

    if (!cloudinaryResponse.ok) {
      const errorText = await cloudinaryResponse.text()
      return {
        success: false,
        error: `Cloudinary upload failed: ${errorText}`,
      }
    }

    const cloudinaryResult = await cloudinaryResponse.json()
    console.log(`✅ [CLOUDINARY] Uploaded: ${cloudinaryResult.public_id}`)

    const urls = buildCloudinaryUrls(cloudName, cloudinaryResult.public_id)

    return {
      success: true,
      cloudinaryUrl: cloudinaryResult.secure_url,
      cloudinaryPublicId: cloudinaryResult.public_id,
      thumbnailUrl: urls.thumbnailUrl,
      mobileCardUrl: urls.mobileCardUrl,
      cardUrl: urls.cardUrl,
      mobileHeroUrl: urls.mobileHeroUrl,
      galleryUrl: urls.galleryUrl,
      detailUrl: urls.detailUrl,
      width: cloudinaryResult.width || 800,
      height: cloudinaryResult.height || 800,
      fileSize,
    }
  } catch (error) {
    console.error(`❌ [CLOUDINARY] Error:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    }
  }
}


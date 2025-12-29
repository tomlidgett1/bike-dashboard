/**
 * Add External Image to Product API
 * POST /api/admin/ecommerce-hero/add-image
 * 
 * Takes an external image URL, uploads it to Cloudinary, 
 * and adds it to the product's images
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { addProductImage } from '@/lib/services/product-images';

export const dynamic = 'force-dynamic';

interface CloudinaryUploadResult {
  url: string;
  cardUrl: string;
  mobileCardUrl?: string;
  thumbnailUrl: string;
  galleryUrl?: string;
  detailUrl?: string;
}

// Upload image to Cloudinary via edge function
async function uploadToCloudinary(
  imageUrl: string,
  productId: string,
  accessToken: string
): Promise<CloudinaryUploadResult> {
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
        listingId: `add-${productId}`,
        index: Date.now(),
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
    galleryUrl: result.data.galleryUrl,
    detailUrl: result.data.detailUrl,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Get access token for Cloudinary upload
    const { data: sessionData } = await authClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const body = await request.json();
    const { productId, imageUrl, setAsHero = false } = body;

    if (!productId) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL required' }, { status: 400 });
    }

    console.log(`[ADD-IMAGE] Adding image to product ${productId}`);
    console.log(`[ADD-IMAGE] Image URL: ${imageUrl}`);
    console.log(`[ADD-IMAGE] Set as hero: ${setAsHero}`);

    // Check if already a Cloudinary URL
    const isCloudinary = imageUrl.includes('cloudinary');
    let cloudinaryResult: CloudinaryUploadResult;

    if (isCloudinary) {
      // Already on Cloudinary - generate proper transformation URLs
      // Extract public_id from Cloudinary URL
      // 
      // Cloudinary URL structure: .../upload/{transformations}/{public_id}.{ext}
      // We need JUST the public_id (e.g., bike-marketplace/ecommerce-hero/product-id/timestamp)
      // NOT the transformations (e.g., w_400,ar_1:1,c_fill,...)
      //
      // All our public_ids start with "bike-marketplace/" so we look for that
      
      let publicId: string | null = null;
      
      // Method 1: Look for our folder structure (most reliable)
      const folderMatch = imageUrl.match(/(bike-marketplace\/[^.?\s]+)/);
      if (folderMatch && folderMatch[1]) {
        // Remove file extension if present
        publicId = folderMatch[1].replace(/\.\w+$/, '');
      }
      
      // Method 2: Fallback for URLs with version number (v12345/public_id.ext)
      if (!publicId) {
        const versionMatch = imageUrl.match(/upload\/v\d+\/([^?]+?)(?:\.\w+)?$/);
        if (versionMatch) {
          publicId = versionMatch[1];
        }
      }
      
      if (!publicId) {
        console.error(`[ADD-IMAGE] Could not extract public_id from URL: ${imageUrl}`);
        return NextResponse.json({ error: 'Invalid Cloudinary URL format - could not extract public_id' }, { status: 400 });
      }
      
      console.log(`[ADD-IMAGE] Extracted public_id: ${publicId}`);
      
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const baseUrl = `https://res.cloudinary.com/${cloudName}/image/upload`;
      
      // Build fresh transformation URLs without any existing transformations
      cloudinaryResult = {
        url: `${baseUrl}/${publicId}`,
        cardUrl: `${baseUrl}/w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${publicId}`,
        mobileCardUrl: `${baseUrl}/w_200,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${publicId}`,
        thumbnailUrl: `${baseUrl}/w_100,c_limit,q_auto:low,f_webp/${publicId}`,
        galleryUrl: `${baseUrl}/w_1200,ar_4:3,c_pad,b_white,q_auto:best,f_webp/${publicId}`,
        detailUrl: `${baseUrl}/w_2000,c_limit,q_auto:best,f_webp/${publicId}`,
      };
      
      console.log(`[ADD-IMAGE] Generated Cloudinary variants:`, {
        publicId,
        cardUrl: cloudinaryResult.cardUrl,
        galleryUrl: cloudinaryResult.galleryUrl,
        detailUrl: cloudinaryResult.detailUrl,
      });
    } else {
      // Upload to Cloudinary
      console.log(`[ADD-IMAGE] Uploading to Cloudinary...`);
      cloudinaryResult = await uploadToCloudinary(imageUrl, productId, accessToken);
      console.log(`[ADD-IMAGE] Uploaded: ${cloudinaryResult.cardUrl}`);
    }

    // ============================================================
    // REFACTORED: Use shared helper to insert into product_images (source of truth)
    // No longer updating JSONB - product_images table is the single source
    // ============================================================
    
    // Get product info
    const { data: productInfo, error: productError } = await supabase
      .from('products')
      .select('listing_type, canonical_product_id')
      .eq('id', productId)
      .single();

    if (productError || !productInfo) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    console.log(`[ADD-IMAGE] Inserting into product_images via shared helper (listing_type: ${productInfo?.listing_type})`);
    
    // Calculate sort_order: 0 for hero, otherwise next available position
    let sortOrder = 0;
    if (setAsHero) {
      // Hero image always gets sort_order = 0
      sortOrder = 0;
      console.log(`[ADD-IMAGE] Setting as hero with sort_order: 0`);
    } else {
      // Get existing image count to determine next sort order
      // Count all images (not just approved) to avoid conflicts
      const { data: existingImages } = await supabase
        .from('product_images')
        .select('id')
        .eq('product_id', productId);
      
      sortOrder = (existingImages?.length || 0);
      console.log(`[ADD-IMAGE] Existing images: ${existingImages?.length || 0}, assigning sort_order: ${sortOrder}`);
    }
      
    // Use the shared helper to insert the image
    const insertedImage = await addProductImage(
      supabase,
      productId,
      cloudinaryResult,
      {
        setAsPrimary: setAsHero,
        sortOrder: sortOrder,
        source: 'admin_search',
        approvalStatus: 'approved',
      },
      productInfo?.canonical_product_id
    );
    
    if (!insertedImage) {
      console.error('[ADD-IMAGE] Failed to insert image via shared helper');
      return NextResponse.json({ error: 'Failed to insert image' }, { status: 500 });
    }
    
    console.log(`[ADD-IMAGE] Successfully inserted image: ${insertedImage.id}`);

    // Update product flags (minimal - just approval flags, not image data)
    const updateData: Record<string, unknown> = {
      has_displayable_image: true,
      images_approved_by_admin: true,
      images_approved_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId);

    if (updateError) {
      console.error('[ADD-IMAGE] Update error:', updateError);
      // Don't fail - image is already in product_images
    }

    console.log(`[ADD-IMAGE] Successfully added image to product`);

    return NextResponse.json({
      success: true,
      message: 'Image added successfully',
      imageId: insertedImage.id,
      cloudinaryUrl: cloudinaryResult.cardUrl,
      cardUrl: cloudinaryResult.cardUrl,
      thumbnailUrl: cloudinaryResult.thumbnailUrl,
    });
  } catch (error) {
    console.error('[ADD-IMAGE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add image' },
      { status: 500 }
    );
  }
}


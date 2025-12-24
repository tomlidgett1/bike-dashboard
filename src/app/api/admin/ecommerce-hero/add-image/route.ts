/**
 * Add External Image to Product API
 * POST /api/admin/ecommerce-hero/add-image
 * 
 * Takes an external image URL, uploads it to Cloudinary, 
 * and adds it to the product's images
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

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
      // Already on Cloudinary, use as-is
      cloudinaryResult = {
        url: imageUrl,
        cardUrl: imageUrl,
        thumbnailUrl: imageUrl,
      };
    } else {
      // Upload to Cloudinary
      console.log(`[ADD-IMAGE] Uploading to Cloudinary...`);
      cloudinaryResult = await uploadToCloudinary(imageUrl, productId, accessToken);
      console.log(`[ADD-IMAGE] Uploaded: ${cloudinaryResult.cardUrl}`);
    }

    // Fetch current product
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('images')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const currentImages = (product.images as any[]) || [];

    // Build new image object with ALL variants (same as quick upload)
    const newImage = {
      id: `added-${Date.now()}`,
      url: cloudinaryResult.url,
      cardUrl: cloudinaryResult.cardUrl,
      mobileCardUrl: cloudinaryResult.mobileCardUrl, // For mobile product cards
      thumbnailUrl: cloudinaryResult.thumbnailUrl,
      galleryUrl: cloudinaryResult.galleryUrl, // 1200px 4:3 padded - for product detail pages
      detailUrl: cloudinaryResult.detailUrl, // 2000px full size
      isPrimary: setAsHero || currentImages.length === 0, // Primary if hero or first image
      order: 0, // Put at the front if hero
      source: 'admin_bulk_review',
      isOnProductPage: true,
    };
    
    console.log(`[ADD-IMAGE] New image variants:`, {
      cardUrl: newImage.cardUrl,
      mobileCardUrl: newImage.mobileCardUrl,
      galleryUrl: newImage.galleryUrl,
      detailUrl: newImage.detailUrl,
    });

    // Build updated images array
    let updatedImages: any[];
    if (setAsHero) {
      // Mark all existing images as non-primary and re-order
      const existingImages = currentImages.map((img: any, idx: number) => ({
        ...img,
        isPrimary: false,
        order: idx + 1, // Shift orders down
      }));
      // Put new hero image first
      updatedImages = [newImage, ...existingImages];
    } else {
      // Just append to the end
      newImage.order = currentImages.length;
      updatedImages = [...currentImages, newImage];
    }

    // Update product
    const updateData: any = {
      images: updatedImages,
      has_displayable_image: true,
      // Always mark as admin approved when adding via bulk review
      images_approved_by_admin: true,
      images_approved_at: new Date().toISOString(),
    };

    // If setting as hero
    if (setAsHero) {
      updateData.cached_image_url = cloudinaryResult.cardUrl;
      updateData.cached_thumbnail_url = cloudinaryResult.thumbnailUrl;
      updateData.primary_image_url = cloudinaryResult.cardUrl;
    }

    console.log(`[ADD-IMAGE] Updating product with:`, JSON.stringify(updateData, null, 2));

    // First, check if this is a Lightspeed product (has canonical_product_id)
    const { data: productInfo } = await supabase
      .from('products')
      .select('listing_type, canonical_product_id')
      .eq('id', productId)
      .single();

    // For Lightspeed products, we need to insert into product_images table
    // because the trigger looks there, not at the JSONB array
    if (productInfo?.listing_type === 'lightspeed' || productInfo?.canonical_product_id) {
      console.log(`[ADD-IMAGE] Lightspeed product detected, also inserting into product_images table`);
      
      // First, unset is_primary on all existing images for this product
      if (setAsHero) {
        await supabase
          .from('product_images')
          .update({ is_primary: false })
          .eq('product_id', productId);
        
        // Also for canonical product if exists
        if (productInfo?.canonical_product_id) {
          await supabase
            .from('product_images')
            .update({ is_primary: false })
            .eq('canonical_product_id', productInfo.canonical_product_id);
        }
      }
      
      // Insert the new image into product_images
      const { error: insertError } = await supabase
        .from('product_images')
        .insert({
          product_id: productId,
          canonical_product_id: productInfo?.canonical_product_id,
          external_url: cloudinaryResult.url,
          cloudinary_url: cloudinaryResult.url,
          card_url: cloudinaryResult.cardUrl,
          thumbnail_url: cloudinaryResult.thumbnailUrl,
          gallery_url: cloudinaryResult.galleryUrl,
          detail_url: cloudinaryResult.detailUrl,
          is_primary: setAsHero,
          sort_order: 0,
          approval_status: 'approved',
          source: 'admin_search',
        });
      
      if (insertError) {
        console.error('[ADD-IMAGE] product_images insert error:', insertError);
        // Don't fail - continue with the products update
      } else {
        console.log(`[ADD-IMAGE] Inserted into product_images table`);
      }
    }

    // DEBUG: Log the exact cardUrl we're trying to set
    console.log(`[ADD-IMAGE] ===== DEBUG =====`);
    console.log(`[ADD-IMAGE] cloudinaryResult.cardUrl: ${cloudinaryResult.cardUrl}`);
    console.log(`[ADD-IMAGE] updateData.cached_image_url: ${updateData.cached_image_url}`);
    console.log(`[ADD-IMAGE] Are they equal? ${cloudinaryResult.cardUrl === updateData.cached_image_url}`);

    // Read product state BEFORE update
    const { data: beforeProduct } = await supabase
      .from('products')
      .select('cached_image_url, cached_thumbnail_url, listing_type')
      .eq('id', productId)
      .single();
    console.log(`[ADD-IMAGE] BEFORE UPDATE - cached_image_url: ${beforeProduct?.cached_image_url}`);
    console.log(`[ADD-IMAGE] BEFORE UPDATE - listing_type: ${beforeProduct?.listing_type}`);

    const { error: updateError, data: updateResult } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .select('cached_image_url, cached_thumbnail_url');

    if (updateError) {
      console.error('[ADD-IMAGE] Update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log(`[ADD-IMAGE] Update returned:`, updateResult);

    // Read product state AFTER update to verify
    const { data: afterProduct } = await supabase
      .from('products')
      .select('cached_image_url, cached_thumbnail_url, primary_image_url, images_approved_by_admin')
      .eq('id', productId)
      .single();
    
    console.log(`[ADD-IMAGE] AFTER UPDATE - cached_image_url: ${afterProduct?.cached_image_url}`);
    console.log(`[ADD-IMAGE] AFTER UPDATE - cached_thumbnail_url: ${afterProduct?.cached_thumbnail_url}`);
    console.log(`[ADD-IMAGE] AFTER UPDATE - primary_image_url: ${afterProduct?.primary_image_url}`);
    console.log(`[ADD-IMAGE] AFTER UPDATE - images_approved_by_admin: ${afterProduct?.images_approved_by_admin}`);
    
    // Check if our value was saved
    const wasSaved = afterProduct?.cached_image_url === updateData.cached_image_url;
    console.log(`[ADD-IMAGE] cached_image_url was saved correctly: ${wasSaved}`);
    
    if (!wasSaved && setAsHero) {
      console.error(`[ADD-IMAGE] !!!! WARNING: cached_image_url was NOT saved correctly!`);
      console.error(`[ADD-IMAGE] Expected: ${updateData.cached_image_url}`);
      console.error(`[ADD-IMAGE] Got: ${afterProduct?.cached_image_url}`);
      console.error(`[ADD-IMAGE] Trigger overwrote our value - doing a SECOND update to force it...`);
      
      // WORKAROUND: Do a second update with ONLY the cached URLs
      // This bypasses the trigger logic because we're not updating 'images'
      const { error: forceUpdateError } = await supabase
        .from('products')
        .update({
          cached_image_url: cloudinaryResult.cardUrl,
          cached_thumbnail_url: cloudinaryResult.thumbnailUrl,
          primary_image_url: cloudinaryResult.cardUrl,
          has_displayable_image: true,
        })
        .eq('id', productId);
      
      if (forceUpdateError) {
        console.error(`[ADD-IMAGE] Force update error:`, forceUpdateError);
      } else {
        // Verify it worked
        const { data: finalProduct } = await supabase
          .from('products')
          .select('cached_image_url')
          .eq('id', productId)
          .single();
        
        console.log(`[ADD-IMAGE] AFTER FORCE UPDATE - cached_image_url: ${finalProduct?.cached_image_url}`);
        console.log(`[ADD-IMAGE] Force update successful: ${finalProduct?.cached_image_url === cloudinaryResult.cardUrl}`);
      }
    }

    console.log(`[ADD-IMAGE] Successfully added image to product`);

    return NextResponse.json({
      success: true,
      message: 'Image added successfully',
      image: newImage,
      cloudinaryUrl: cloudinaryResult.cardUrl,
      debug: {
        beforeCachedUrl: beforeProduct?.cached_image_url,
        afterCachedUrl: afterProduct?.cached_image_url,
        expectedCachedUrl: updateData.cached_image_url,
        wasSavedCorrectly: wasSaved,
      }
    });
  } catch (error) {
    console.error('[ADD-IMAGE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add image' },
      { status: 500 }
    );
  }
}


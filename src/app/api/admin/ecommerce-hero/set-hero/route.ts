/**
 * Set Hero Image API
 * POST /api/admin/ecommerce-hero/set-hero
 * 
 * Directly sets an existing image as the product's hero image
 * without AI reprocessing. Updates:
 * - cached_image_url and cached_thumbnail_url
 * - is_primary in product_images table (if from DB)
 * - isPrimary in images JSONB (if from private listing)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface ImageJsonb {
  id?: string;
  url?: string;
  cardUrl?: string;
  thumbnailUrl?: string;
  galleryUrl?: string;
  detailUrl?: string;
  isPrimary?: boolean;
  order?: number;
  source?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Use regular client for auth check
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Use service role client to bypass RLS for admin operations
    const supabase = createServiceRoleClient();

    // Parse request body
    const body = await request.json();
    const { productId, imageId, cardUrl, thumbnailUrl, galleryUrl, detailUrl, source } = body;

    // Validate required fields
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    if (!cardUrl) {
      return NextResponse.json({ error: 'Card URL is required' }, { status: 400 });
    }

    // Validate URLs are from Cloudinary (for safety)
    const isCloudinaryUrl = (url: string) => 
      url.includes('cloudinary') || url.includes('res.cloudinary.com');

    if (!isCloudinaryUrl(cardUrl)) {
      return NextResponse.json({ 
        error: 'Card URL must be a Cloudinary URL' 
      }, { status: 400 });
    }

    console.log(`[SET-HERO] Setting hero image for product ${productId}`);
    console.log(`[SET-HERO] Image ID: ${imageId}, Source: ${source}`);
    console.log(`[SET-HERO] Card URL: ${cardUrl}`);

    // Check product exists and is active
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, is_active, display_name, description, images, listing_type')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (!product.is_active) {
      return NextResponse.json({ error: 'Product is not active' }, { status: 400 });
    }

    // Handle based on image source
    if (source === 'product_images' && imageId) {
      // Image is from product_images table
      // Update is_primary in the table (trigger will set others to false)
      console.log(`[SET-HERO] Updating product_images table for image ${imageId}`);
      
      const { error: imageUpdateError } = await supabase
        .from('product_images')
        .update({ is_primary: true, sort_order: 0 })
        .eq('id', imageId);

      if (imageUpdateError) {
        console.error('[SET-HERO] Failed to update product_images:', imageUpdateError);
      }

      // Call the sync function to update JSONB
      const { error: syncError } = await supabase.rpc('sync_product_images_to_jsonb', {
        target_product_id: productId,
      });

      if (syncError) {
        console.error('[SET-HERO] Failed to sync images:', syncError);
      }
    } else {
      // Image is from JSONB (private listing) - update JSONB directly
      console.log(`[SET-HERO] Updating images JSONB for private listing`);
      
      const currentImages = (product.images as ImageJsonb[]) || [];
      
      // Update isPrimary and order for all images
      const updatedImages = currentImages.map((img, index) => {
        const isMatch = (img.cardUrl === cardUrl) || (img.url === cardUrl) || (img.id === imageId);
        return {
          ...img,
          isPrimary: isMatch,
          order: isMatch ? 0 : (img.order || index + 1),
        };
      });

      // Sort so primary is first
      updatedImages.sort((a, b) => (a.order || 0) - (b.order || 0));

      const { error: jsonbUpdateError } = await supabase
        .from('products')
        .update({ images: updatedImages })
        .eq('id', productId);

      if (jsonbUpdateError) {
        console.error('[SET-HERO] Failed to update images JSONB:', jsonbUpdateError);
      }
    }

    // Update the product's cached image URLs and primary_image_url
    const { error: updateError } = await supabase
      .from('products')
      .update({
        cached_image_url: cardUrl,
        cached_thumbnail_url: thumbnailUrl || cardUrl,
        primary_image_url: galleryUrl || detailUrl || cardUrl,
        has_displayable_image: true,
      })
      .eq('id', productId);

    if (updateError) {
      console.error('[SET-HERO] Update error:', updateError);
      return NextResponse.json({ 
        error: `Failed to update product: ${updateError.message}` 
      }, { status: 500 });
    }

    console.log(`[SET-HERO] Successfully updated product ${productId}`);

    return NextResponse.json({
      success: true,
      message: 'Hero image set successfully',
      productId,
      cachedImageUrl: cardUrl,
      cachedThumbnailUrl: thumbnailUrl || cardUrl,
    });

  } catch (error) {
    console.error('[SET-HERO] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set hero image' },
      { status: 500 }
    );
  }
}

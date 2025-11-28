/**
 * Product Images API
 * GET /api/products/[id]/images - Get all images for a product
 * POST /api/products/[id]/images - Upload image for product
 * PATCH /api/products/[id]/images - Update image properties (primary, order)
 * DELETE /api/products/[id]/images - Delete an image
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getProductImages,
  setPrimaryImage,
  deleteProductImage,
  reorderImages,
} from '@/lib/services/image-processing';

/**
 * GET - Fetch all images for a product
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log('[GET IMAGES] Starting request for product:', id);
    
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[GET IMAGES] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const productId = id;
    console.log('[GET IMAGES] User authenticated:', user.id);

    // Get product to find canonical_product_id
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('canonical_product_id, user_id, use_custom_image, custom_image_url')
      .eq('id', productId)
      .single();

    console.log('[GET IMAGES] Product query result:', { product, error: productError });

    if (productError || !product) {
      console.error('[GET IMAGES] Product not found:', productError);
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Verify user owns the product
    if (product.user_id !== user.id) {
      console.error('[GET IMAGES] User does not own product');
      return NextResponse.json({ error: 'Unauthorised' }, { status: 403 });
    }

    console.log('[GET IMAGES] Product canonical_product_id:', product.canonical_product_id);

    // Get images from canonical product
    let images: any[] = [];
    if (product.canonical_product_id) {
      try {
        images = await getProductImages(product.canonical_product_id);
        console.log('[GET IMAGES] Found images:', images.length);
      } catch (imageError) {
        console.error('[GET IMAGES] Error fetching images:', imageError);
        // Continue with empty images array
      }
    } else {
      console.log('[GET IMAGES] No canonical_product_id - product not matched yet');
    }

    return NextResponse.json({
      success: true,
      data: {
        images,
        useCustomImage: product.use_custom_image,
        customImageUrl: product.custom_image_url,
        canonicalProductId: product.canonical_product_id,
      },
    });
  } catch (error) {
    console.error('[GET IMAGES] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch images';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH - Update image properties
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const productId = id;
    const body = await request.json();
    const { action, imageId, imageIds } = body;

    // Verify user owns the product
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('canonical_product_id, user_id')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 403 });
    }

    if (!product.canonical_product_id) {
      return NextResponse.json(
        { error: 'Product has no canonical product' },
        { status: 400 }
      );
    }

    if (action === 'set_primary') {
      if (!imageId) {
        return NextResponse.json({ error: 'Image ID required' }, { status: 400 });
      }

      await setPrimaryImage(imageId);

      return NextResponse.json({
        success: true,
        message: 'Primary image updated',
      });
    } else if (action === 'reorder') {
      if (!imageIds || !Array.isArray(imageIds)) {
        return NextResponse.json(
          { error: 'Image IDs array required' },
          { status: 400 }
        );
      }

      await reorderImages(imageIds, product.canonical_product_id);

      return NextResponse.json({
        success: true,
        message: 'Images reordered',
      });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Update image error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE - Delete an image
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const productId = id;
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID required' }, { status: 400 });
    }

    // Verify user owns the product
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('user_id')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 403 });
    }

    await deleteProductImage(imageId);

    return NextResponse.json({
      success: true,
      message: 'Image deleted',
    });
  } catch (error) {
    console.error('Delete image error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


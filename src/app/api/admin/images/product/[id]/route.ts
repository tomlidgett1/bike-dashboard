/**
 * Admin Product Images API
 * GET /api/admin/images/product/[id] - Fetch single product with all images
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Await params if it's a Promise (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params;
    const canonicalProductId = resolvedParams.id;

    console.log(`[ADMIN PRODUCT IMAGES] Params object:`, resolvedParams);
    console.log(`[ADMIN PRODUCT IMAGES] Fetching images for product ID: ${canonicalProductId}`);
    console.log(`[ADMIN PRODUCT IMAGES] ID type: ${typeof canonicalProductId}`);

    // Fetch product with images
    const { data: product, error: productError } = await supabase
      .from('canonical_products')
      .select(`
        id,
        normalized_name,
        upc,
        category,
        manufacturer,
        created_at,
        product_images (
          id,
          storage_path,
          external_url,
          is_downloaded,
          is_primary,
          sort_order,
          approval_status,
          width,
          height,
          file_size,
          mime_type,
          created_at
        )
      `)
      .eq('id', canonicalProductId)
      .single();

    if (productError || !product) {
      console.error(`[ADMIN PRODUCT IMAGES] Error fetching product:`, productError);
      console.error(`[ADMIN PRODUCT IMAGES] Product data:`, product);
      return NextResponse.json({ 
        error: 'Product not found', 
        details: productError?.message,
        productId: canonicalProductId 
      }, { status: 404 });
    }

    // Get URLs for images (external URLs for non-downloaded, storage URLs for downloaded)
    const images = await Promise.all(
      (product.product_images || []).map(async (img: any) => {
        let url: string;
        
        // If not downloaded yet, use external URL
        if (!img.is_downloaded && img.external_url) {
          url = img.external_url;
        } 
        // Otherwise use storage URL
        else if (img.storage_path) {
          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(img.storage_path);
          url = urlData.publicUrl;
        } 
        // Fallback
        else {
          url = '/placeholder-product.svg';
        }

        return {
          ...img,
          url,
        };
      })
    );

    // Group by approval status
    const pendingImages = images.filter(img => img.approval_status === 'pending');
    const approvedImages = images.filter(img => img.approval_status === 'approved');
    const rejectedImages = images.filter(img => img.approval_status === 'rejected');

    return NextResponse.json({
      success: true,
      data: {
        id: product.id,
        normalized_name: product.normalized_name,
        upc: product.upc,
        category: product.category,
        manufacturer: product.manufacturer,
        created_at: product.created_at,
        images: {
          all: images,
          pending: pendingImages,
          approved: approvedImages,
          rejected: rejectedImages,
        },
        counts: {
          total: images.length,
          pending: pendingImages.length,
          approved: approvedImages.length,
          rejected: rejectedImages.length,
        },
      },
    });
  } catch (error) {
    console.error('[ADMIN PRODUCT IMAGES] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch product images';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


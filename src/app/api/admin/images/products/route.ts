/**
 * Admin Image Products API
 * GET /api/admin/images/products - Fetch products with image counts and approval statuses
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const filter = searchParams.get('filter') || 'all'; // all, has_pending, has_approved, no_images
    const search = searchParams.get('search') || '';

    const offset = (page - 1) * limit;

    console.log(`[ADMIN PRODUCTS] Fetching page ${page}, filter: ${filter}, search: "${search}"`);

    // Build base query
    let query = supabase
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
          approval_status,
          is_primary,
          storage_path,
          width,
          height,
          created_at
        )
      `, { count: 'exact' });

    // Apply search filter
    if (search) {
      query = query.or(`normalized_name.ilike.%${search}%,upc.ilike.%${search}%`);
    }

    // Fetch data
    const { data: products, error: productsError, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (productsError) {
      console.error('[ADMIN PRODUCTS] Error:', productsError);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    // Transform data to include counts and generate URLs
    const transformedProducts = products?.map(product => {
      const images = product.product_images || [];
      const pendingImages = images.filter((img: any) => img.approval_status === 'pending');
      const approvedImages = images.filter((img: any) => img.approval_status === 'approved');
      const rejectedImages = images.filter((img: any) => img.approval_status === 'rejected');

      // Get primary image and generate public URL
      const primaryImage = approvedImages.find((img: any) => img.is_primary) || approvedImages[0] || null;
      let primaryImageWithUrl = null;
      if (primaryImage) {
        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(primaryImage.storage_path);
        primaryImageWithUrl = {
          ...primaryImage,
          url: urlData.publicUrl,
        };
      }

      return {
        id: product.id,
        normalized_name: product.normalized_name,
        upc: product.upc,
        category: product.category,
        manufacturer: product.manufacturer,
        created_at: product.created_at,
        image_counts: {
          total: images.length,
          pending: pendingImages.length,
          approved: approvedImages.length,
          rejected: rejectedImages.length,
        },
        primary_image: primaryImageWithUrl,
        has_pending: pendingImages.length > 0,
        has_approved: approvedImages.length > 0,
        status: pendingImages.length > 0 ? 'pending_review' : approvedImages.length > 0 ? 'approved' : 'no_images',
      };
    }) || [];

    // Apply filter after transformation
    let filteredProducts = transformedProducts;
    if (filter === 'has_pending') {
      filteredProducts = transformedProducts.filter(p => p.has_pending);
    } else if (filter === 'has_approved') {
      filteredProducts = transformedProducts.filter(p => p.has_approved && !p.has_pending);
    } else if (filter === 'no_images') {
      filteredProducts = transformedProducts.filter(p => p.image_counts.total === 0);
    }

    // Calculate stats
    const stats = {
      total: count || 0,
      pending_review: transformedProducts.filter(p => p.has_pending).length,
      approved: transformedProducts.filter(p => p.has_approved && !p.has_pending).length,
      no_images: transformedProducts.filter(p => p.image_counts.total === 0).length,
    };

    return NextResponse.json({
      success: true,
      data: filteredProducts,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
      stats,
    });
  } catch (error) {
    console.error('[ADMIN PRODUCTS] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch products';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


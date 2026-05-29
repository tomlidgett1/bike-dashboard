/**
 * Admin Image Workbench Products API
 * GET /api/admin/images/products
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveProductImage } from '@/lib/services/image-resolver';

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

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    // Allow up to 200 for the rapid review batch loader
    const limit = Math.min(parseInt(searchParams.get('limit') || '24'), 200);
    const status = searchParams.get('status') || 'needs_work';
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const lsCategoryId = searchParams.get('ls_category_id') || '';
    const subcategory = searchParams.get('subcategory') || '';
    const level3 = searchParams.get('level3') || '';
    const manufacturer = searchParams.get('manufacturer') || '';
    // SOH / price filters (use aggregates from linked store products)
    const minQoh = searchParams.get('min_qoh') ? parseInt(searchParams.get('min_qoh')!) : null;
    const minPrice = searchParams.get('min_price') ? parseFloat(searchParams.get('min_price')!) : null;
    const maxPrice = searchParams.get('max_price') ? parseFloat(searchParams.get('max_price')!) : null;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('image_workbench_products')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`normalized_name.ilike.%${search}%,display_name.ilike.%${search}%,upc.ilike.%${search}%`);
    }

    // Filter by Lightspeed category ID (preferred — always populated by both sync paths)
    if (lsCategoryId) {
      query = query.eq('ls_category_id', lsCategoryId);
    } else if (category) {
      // Legacy: filter by canonical category / marketplace_category or stored category name
      query = query.or(`ls_category_name.eq.${category},category.eq.${category},marketplace_category.eq.${category}`);
    }
    if (subcategory) query = query.eq('marketplace_subcategory', subcategory);
    if (level3) query = query.eq('marketplace_level_3_category', level3);
    if (manufacturer) query = query.eq('manufacturer', manufacturer);

    // SOH / price — filter on view columns added by the 20260528120000 migration
    if (minQoh !== null) query = query.gte('total_qoh', minQoh);
    if (minPrice !== null) query = query.gte('min_price', minPrice);
    if (maxPrice !== null) query = query.lte('max_price', maxPrice);

    if (status === 'no_approved') {
      // Auto-pilot target: products with no approved images at all (pending ones are fine).
      query = query.eq('approved_images', 0);
    } else if (status === 'missing') {
      query = query.eq('approved_images', 0).eq('pending_images', 0);
    } else if (status === 'pending') {
      query = query.gt('pending_images', 0);
    } else if (status === 'ready') {
      query = query.gt('approved_images', 0).not('primary_image_id', 'is', null);
    } else if (status === 'needs_primary') {
      query = query.gt('approved_images', 0).is('primary_image_id', null);
    } else if (status === 'failed') {
      query = query.eq('image_review_status', 'failed');
    } else if (status === 'needs_work') {
      query = query.or('approved_images.eq.0,pending_images.gt.0,primary_image_id.is.null,image_review_status.in.(pending,recommended,in_review,failed,no_results)');
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[IMAGE WORKBENCH] Products query error:', error);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    const products = (data || []).map((product: any) => {
      const primary = resolveProductImage({
        id: product.primary_image_id,
        cloudinary_public_id: product.primary_cloudinary_public_id,
        cloudinary_url: product.primary_cloudinary_url,
        external_url: product.primary_external_url,
        approval_status: 'approved',
      });

      return {
        ...product,
        primary_image_url: primary?.card_url || primary?.original_url || null,
        primary_thumbnail_url: primary?.thumbnail_url || null,
        readiness_status: product.primary_image_id
          ? 'ready'
          : product.approved_images > 0
            ? 'needs_primary'
            : product.pending_images > 0
              ? 'pending_review'
              : 'missing_images',
      };
    });

    return NextResponse.json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('[IMAGE WORKBENCH] Products error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch image workbench products' },
      { status: 500 }
    );
  }
}

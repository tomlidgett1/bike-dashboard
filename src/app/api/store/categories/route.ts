/**
 * Store Categories API
 * 
 * Manages custom categories for bike stores to organize their products
 * on their public store profile page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateCategoryRequest, UpdateCategoryRequest } from '@/lib/types/store';
import { syncDynamicCarouselProductIds } from '@/lib/store/carousel-products';
import { fetchUberEnabledProductIds } from '@/lib/store/uber-carousel';

/**
 * GET /api/store/categories
 * Fetch all categories for authenticated merchant
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage categories.' },
        { status: 403 }
      );
    }

    // Fetch categories
    const { data: categories, error } = await supabase
      .from('store_categories')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching categories:', error);
      return NextResponse.json(
        { error: 'Failed to fetch categories' },
        { status: 500 }
      );
    }

    const editableCategories = (categories ?? []).filter(
      (category) => category.source !== 'display_override',
    );

    const syncedCategories = await syncDynamicCarouselProductIds(
      supabase,
      user.id,
      editableCategories,
    );

    const categoriesWithNames = await Promise.all(
      syncedCategories.map(async (category) => {
        if (
          category.source !== 'lightspeed' ||
          category.lightspeed_category_name ||
          !category.name
        ) {
          return category;
        }

        const { error } = await supabase
          .from('store_categories')
          .update({ lightspeed_category_name: category.name })
          .eq('id', category.id)
          .eq('user_id', user.id);

        if (error) {
          console.error('[store/categories] Failed to backfill lightspeed_category_name:', error);
          return category;
        }

        return { ...category, lightspeed_category_name: category.name };
      }),
    );

    return NextResponse.json({ categories: categoriesWithNames });
  } catch (error) {
    console.error('Error in GET /api/store/categories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/store/categories
 * Create new category (custom or from Lightspeed)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage categories.' },
        { status: 403 }
      );
    }

    const body: CreateCategoryRequest = await request.json();

    // Validate required fields
    if (!body.name || !body.source) {
      return NextResponse.json(
        { error: 'Name and source are required' },
        { status: 400 }
      );
    }

    if (!['lightspeed', 'custom', 'brand', 'uber'].includes(body.source)) {
      return NextResponse.json(
        { error: 'Source must be "lightspeed", "custom", "brand", or "uber"' },
        { status: 400 }
      );
    }

    if (body.source === 'brand' && !body.brand_name?.trim()) {
      return NextResponse.json(
        { error: 'brand_name is required for brand carousels' },
        { status: 400 }
      );
    }

    // Get next display order if not provided
    let displayOrder = body.display_order ?? 0;
    if (displayOrder === 0) {
      const { data: maxOrder } = await supabase
        .from('store_categories')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();

      displayOrder = (maxOrder?.display_order ?? -1) + 1;
    }

    const uberProductIds =
      body.source === 'uber' ? await fetchUberEnabledProductIds(supabase, user.id) : null;

    // Insert category
    const storePage = body.store_page === 'bikes' ? 'bikes' : 'products';

    const lightspeedCategoryName =
      body.source === 'lightspeed'
        ? body.lightspeed_category_name?.trim() || body.name
        : null;

    const { data: category, error } = await supabase
      .from('store_categories')
      .insert({
        user_id: user.id,
        name: body.name,
        source: body.source,
        lightspeed_category_id: body.lightspeed_category_id,
        lightspeed_category_name: lightspeedCategoryName,
        brand_name: body.brand_name ?? null,
        product_ids: uberProductIds ?? body.product_ids ?? [],
        display_order: displayOrder,
        is_active: true,
        store_page: storePage,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      return NextResponse.json(
        { error: 'Failed to create category' },
        { status: 500 }
      );
    }

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/store/categories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/store/categories
 * Update category (rename, reorder, modify product_ids)
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage categories.' },
        { status: 403 }
      );
    }

    const body: UpdateCategoryRequest = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.brand_name !== undefined) updateData.brand_name = body.brand_name;
    if (body.product_ids !== undefined) updateData.product_ids = body.product_ids;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.carousel_size !== undefined) updateData.carousel_size = body.carousel_size;
    if ('section_id' in body) updateData.section_id = body.section_id ?? null;
    if ('logo_url' in body) updateData.logo_url = body.logo_url ?? null;
    if ('logo_max_width' in body) {
      if (body.logo_max_width == null) {
        updateData.logo_max_width = null;
      } else {
        const width = Number(body.logo_max_width);
        if (!Number.isFinite(width) || width <= 0) {
          return NextResponse.json(
            { error: 'logo_max_width must be a positive number' },
            { status: 400 },
          );
        }
        updateData.logo_max_width = Math.round(width);
      }
    }
    if ('hide_title' in body) updateData.hide_title = !!body.hide_title;
    if (body.store_page !== undefined) {
      updateData.store_page = body.store_page === 'bikes' ? 'bikes' : 'products';
      if (updateData.store_page === 'bikes') {
        updateData.section_id = null;
      }
    }

    // Assigning an Uber carousel to a section: sync all Uber-enabled products
    if ('section_id' in body && body.section_id != null) {
      const { data: existing } = await supabase
        .from('store_categories')
        .select('source')
        .eq('id', body.id)
        .eq('user_id', user.id)
        .single();

      if (existing?.source === 'uber') {
        updateData.product_ids = await fetchUberEnabledProductIds(supabase, user.id);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update category
    const { data: category, error } = await supabase
      .from('store_categories')
      .update(updateData)
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating category:', error);
      return NextResponse.json(
        { error: 'Failed to update category' },
        { status: 500 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ category });
  } catch (error) {
    console.error('Error in PUT /api/store/categories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/store/categories
 * Delete category
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage categories.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('id');

    if (!categoryId) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      );
    }

    // Delete category
    const { error } = await supabase
      .from('store_categories')
      .delete()
      .eq('id', categoryId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting category:', error);
      return NextResponse.json(
        { error: 'Failed to delete category' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/store/categories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}











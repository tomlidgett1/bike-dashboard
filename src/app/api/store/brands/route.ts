/**
 * Store Brands API
 *
 * Manages brands stocked by bike stores
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateBrandRequest, UpdateBrandRequest } from '@/lib/types/store';

async function getVerifiedStore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { user: null, error: 'Unauthorized', status: 401 };

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return { user: null, error: 'Access denied. Only verified bicycle stores can manage brands.', status: 403 };
  }

  return { user, error: null, status: 200 };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { user, error, status } = await getVerifiedStore(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const { data: brands, error: dbError } = await supabase
      .from('store_brands')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true });

    if (dbError) {
      console.error('Error fetching brands:', dbError);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    return NextResponse.json({ brands: brands || [] });
  } catch (err) {
    console.error('Error in GET /api/store/brands:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { user, error, status } = await getVerifiedStore(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body: CreateBrandRequest = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Brand name is required' }, { status: 400 });
    }

    let displayOrder = body.display_order ?? 0;
    if (displayOrder === 0) {
      const { data: maxOrder } = await supabase
        .from('store_brands')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();
      displayOrder = (maxOrder?.display_order ?? -1) + 1;
    }

    const { data: brand, error: dbError } = await supabase
      .from('store_brands')
      .insert({
        user_id: user.id,
        name: body.name.trim(),
        logo_url: body.logo_url || null,
        lightspeed_manufacturer_id: body.lightspeed_manufacturer_id || null,
        lightspeed_manufacturer_name: body.lightspeed_manufacturer_name?.trim() || null,
        display_order: displayOrder,
        is_active: true,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Error creating brand:', dbError);
      return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 });
    }

    return NextResponse.json({ brand }, { status: 201 });
  } catch (err) {
    console.error('Error in POST /api/store/brands:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { user, error, status } = await getVerifiedStore(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body: UpdateBrandRequest = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Brand ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.logo_url !== undefined) updateData.logo_url = body.logo_url;
    if (body.lightspeed_manufacturer_id !== undefined) {
      updateData.lightspeed_manufacturer_id = body.lightspeed_manufacturer_id;
    }
    if (body.lightspeed_manufacturer_name !== undefined) {
      updateData.lightspeed_manufacturer_name = body.lightspeed_manufacturer_name;
    }
    if (body.display_order !== undefined) updateData.display_order = body.display_order;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: brand, error: dbError } = await supabase
      .from('store_brands')
      .update(updateData)
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (dbError) {
      console.error('Error updating brand:', dbError);
      return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 });
    }

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    return NextResponse.json({ brand });
  } catch (err) {
    console.error('Error in PUT /api/store/brands:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { user, error, status } = await getVerifiedStore(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('id');
    if (!brandId) {
      return NextResponse.json({ error: 'Brand ID is required' }, { status: 400 });
    }

    const { error: dbError } = await supabase
      .from('store_brands')
      .delete()
      .eq('id', brandId)
      .eq('user_id', user.id);

    if (dbError) {
      console.error('Error deleting brand:', dbError);
      return NextResponse.json({ error: 'Failed to delete brand' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/store/brands:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

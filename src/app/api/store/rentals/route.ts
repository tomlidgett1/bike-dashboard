/**
 * Store Rentals API
 *
 * Manages products offered for hire on the bike store storefront.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateRentalRequest, UpdateRentalRequest } from '@/lib/types/store';

async function assertVerifiedStore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return {
      error: NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage rentals.' },
        { status: 403 },
      ),
    };
  }

  return { user };
}

function parseOptionalPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

function hasPricing(pricePerHour: number | null, pricePerDay: number | null) {
  return pricePerHour != null || pricePerDay != null;
}

async function assertProductOwned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  productId: string,
) {
  const { data: product, error } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !product) {
    return false;
  }
  return true;
}

/**
 * GET /api/store/rentals
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const { data: rentals, error } = await supabase
      .from('store_rentals')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching rentals:', error);
      return NextResponse.json({ error: 'Failed to fetch rentals' }, { status: 500 });
    }

    return NextResponse.json({ rentals: rentals || [] });
  } catch (error) {
    console.error('Error in GET /api/store/rentals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/store/rentals
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const body: CreateRentalRequest = await request.json();

    if (!body.product_id) {
      return NextResponse.json({ error: 'Product is required' }, { status: 400 });
    }

    const pricePerHour = parseOptionalPrice(body.price_per_hour);
    const pricePerDay = parseOptionalPrice(body.price_per_day);

    if (!hasPricing(pricePerHour, pricePerDay)) {
      return NextResponse.json(
        { error: 'At least one rental price (hourly or daily) is required' },
        { status: 400 },
      );
    }

    const ownsProduct = await assertProductOwned(supabase, user.id, body.product_id);
    if (!ownsProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    let displayOrder = body.display_order ?? 0;
    if (displayOrder === 0) {
      const { data: maxOrder } = await supabase
        .from('store_rentals')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      displayOrder = (maxOrder?.display_order ?? -1) + 1;
    }

    const { data: rental, error } = await supabase
      .from('store_rentals')
      .insert({
        user_id: user.id,
        product_id: body.product_id,
        description: body.description?.trim() || null,
        price_per_hour: pricePerHour,
        price_per_day: pricePerDay,
        is_available: body.is_available ?? true,
        display_order: displayOrder,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This product is already listed as a rental' },
          { status: 409 },
        );
      }
      console.error('Error creating rental:', error);
      return NextResponse.json({ error: 'Failed to create rental' }, { status: 500 });
    }

    return NextResponse.json({ rental }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/store/rentals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/store/rentals
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const body: UpdateRentalRequest = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Rental ID is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('store_rentals')
      .select('price_per_hour, price_per_day')
      .eq('id', body.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if ('price_per_hour' in body) updateData.price_per_hour = parseOptionalPrice(body.price_per_hour);
    if ('price_per_day' in body) updateData.price_per_day = parseOptionalPrice(body.price_per_day);
    if (body.is_available !== undefined) updateData.is_available = body.is_available;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const nextHourly =
      'price_per_hour' in updateData ? (updateData.price_per_hour as number | null) : existing.price_per_hour;
    const nextDaily =
      'price_per_day' in updateData ? (updateData.price_per_day as number | null) : existing.price_per_day;

    if (!hasPricing(nextHourly, nextDaily)) {
      return NextResponse.json(
        { error: 'At least one rental price (hourly or daily) is required' },
        { status: 400 },
      );
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: rental, error } = await supabase
      .from('store_rentals')
      .update(updateData)
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating rental:', error);
      return NextResponse.json({ error: 'Failed to update rental' }, { status: 500 });
    }

    return NextResponse.json({ rental });
  } catch (error) {
    console.error('Error in PUT /api/store/rentals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/store/rentals
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const { searchParams } = new URL(request.url);
    const rentalId = searchParams.get('id');

    if (!rentalId) {
      return NextResponse.json({ error: 'Rental ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('store_rentals')
      .delete()
      .eq('id', rentalId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting rental:', error);
      return NextResponse.json({ error: 'Failed to delete rental' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/store/rentals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

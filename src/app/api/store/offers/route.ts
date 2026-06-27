/**
 * Store Bundle Offers API
 *
 * Buy X, get Y free bundle offers for the bike store storefront.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateBundleOfferRequest, UpdateBundleOfferRequest } from '@/lib/types/store';

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
        { error: 'Access denied. Only verified bicycle stores can manage offers.' },
        { status: 403 },
      ),
    };
  }

  return { user };
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

  return !error && !!product;
}

async function assertServiceOwned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  serviceId: string,
) {
  const { data: service, error } = await supabase
    .from('store_services')
    .select('id')
    .eq('id', serviceId)
    .eq('user_id', userId)
    .maybeSingle();

  return !error && !!service;
}

function validateBuyTarget(buyProductId?: string | null, buyServiceId?: string | null) {
  const hasProduct = !!buyProductId;
  const hasService = !!buyServiceId;
  if (hasProduct === hasService) {
    return 'Select exactly one buy item — either a product or a service.';
  }
  return null;
}

function validateFreeProducts(freeProductIds: string[]) {
  if (!freeProductIds.length) {
    return 'Select at least one free product.';
  }
  return null;
}

function validateExpiry(expiresAt: string) {
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    return 'Expiry date is invalid.';
  }
  if (parsed.getTime() <= Date.now()) {
    return 'Expiry date must be in the future.';
  }
  return null;
}

/**
 * GET /api/store/offers
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const { data: offers, error } = await supabase
      .from('store_bundle_offers')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching offers:', error);
      return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
    }

    return NextResponse.json({ offers: offers || [] });
  } catch (error) {
    console.error('Error in GET /api/store/offers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/store/offers
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const body: CreateBundleOfferRequest = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Offer name is required' }, { status: 400 });
    }

    const buyError = validateBuyTarget(body.buy_product_id, body.buy_service_id);
    if (buyError) {
      return NextResponse.json({ error: buyError }, { status: 400 });
    }

    const freeError = validateFreeProducts(body.free_product_ids ?? []);
    if (freeError) {
      return NextResponse.json({ error: freeError }, { status: 400 });
    }

    if (!body.expires_at) {
      return NextResponse.json({ error: 'Expiry date is required' }, { status: 400 });
    }

    const expiryError = validateExpiry(body.expires_at);
    if (expiryError) {
      return NextResponse.json({ error: expiryError }, { status: 400 });
    }

    if (body.buy_product_id) {
      const owns = await assertProductOwned(supabase, user.id, body.buy_product_id);
      if (!owns) {
        return NextResponse.json({ error: 'Buy product not found' }, { status: 404 });
      }
    }

    if (body.buy_service_id) {
      const owns = await assertServiceOwned(supabase, user.id, body.buy_service_id);
      if (!owns) {
        return NextResponse.json({ error: 'Buy service not found' }, { status: 404 });
      }
    }

    for (const productId of body.free_product_ids) {
      const owns = await assertProductOwned(supabase, user.id, productId);
      if (!owns) {
        return NextResponse.json({ error: 'One or more free products were not found' }, { status: 404 });
      }
    }

    let displayOrder = body.display_order ?? 0;
    if (displayOrder === 0) {
      const { data: maxOrder } = await supabase
        .from('store_bundle_offers')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      displayOrder = (maxOrder?.display_order ?? -1) + 1;
    }

    const { data: offer, error } = await supabase
      .from('store_bundle_offers')
      .insert({
        user_id: user.id,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        buy_product_id: body.buy_product_id || null,
        buy_service_id: body.buy_service_id || null,
        free_product_ids: body.free_product_ids,
        expires_at: body.expires_at,
        display_order: displayOrder,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating offer:', error);
      return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
    }

    return NextResponse.json({ offer }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/store/offers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/store/offers
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const body: UpdateBundleOfferRequest = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Offer ID is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('store_bundle_offers')
      .select('*')
      .eq('id', body.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const nextBuyProductId =
      'buy_product_id' in body ? body.buy_product_id : existing.buy_product_id;
    const nextBuyServiceId =
      'buy_service_id' in body ? body.buy_service_id : existing.buy_service_id;
    const nextFreeIds =
      body.free_product_ids ?? existing.free_product_ids ?? [];

    const buyError = validateBuyTarget(nextBuyProductId, nextBuyServiceId);
    if (buyError) {
      return NextResponse.json({ error: buyError }, { status: 400 });
    }

    const freeError = validateFreeProducts(nextFreeIds);
    if (freeError) {
      return NextResponse.json({ error: freeError }, { status: 400 });
    }

    if (body.expires_at) {
      const expiryError = validateExpiry(body.expires_at);
      if (expiryError) {
        return NextResponse.json({ error: expiryError }, { status: 400 });
      }
    }

    if (nextBuyProductId) {
      const owns = await assertProductOwned(supabase, user.id, nextBuyProductId);
      if (!owns) {
        return NextResponse.json({ error: 'Buy product not found' }, { status: 404 });
      }
    }

    if (nextBuyServiceId) {
      const owns = await assertServiceOwned(supabase, user.id, nextBuyServiceId);
      if (!owns) {
        return NextResponse.json({ error: 'Buy service not found' }, { status: 404 });
      }
    }

    for (const productId of nextFreeIds) {
      const owns = await assertProductOwned(supabase, user.id, productId);
      if (!owns) {
        return NextResponse.json({ error: 'One or more free products were not found' }, { status: 404 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if ('buy_product_id' in body) updateData.buy_product_id = body.buy_product_id || null;
    if ('buy_service_id' in body) updateData.buy_service_id = body.buy_service_id || null;
    if (body.free_product_ids !== undefined) updateData.free_product_ids = body.free_product_ids;
    if (body.expires_at !== undefined) updateData.expires_at = body.expires_at;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: offer, error } = await supabase
      .from('store_bundle_offers')
      .update(updateData)
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating offer:', error);
      return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 });
    }

    return NextResponse.json({ offer });
  } catch (error) {
    console.error('Error in PUT /api/store/offers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/store/offers
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await assertVerifiedStore(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string } };

    const { searchParams } = new URL(request.url);
    const offerId = searchParams.get('id');

    if (!offerId) {
      return NextResponse.json({ error: 'Offer ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('store_bundle_offers')
      .delete()
      .eq('id', offerId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting offer:', error);
      return NextResponse.json({ error: 'Failed to delete offer' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/store/offers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

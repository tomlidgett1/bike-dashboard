import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UBER_RADIUS_KM, validateUberDelivery } from '@/lib/uber-delivery';

interface CheckEligibilityRequest {
  sellerId?: string;
  productIds?: string[];
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: CheckEligibilityRequest = await request.json();

    if (!body.address || !body.address.line1 || !body.address.city) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    if (!body.sellerId && (!Array.isArray(body.productIds) || body.productIds.length === 0)) {
      return NextResponse.json(
        { error: 'Seller or products are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const productIds = Array.isArray(body.productIds)
      ? [...new Set(body.productIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [];

    let products: Array<{
      id: string;
      user_id: string;
      uber_delivery_enabled: boolean | null;
      display_name?: string | null;
      description?: string | null;
    }> = [];

    if (productIds.length > 0) {
      const { data, error } = await supabase
        .from('products')
        .select('id, user_id, uber_delivery_enabled, display_name, description')
        .in('id', productIds);

      if (error) {
        console.error('[Eligibility] Product fetch error:', error);
        return NextResponse.json({ error: 'Failed to check products' }, { status: 500 });
      }

      products = data || [];
      if (products.length !== productIds.length) {
        return NextResponse.json({
          eligible: false,
          distance: null,
          maxRadius: UBER_RADIUS_KM,
          message: 'One or more products are no longer available for Uber Express.',
        });
      }
    } else if (body.sellerId) {
      products = [
        {
          id: 'address-check',
          user_id: body.sellerId,
          uber_delivery_enabled: true,
        },
      ];
    }

    const result = await validateUberDelivery(supabase, {
      sellerId: body.sellerId,
      products,
      shippingAddress: body.address,
      requireAddress: true,
    });

    return NextResponse.json({
      eligible: result.eligible,
      distance: result.distance,
      maxRadius: UBER_RADIUS_KM,
      storeName: result.storeName,
      message: result.reason,
    });
  } catch (error) {
    console.error('[Eligibility] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check delivery eligibility' },
      { status: 500 }
    );
  }
}

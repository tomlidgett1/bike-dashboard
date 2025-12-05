// ============================================================
// OFFERS API - GET SINGLE OFFER
// ============================================================
// GET: Get single offer with full details and history

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { GetOfferResponse, EnrichedOffer } from '@/lib/types/offer';

export const dynamic = 'force-dynamic';

// ============================================================
// GET: Get single offer with history
// ============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Fetch offer with enriched data
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        products!product_id (
          id,
          description,
          display_name,
          primary_image_url,
          listing_status
        )
      `)
      .eq('id', id)
      .single();

    if (offerError || !offer) {
      return NextResponse.json(
        { error: 'Offer not found' },
        { status: 404 }
      );
    }

    // Check authorization (user must be buyer or seller)
    if (offer.buyer_id !== user.id && offer.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorised to view this offer' },
        { status: 403 }
      );
    }

    // Fetch user data
    const { data: buyerData } = await supabase
      .from('users')
      .select('user_id, name, business_name, logo_url')
      .eq('user_id', offer.buyer_id)
      .single();

    const { data: sellerData } = await supabase
      .from('users')
      .select('user_id, name, business_name, logo_url')
      .eq('user_id', offer.seller_id)
      .single();

    // Fetch offer history
    const { data: history } = await supabase
      .from('offer_history')
      .select('*')
      .eq('offer_id', id)
      .order('created_at', { ascending: true });

    // Fetch users for history
    let historyWithUsers = history || [];
    if (history && history.length > 0) {
      const historyUserIds = [...new Set(history.map(h => h.offered_by_id))];
      const { data: historyUsersData } = await supabase
        .from('users')
        .select('user_id, name, business_name, logo_url')
        .in('user_id', historyUserIds);

      const historyUsersMap = new Map(historyUsersData?.map(u => [u.user_id, u]) || []);
      historyWithUsers = history.map(h => ({
        ...h,
        user: historyUsersMap.get(h.offered_by_id) || null,
      }));
    }

    const enrichedOffer: EnrichedOffer = {
      ...offer,
      product: (offer as any).products,
      buyer: buyerData,
      seller: sellerData,
      history: historyWithUsers,
    };
    delete (enrichedOffer as any).products;

    const response: GetOfferResponse = {
      offer: enrichedOffer,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/offers/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


// ============================================================
// OFFERS API - CANCEL OFFER
// ============================================================
// PATCH: Cancel an offer (buyer only)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CancelOfferResponse, EnrichedOffer } from '@/lib/types/offer';

export const dynamic = 'force-dynamic';

// ============================================================
// PATCH: Cancel offer
// ============================================================
export async function PATCH(
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

    // Fetch offer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('*')
      .eq('id', id)
      .single();

    if (offerError || !offer) {
      return NextResponse.json(
        { error: 'Offer not found' },
        { status: 404 }
      );
    }

    // Check authorization (must be buyer)
    if (offer.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the buyer can cancel this offer' },
        { status: 403 }
      );
    }

    // Check if offer can be cancelled
    if (offer.status !== 'pending' && offer.status !== 'countered') {
      return NextResponse.json(
        { error: `Cannot cancel offer with status: ${offer.status}` },
        { status: 400 }
      );
    }

    // Update offer status
    const { data: updatedOffer, error: updateError } = await supabase
      .from('offers')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating offer:', updateError);
      return NextResponse.json(
        { error: 'Failed to cancel offer' },
        { status: 500 }
      );
    }

    // Fetch enriched offer data
    const { data: offerWithProduct } = await supabase
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

    // Fetch user data
    const { data: buyerData } = await supabase
      .from('users')
      .select('user_id, name, business_name, logo_url')
      .eq('user_id', updatedOffer.buyer_id)
      .single();

    const { data: sellerData } = await supabase
      .from('users')
      .select('user_id, name, business_name, logo_url')
      .eq('user_id', updatedOffer.seller_id)
      .single();

    const enrichedOffer = {
      ...offerWithProduct,
      product: (offerWithProduct as any).products,
      buyer: buyerData,
      seller: sellerData,
    };
    delete (enrichedOffer as any).products;

    // TODO: Create notification for seller
    // This will be implemented in the notifications-system todo

    const response: CancelOfferResponse = {
      offer: enrichedOffer as EnrichedOffer,
      message: 'Offer cancelled',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in PATCH /api/offers/[id]/cancel:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


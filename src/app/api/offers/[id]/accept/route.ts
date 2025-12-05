// ============================================================
// OFFERS API - ACCEPT OFFER
// ============================================================
// PATCH: Accept an offer (seller only)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AcceptOfferResponse, EnrichedOffer } from '@/lib/types/offer';

export const dynamic = 'force-dynamic';

// ============================================================
// PATCH: Accept offer
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

    // Check authorization (must be seller)
    if (offer.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the seller can accept this offer' },
        { status: 403 }
      );
    }

    // Check if offer can be accepted
    if (offer.status !== 'pending' && offer.status !== 'countered') {
      return NextResponse.json(
        { error: `Cannot accept offer with status: ${offer.status}` },
        { status: 400 }
      );
    }

    // Check if offer is expired
    if (new Date(offer.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This offer has expired' },
        { status: 400 }
      );
    }

    // Update offer status
    const { data: updatedOffer, error: updateError } = await supabase
      .from('offers')
      .update({ 
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating offer:', updateError);
      return NextResponse.json(
        { error: 'Failed to accept offer' },
        { status: 500 }
      );
    }

    // Update product status to pending
    await supabase
      .from('products')
      .update({ listing_status: 'pending' })
      .eq('id', offer.product_id);

    // Reject all other pending offers on this product
    await supabase
      .from('offers')
      .update({ 
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('product_id', offer.product_id)
      .neq('id', id)
      .in('status', ['pending', 'countered']);

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

    // TODO: Create notification for buyer
    // This will be implemented in the notifications-system todo

    const response: AcceptOfferResponse = {
      offer: enrichedOffer as EnrichedOffer,
      message: 'Offer accepted successfully',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in PATCH /api/offers/[id]/accept:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


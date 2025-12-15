// ============================================================
// OFFERS API - COUNTER OFFER
// ============================================================
// POST: Counter an offer with new amount
// - Seller can counter a pending offer from buyer
// - Buyer can counter a counter-offer from seller

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { 
  CounterOfferRequest, 
  CounterOfferResponse, 
  EnrichedOffer 
} from '@/lib/types/offer';

export const dynamic = 'force-dynamic';

// ============================================================
// POST: Counter offer
// ============================================================
export async function POST(
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

    // Parse request body
    const body: CounterOfferRequest = await request.json();
    const { newAmount, message } = body;

    // Validate required fields
    if (!newAmount || newAmount <= 0) {
      return NextResponse.json(
        { error: 'Valid counter amount is required' },
        { status: 400 }
      );
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

    // Check authorization:
    // - Seller can counter pending offers
    // - Buyer can counter counter-offers
    const isSellerCountering = offer.seller_id === user.id && offer.status === 'pending';
    const isBuyerCountering = offer.buyer_id === user.id && offer.status === 'countered';
    
    if (!isSellerCountering && !isBuyerCountering) {
      return NextResponse.json(
        { error: 'You cannot counter this offer' },
        { status: 403 }
      );
    }

    // Check if offer can be countered
    if (offer.status !== 'pending' && offer.status !== 'countered') {
      return NextResponse.json(
        { error: `Cannot counter offer with status: ${offer.status}` },
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

    // Validate counter amount
    if (newAmount >= offer.original_price) {
      return NextResponse.json(
        { error: 'Counter amount must be less than the original price' },
        { status: 400 }
      );
    }

    // For seller: counter must be higher than buyer's offer
    // For buyer: counter can be higher than seller's counter (meeting in middle)
    if (isSellerCountering && newAmount <= offer.offer_amount) {
      return NextResponse.json(
        { error: 'Counter amount should be higher than the current offer' },
        { status: 400 }
      );
    }
    
    // For buyer countering: new offer should be higher than their original but less than seller's counter
    // Actually, buyer's counter should just be a new amount that makes sense
    if (isBuyerCountering && newAmount >= offer.offer_amount) {
      return NextResponse.json(
        { error: 'Your counter should be less than the seller\'s counter-offer' },
        { status: 400 }
      );
    }

    // Calculate new expiry (7 days from now)
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    // Calculate new percentage
    const newPercentage = ((offer.original_price - newAmount) / offer.original_price) * 100;

    // Update offer
    const { data: updatedOffer, error: updateError } = await supabase
      .from('offers')
      .update({ 
        offer_amount: newAmount,
        offer_percentage: Math.round(newPercentage * 100) / 100,
        status: 'countered',
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating offer:', updateError);
      return NextResponse.json(
        { error: 'Failed to counter offer' },
        { status: 500 }
      );
    }

    // Create history entry
    await supabase
      .from('offer_history')
      .insert({
        offer_id: id,
        action_type: 'countered',
        offered_by_id: user.id,
        previous_amount: offer.offer_amount,
        new_amount: newAmount,
        message: message || null,
      });

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

    const response: CounterOfferResponse = {
      offer: enrichedOffer as EnrichedOffer,
      message: 'Counter offer sent successfully',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in POST /api/offers/[id]/counter:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


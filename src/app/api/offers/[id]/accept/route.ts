// ============================================================
// OFFERS API - ACCEPT OFFER
// ============================================================
// PATCH: Accept an offer
// - Seller can accept a pending offer from buyer
// - Buyer can accept a counter-offer from seller

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

    // Check authorization:
    // - Seller can accept pending offers
    // - Buyer can accept counter-offers
    const isSellerAcceptingOffer = offer.seller_id === user.id && offer.status === 'pending';
    const isBuyerAcceptingCounterOffer = offer.buyer_id === user.id && offer.status === 'countered';
    
    if (!isSellerAcceptingOffer && !isBuyerAcceptingCounterOffer) {
      if (offer.status === 'countered' && offer.seller_id === user.id) {
        return NextResponse.json(
          { error: 'The buyer needs to accept or decline your counter-offer' },
          { status: 403 }
        );
      }
      if (offer.status === 'pending' && offer.buyer_id === user.id) {
        return NextResponse.json(
          { error: 'The seller needs to respond to your offer' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: 'You cannot accept this offer' },
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

    // Calculate payment deadline (48 hours from now)
    const paymentDeadline = new Date();
    paymentDeadline.setHours(paymentDeadline.getHours() + 48);

    // Build update data - include new fields if they exist
    const updateData: Record<string, any> = { 
      status: 'accepted',
      updated_at: new Date().toISOString(),
    };

    // Try with payment fields first, fallback to basic update if columns don't exist
    let updatedOffer: any;
    let updateError: any;

    // First attempt with all payment fields
    const result1 = await supabase
      .from('offers')
      .update({ 
        ...updateData,
        payment_status: 'pending',
        payment_deadline: paymentDeadline.toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (result1.error && result1.error.message?.includes('column')) {
      // Fallback: payment columns don't exist yet
      console.log('[Accept Offer] Payment columns not found, using basic update');
      const result2 = await supabase
        .from('offers')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      updatedOffer = result2.data;
      updateError = result2.error;
    } else {
      updatedOffer = result1.data;
      updateError = result1.error;
      console.log('[Accept Offer] Payment deadline set:', paymentDeadline.toISOString());
    }

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


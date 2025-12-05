// ============================================================
// OFFERS API - CREATE & LIST
// ============================================================
// POST: Create new offer
// GET: List user's offers

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { 
  CreateOfferRequest, 
  CreateOfferResponse, 
  GetOffersRequest, 
  GetOffersResponse,
  EnrichedOffer,
  OfferStatus 
} from '@/lib/types/offer';

export const dynamic = 'force-dynamic';

// ============================================================
// POST: Create new offer
// ============================================================
export async function POST(request: NextRequest) {
  try {
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
    const body: CreateOfferRequest = await request.json();
    const { productId, offerAmount, offerPercentage, message } = body;

    // Validate required fields
    if (!productId || !offerAmount || offerAmount <= 0) {
      return NextResponse.json(
        { error: 'Product ID and valid offer amount are required' },
        { status: 400 }
      );
    }

    // Fetch product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, price, user_id, listing_status, description, display_name')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Validate offer
    if (product.user_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot make an offer on your own product' },
        { status: 400 }
      );
    }

    if (product.listing_status !== 'active') {
      return NextResponse.json(
        { error: 'This product is not available for offers' },
        { status: 400 }
      );
    }

    if (offerAmount >= product.price) {
      return NextResponse.json(
        { error: 'Offer amount must be less than the product price' },
        { status: 400 }
      );
    }

    // Calculate expiry date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create offer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .insert({
        product_id: productId,
        buyer_id: user.id,
        seller_id: product.user_id,
        original_price: product.price,
        offer_amount: offerAmount,
        offer_percentage: offerPercentage || null,
        message: message || null,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select()
      .single();

    if (offerError) {
      console.error('Error creating offer:', offerError);
      return NextResponse.json(
        { error: 'Failed to create offer' },
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
      .eq('id', offer.id)
      .single();

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

    const enrichedOffer = {
      ...offerWithProduct,
      product: (offerWithProduct as any).products,
      buyer: buyerData,
      seller: sellerData,
    };
    delete (enrichedOffer as any).products;

    // TODO: Create notification for seller
    // This will be implemented in the notifications-system todo

    const response: CreateOfferResponse = {
      offer: enrichedOffer as EnrichedOffer,
      message: 'Offer submitted successfully',
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/offers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// GET: List user's offers
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const role = searchParams.get('role') as 'buyer' | 'seller' | null;
    const statusParam = searchParams.get('status');
    const productId = searchParams.get('productId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Parse status (can be single or comma-separated)
    let statuses: OfferStatus[] | null = null;
    if (statusParam) {
      statuses = statusParam.split(',') as OfferStatus[];
    }

    // Build query
    let query = supabase
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
      `, { count: 'exact' });

    // Filter by role
    if (role === 'buyer') {
      query = query.eq('buyer_id', user.id);
    } else if (role === 'seller') {
      query = query.eq('seller_id', user.id);
    } else {
      // Show all offers where user is buyer or seller
      query = query.or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);
    }

    // Filter by status
    if (statuses && statuses.length > 0) {
      query = query.in('status', statuses);
    }

    // Filter by product
    if (productId) {
      query = query.eq('product_id', productId);
    }

    // Pagination and sorting
    const startIndex = (page - 1) * limit;
    query = query
      .order('created_at', { ascending: false })
      .range(startIndex, startIndex + limit - 1);

    const { data: offers, error: offersError, count } = await query;

    if (offersError) {
      console.error('Error fetching offers:', offersError);
      return NextResponse.json(
        { error: 'Failed to fetch offers' },
        { status: 500 }
      );
    }

    // Enrich offers with user data
    if (offers && offers.length > 0) {
      const buyerIds = [...new Set(offers.map(o => o.buyer_id))];
      const sellerIds = [...new Set(offers.map(o => o.seller_id))];
      const allUserIds = [...new Set([...buyerIds, ...sellerIds])];

      // Fetch user data
      const { data: usersData } = await supabase
        .from('users')
        .select('user_id, name, business_name, logo_url')
        .in('user_id', allUserIds);

      // Create a map for quick lookup
      const usersMap = new Map(usersData?.map(u => [u.user_id, u]) || []);

      // Enrich offers
      offers.forEach((offer: any) => {
        offer.product = offer.products;
        delete offer.products;
        offer.buyer = usersMap.get(offer.buyer_id) || null;
        offer.seller = usersMap.get(offer.seller_id) || null;
      });
    }

    // Calculate stats
    const { data: statsData } = await supabase
      .from('offers')
      .select('status')
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

    const stats = {
      total: statsData?.length || 0,
      pending: statsData?.filter(o => o.status === 'pending').length || 0,
      accepted: statsData?.filter(o => o.status === 'accepted').length || 0,
      rejected: statsData?.filter(o => o.status === 'rejected').length || 0,
      countered: statsData?.filter(o => o.status === 'countered').length || 0,
      expired: statsData?.filter(o => o.status === 'expired').length || 0,
    };

    const response: GetOffersResponse = {
      offers: offers as EnrichedOffer[],
      total: count || 0,
      page,
      limit,
      stats,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/offers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


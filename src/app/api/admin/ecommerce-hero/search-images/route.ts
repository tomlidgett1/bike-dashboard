/**
 * Image Search API for E-commerce Hero
 * POST /api/admin/ecommerce-hero/search-images
 * 
 * Calls the search-product-images edge function which has access to Serper API
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Get session for edge function auth
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token' }, { status: 401 });
    }

    const body = await request.json();
    const { searchQuery, productName, brand } = body;

    if (!searchQuery && !productName) {
      return NextResponse.json(
        { error: 'Search query or product name required' },
        { status: 400 }
      );
    }

    // Build search query - simple, no extra context
    const query = searchQuery || `${brand ? brand + ' ' : ''}${productName}`;
    
    console.log(`[SEARCH-IMAGES] Searching for: "${query}"`);

    // Call edge function which has access to Serper API key
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/search-product-images`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ searchQuery: query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SEARCH-IMAGES] Edge function error:', errorText);
      return NextResponse.json(
        { error: 'Image search failed' },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    if (!data.success) {
      return NextResponse.json(
        { error: data.error || 'Search failed' },
        { status: 500 }
      );
    }

    console.log(`[SEARCH-IMAGES] Found ${data.results?.length || 0} images`);

    return NextResponse.json({
      success: true,
      query: data.query,
      results: data.results,
      total: data.total,
    });
  } catch (error) {
    console.error('[SEARCH-IMAGES] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}


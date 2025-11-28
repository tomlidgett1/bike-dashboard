import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// Store Products API - Public Endpoint
// Returns products for a specific store with filters
// ============================================================

export const dynamic = 'force-dynamic';
export const revalidate = 60; // ISR: Revalidate every 1 minute

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { storeId } = await context.params;
    const { searchParams } = new URL(request.url);
    
    const category = searchParams.get('category');
    const subcategory = searchParams.get('subcategory');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '24', 10);
    const sortBy = searchParams.get('sortBy') || 'newest';

    const supabase = await createClient();

    // Build query
    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('user_id', storeId)
      .eq('is_active', true);

    // Apply filters
    if (category) {
      query = query.eq('marketplace_category', category);
    }

    if (subcategory) {
      query = query.eq('marketplace_subcategory', subcategory);
    }

    // Apply sorting
    switch (sortBy) {
      case 'price_asc':
        query = query.order('price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Apply pagination
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    query = query.range(start, end);

    const { data: products, error, count } = await query;

    // Debug logging
    console.log(`[API] Store ${storeId} - Category: ${category}, Products: ${count}, Page: ${page}`);

    if (error) {
      console.error('Error fetching store products:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }

    const totalPages = Math.ceil((count || 0) / pageSize);
    const hasMore = page < totalPages;

    // Cache for 1 minute with stale-while-revalidate
    return NextResponse.json(
      {
        products: products || [],
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages,
          hasMore,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'CDN-Cache-Control': 'public, s-maxage=60',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=60',
        },
      }
    );
  } catch (error) {
    console.error('Unexpected error in store products API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// Store Filters API - Returns stores for filter pills
// Lightweight endpoint optimised for the store filter component
// Returns stores with product counts, sorted by product count
// ============================================================

export const dynamic = 'force-dynamic';
export const revalidate = 300; // ISR: Revalidate every 5 minutes

export async function GET() {
  const startTime = performance.now();
  
  try {
    const supabase = await createClient();

    // Try to use the RPC function first (most efficient)
    const { data: stores, error: rpcError } = await supabase
      .rpc('get_stores_with_product_counts');

    if (!rpcError && stores) {
      const queryTime = performance.now() - startTime;
      console.log(`⚡ [STORE-FILTERS] Fetched ${stores.length} stores in ${queryTime.toFixed(0)}ms (RPC)`);
      
      // Transform and sort by product count (descending)
      const storeFilters = stores
        .filter((store: any) => store.product_count > 0)
        .map((store: any) => ({
          id: store.user_id,
          name: store.business_name?.trim() || 'Bike Store',
          logo_url: store.logo_url,
          product_count: store.product_count || 0,
        }))
        .sort((a: any, b: any) => b.product_count - a.product_count);

      return NextResponse.json(
        { stores: storeFilters, total: storeFilters.length },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
            'CDN-Cache-Control': 'public, s-maxage=300',
            'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
            'X-Response-Time': `${queryTime.toFixed(0)}ms`,
          },
        }
      );
    }

    // Fallback: Query users with bicycle_store account type
    console.log('[STORE-FILTERS] RPC not available, using fallback query');
    
    const { data: users, error } = await supabase
      .from('users')
      .select('user_id, business_name, logo_url')
      .eq('account_type', 'bicycle_store')
      .eq('bicycle_store', true);

    if (error) {
      console.error('[STORE-FILTERS] Error fetching users:', error);
      return NextResponse.json(
        { error: 'Failed to fetch stores' },
        { status: 500 }
      );
    }

    // Get product counts for each store
    const userIds = (users || []).map(u => u.user_id);
    
    if (userIds.length === 0) {
      return NextResponse.json({ stores: [], total: 0 });
    }

    const { data: productCounts } = await supabase
      .from('products')
      .select('user_id')
      .in('user_id', userIds)
      .eq('is_active', true);

    // Count products per user
    const countMap = new Map<string, number>();
    (productCounts || []).forEach((p: any) => {
      countMap.set(p.user_id, (countMap.get(p.user_id) || 0) + 1);
    });

    // Transform and sort
    const storeFilters = (users || [])
      .map(user => ({
        id: user.user_id,
        name: user.business_name?.trim() || 'Bike Store',
        logo_url: user.logo_url,
        product_count: countMap.get(user.user_id) || 0,
      }))
      .filter(store => store.product_count > 0)
      .sort((a, b) => b.product_count - a.product_count);

    const queryTime = performance.now() - startTime;
    console.log(`⚡ [STORE-FILTERS] Fetched ${storeFilters.length} stores in ${queryTime.toFixed(0)}ms (fallback)`);

    return NextResponse.json(
      { stores: storeFilters, total: storeFilters.length },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'public, s-maxage=300',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
          'X-Response-Time': `${queryTime.toFixed(0)}ms`,
        },
      }
    );
  } catch (error) {
    console.error('[STORE-FILTERS] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


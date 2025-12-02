import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// Marketplace Stores API - Public Endpoint
// Returns all stores (users) on the platform
// OPTIMISED: Single query with product counts (was 50+ queries, now 1)
// ============================================================

export const dynamic = 'force-dynamic';
export const revalidate = 300; // ISR: Revalidate every 5 minutes

export async function GET() {
  const startTime = performance.now();
  
  try {
    const supabase = await createClient();

    // OPTIMISED: Single query using RPC function for stores with product counts
    const { data: stores, error: rpcError } = await supabase
      .rpc('get_stores_with_product_counts');

    if (!rpcError && stores) {
      const queryTime = performance.now() - startTime;
      console.log(`⚡ [STORES] Fetched ${stores.length} stores in ${queryTime.toFixed(0)}ms (RPC)`);
      
      // Transform the data
      const activeStores = stores.map((store: any) => ({
        id: store.user_id,
        store_name: store.business_name?.trim() || 'Bike Store',
        store_type: store.store_type?.trim() || 'Retail',
        logo_url: store.logo_url,
        product_count: store.product_count || 0,
        joined_date: store.created_at,
      }));

      return NextResponse.json(
        { stores: activeStores, total: activeStores.length },
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

    // Fallback: Use JOIN query if RPC doesn't exist
    console.log('[STORES] RPC not available, using fallback query');
    
    // OPTIMISED FALLBACK: Single query with LEFT JOIN instead of N+1
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('users')
      .select(`
        user_id,
        business_name,
        store_type,
        logo_url,
        created_at,
        products!left(id)
      `)
      .eq('products.is_active', true);

    if (fallbackError) {
      console.error('Error fetching stores (fallback):', fallbackError);
      
      // Ultimate fallback: separate queries but log warning
      console.warn('[STORES] Using N+1 fallback - consider creating RPC function');
      
      const { data: users, error } = await supabase
        .from('users')
        .select('user_id, business_name, store_type, logo_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch stores' },
          { status: 500 }
        );
      }

      // Batch product counts in a single query
      const userIds = (users || []).map(u => u.user_id);
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

      const activeStores = (users || [])
        .map(user => ({
          id: user.user_id,
          store_name: user.business_name?.trim() || 'Bike Store',
          store_type: user.store_type?.trim() || 'Retail',
          logo_url: user.logo_url,
          product_count: countMap.get(user.user_id) || 0,
          joined_date: user.created_at,
        }))
        .filter(store => store.product_count > 0);

      const queryTime = performance.now() - startTime;
      console.log(`⚡ [STORES] Fetched ${activeStores.length} stores in ${queryTime.toFixed(0)}ms (batched fallback)`);

      return NextResponse.json(
        { stores: activeStores, total: activeStores.length },
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

    // Process JOIN fallback result
    const activeStores = (fallbackData || [])
      .map((user: any) => ({
        id: user.user_id,
        store_name: user.business_name?.trim() || 'Bike Store',
        store_type: user.store_type?.trim() || 'Retail',
        logo_url: user.logo_url,
        product_count: Array.isArray(user.products) ? user.products.length : 0,
        joined_date: user.created_at,
      }))
      .filter((store: any) => store.product_count > 0);

    const queryTime = performance.now() - startTime;
    console.log(`⚡ [STORES] Fetched ${activeStores.length} stores in ${queryTime.toFixed(0)}ms (JOIN fallback)`);

    return NextResponse.json(
      { stores: activeStores, total: activeStores.length },
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
    console.error('Unexpected error in stores API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


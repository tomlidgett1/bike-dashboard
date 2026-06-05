import { NextResponse } from 'next/server';
import { createPublicSupabaseClient } from '@/lib/marketplace/public-card-feed';

// ============================================================
// Store Filters API — store pills for Bike Stores tab
// Lists verified stores that have marketplace-visible store inventory only
// (no product counts — avoids heavy aggregation)
// ============================================================

export const revalidate = 300;

export async function GET() {
  const startTime = performance.now();

  try {
    const supabase = createPublicSupabaseClient();

    const { data: stores, error: rpcError } = await supabase.rpc(
      'get_bike_stores_for_marketplace_filters'
    );

    if (rpcError) {
      console.error('[STORE-FILTERS] RPC error:', rpcError);
    }

    if (!rpcError && Array.isArray(stores) && stores.length > 0) {
      const queryTime = performance.now() - startTime;
      console.log(
        `⚡ [STORE-FILTERS] Fetched ${stores.length} stores in ${queryTime.toFixed(0)}ms (RPC)`
      );

      const storeFilters = (stores as { user_id: string; business_name: string | null; logo_url: string | null }[]).map(
        (store) => ({
          id: store.user_id,
          name: store.business_name?.trim() || 'Bike Store',
          logo_url: store.logo_url,
        })
      );

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

    console.log('[STORE-FILTERS] RPC empty or unavailable, using fallback');

    const { data: users, error } = await supabase
      .from('users')
      .select('user_id, business_name, logo_url')
      .eq('account_type', 'bicycle_store')
      .eq('bicycle_store', true);

    if (error) {
      console.error('[STORE-FILTERS] Error fetching users:', error);
      return NextResponse.json({ error: 'Failed to fetch stores' }, { status: 500 });
    }

    const userIds = (users || []).map((u) => u.user_id);
    if (userIds.length === 0) {
      return NextResponse.json({ stores: [], total: 0 });
    }

    const [{ data: readyRows }, { data: activeProductRows }] = await Promise.all([
      supabase
        .from('marketplace_ready_products')
        .select('user_id')
        .in('user_id', userIds)
        .or('listing_type.eq.store_inventory,listing_type.is.null'),
      supabase
        .from('products')
        .select('user_id')
        .in('user_id', userIds)
        .eq('is_active', true),
    ]);

    const eligible = new Set<string>();
    for (const row of readyRows || []) {
      eligible.add((row as { user_id: string }).user_id);
    }
    for (const row of activeProductRows || []) {
      eligible.add((row as { user_id: string }).user_id);
    }

    const storeFilters = (users || [])
      .filter((u) => eligible.has(u.user_id))
      .map((user) => ({
        id: user.user_id,
        name: user.business_name?.trim() || 'Bike Store',
        logo_url: user.logo_url,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

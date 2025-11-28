import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// Marketplace Stores API - Public Endpoint
// Returns all stores (users) on the platform
// ============================================================

export const dynamic = 'force-dynamic';
export const revalidate = 300; // ISR: Revalidate every 5 minutes

export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch all users with their profile information
    const { data: users, error } = await supabase
      .from('users')
      .select('user_id, business_name, store_type, logo_url, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching stores:', error);
      return NextResponse.json(
        { error: 'Failed to fetch stores' },
        { status: 500 }
      );
    }

    // Get product counts for each store
    const storesWithCounts = await Promise.all(
      (users || []).map(async (user) => {
        const { count } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.user_id)
          .eq('is_active', true);

        return {
          id: user.user_id,
          store_name: user.business_name && user.business_name.trim() !== '' 
            ? user.business_name 
            : 'Bike Store',
          store_type: user.store_type && user.store_type.trim() !== '' 
            ? user.store_type 
            : 'Retail',
          logo_url: user.logo_url,
          product_count: count || 0,
          joined_date: user.created_at,
        };
      })
    );

    // Filter out stores with no products
    const activeStores = storesWithCounts.filter(store => store.product_count > 0);

    // Cache aggressively (5 minutes)
    return NextResponse.json(
      { stores: activeStores, total: activeStores.length },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'public, s-maxage=300',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
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


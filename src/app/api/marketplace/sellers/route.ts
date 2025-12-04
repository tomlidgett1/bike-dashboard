/**
 * Marketplace Individual Sellers API - Public Endpoint
 * Returns all individual sellers (non-bicycle stores) with active listings
 * 
 * Individual sellers are users where:
 * - account_type is NOT 'bicycle_store', OR
 * - bicycle_store is false (not verified)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // ISR: Revalidate every 5 minutes

export interface IndividualSeller {
  id: string;
  display_name: string;
  logo_url: string | null;
  location: string | null;
  product_count: number;
  joined_date: string;
}

export async function GET() {
  const startTime = performance.now();
  
  try {
    const supabase = await createClient();

    // Fetch individual sellers (not verified bicycle stores) with active listings
    // Using a subquery approach to count products
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select(`
        user_id,
        first_name,
        last_name,
        business_name,
        seller_display_name,
        logo_url,
        address,
        account_type,
        bicycle_store,
        created_at
      `)
      .or('account_type.neq.bicycle_store,bicycle_store.eq.false')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('[SELLERS] Error fetching users:', usersError);
      return NextResponse.json(
        { error: 'Failed to fetch sellers' },
        { status: 500 }
      );
    }

    if (!users || users.length === 0) {
      return NextResponse.json(
        { sellers: [], total: 0 },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          },
        }
      );
    }

    // Get product counts for all users in a single query
    const userIds = users.map(u => u.user_id);
    
    const { data: productCounts, error: productsError } = await supabase
      .from('products')
      .select('user_id')
      .in('user_id', userIds)
      .eq('is_active', true)
      .is('sold_at', null);

    if (productsError) {
      console.error('[SELLERS] Error fetching product counts:', productsError);
    }

    // Count products per user
    const countMap = new Map<string, number>();
    (productCounts || []).forEach((p: any) => {
      countMap.set(p.user_id, (countMap.get(p.user_id) || 0) + 1);
    });

    // Transform and filter to only include sellers with active listings
    const activeSellers: IndividualSeller[] = users
      .map(user => {
        // Build display name (similar to seller profile)
        const displayName = user.seller_display_name 
          || user.business_name 
          || `${user.first_name || ''} ${user.last_name || ''}`.trim()
          || 'Anonymous Seller';

        return {
          id: user.user_id,
          display_name: displayName,
          logo_url: user.logo_url,
          location: user.address || null,
          product_count: countMap.get(user.user_id) || 0,
          joined_date: user.created_at,
        };
      })
      .filter(seller => seller.product_count > 0)
      .sort((a, b) => b.product_count - a.product_count); // Sort by most products first

    const queryTime = performance.now() - startTime;
    console.log(`⚡ [SELLERS] Fetched ${activeSellers.length} individual sellers in ${queryTime.toFixed(0)}ms`);

    return NextResponse.json(
      { sellers: activeSellers, total: activeSellers.length },
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
    console.error('[SELLERS] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


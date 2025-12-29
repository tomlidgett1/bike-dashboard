/**
 * E-Commerce Hero Filters API
 * GET /api/admin/ecommerce-hero/filters
 * 
 * Returns filter options for the e-commerce hero admin UI
 * - Distinct brands from products
 * - Stores (users) that have products
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Fetch distinct brands from active products
    const { data: brandsData, error: brandsError } = await supabase
      .from('products')
      .select('brand')
      .eq('is_active', true)
      .not('brand', 'is', null)
      .order('brand', { ascending: true });

    if (brandsError) {
      console.error('[ECOMMERCE-HERO FILTERS] Error fetching brands:', brandsError);
    }

    // Get unique brands
    const uniqueBrands = [...new Set(
      (brandsData || [])
        .map(p => p.brand)
        .filter((b): b is string => !!b && b.trim() !== '')
    )].sort();

    // Fetch stores (users) that have active products
    const { data: storesData, error: storesError } = await supabase
      .from('products')
      .select(`
        user_id,
        users!user_id (
          user_id,
          business_name,
          account_type
        )
      `)
      .eq('is_active', true);

    if (storesError) {
      console.error('[ECOMMERCE-HERO FILTERS] Error fetching stores:', storesError);
    }

    // Get unique stores with their info
    const storeMap = new Map<string, { id: string; name: string; productCount: number }>();
    
    for (const product of storesData || []) {
      const userData = product.users as { user_id?: string; business_name?: string; account_type?: string } | null;
      const userId = product.user_id;
      
      if (userId && userData?.business_name) {
        const existing = storeMap.get(userId);
        if (existing) {
          existing.productCount++;
        } else {
          storeMap.set(userId, {
            id: userId,
            name: userData.business_name,
            productCount: 1,
          });
        }
      }
    }

    // Convert to array and sort by product count (most products first)
    const stores = Array.from(storeMap.values())
      .sort((a, b) => b.productCount - a.productCount);

    return NextResponse.json({
      success: true,
      data: {
        brands: uniqueBrands,
        stores,
      },
    });
  } catch (error) {
    console.error('[ECOMMERCE-HERO FILTERS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch filters' },
      { status: 500 }
    );
  }
}



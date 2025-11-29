/**
 * Lightspeed Categories Scan API
 * 
 * Scans Lightspeed account for active categories
 * Returns categories that have products with inventory > 0
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLightspeedClient } from '@/lib/services/lightspeed';
import type { LightspeedCategoryOption } from '@/lib/types/store';

/**
 * GET /api/lightspeed/categories/scan
 * Scan Lightspeed account for active categories with products
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can scan categories.' },
        { status: 403 }
      );
    }

    // Check if user has Lightspeed connection
    const { data: connection } = await supabase
      .from('lightspeed_connections')
      .select('status')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: 'No active Lightspeed connection found. Please connect your Lightspeed account first.' },
        { status: 400 }
      );
    }

    // Create Lightspeed client
    const client = createLightspeedClient(user.id);

    // Fetch all categories from Lightspeed (same as categories-sync endpoint)
    const lightspeedCategoriesResponse = await client.getCategories({ archived: 'false' });
    
    if (!lightspeedCategoriesResponse || !Array.isArray(lightspeedCategoriesResponse)) {
      return NextResponse.json({ categories: [] });
    }

    // Get products from database to count by category
    const { data: products } = await supabase
      .from('products')
      .select('lightspeed_category_id, category_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gt('qoh', 0);

    // Count products per category
    const categoryProductCounts = new Map<string, { name: string; count: number }>();
    
    if (products) {
      products.forEach((product) => {
        if (product.lightspeed_category_id) {
          const existing = categoryProductCounts.get(product.lightspeed_category_id);
          if (existing) {
            existing.count++;
          } else {
            categoryProductCounts.set(product.lightspeed_category_id, {
              name: product.category_name || 'Unknown',
              count: 1,
            });
          }
        }
      });
    }

    // Build category options with product counts
    const categoryOptions: LightspeedCategoryOption[] = [];
    
    for (const category of lightspeedCategoriesResponse) {
      const categoryId = category.categoryID;
      const productInfo = categoryProductCounts.get(categoryId);
      
      // Only include categories that have products with inventory
      if (productInfo && productInfo.count > 0) {
        categoryOptions.push({
          id: categoryId,
          name: category.name || productInfo.name,
          product_count: productInfo.count,
        });
      }
    }

    // Sort by product count (descending)
    categoryOptions.sort((a, b) => b.product_count - a.product_count);

    return NextResponse.json({ categories: categoryOptions });
  } catch (error) {
    console.error('Error in GET /api/lightspeed/categories/scan:', error);
    
    // Handle specific Lightspeed errors
    if (error instanceof Error) {
      if (error.message.includes('No valid access token')) {
        return NextResponse.json(
          { error: 'Lightspeed connection expired. Please reconnect your account.' },
          { status: 401 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to scan Lightspeed categories' },
      { status: 500 }
    );
  }
}


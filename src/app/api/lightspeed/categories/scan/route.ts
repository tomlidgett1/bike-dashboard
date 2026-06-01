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
    const lightspeedCategoriesResponse = await client.getAllCategories({ archived: 'false' });
    
    if (!lightspeedCategoriesResponse || !Array.isArray(lightspeedCategoriesResponse)) {
      return NextResponse.json({ categories: [] });
    }

    // Get products from database to count by category.
    // Source of truth is the DB — the Lightspeed API is used only to enrich
    // category names; categories that have been archived/removed from Lightspeed
    // but still have live products in the DB should still appear.
    const { data: products } = await supabase
      .from('products')
      .select('lightspeed_category_id, category_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gt('qoh', 0);

    // Count products per category — keyed by lightspeed_category_id when present,
    // otherwise by category_name (prefixed with "name:") as a fallback key.
    const categoryProductCounts = new Map<string, { name: string; count: number; isNameOnly: boolean }>();

    if (products) {
      products.forEach((product) => {
        if (product.lightspeed_category_id) {
          const key = String(product.lightspeed_category_id);
          const existing = categoryProductCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            categoryProductCounts.set(key, {
              name: product.category_name || 'Unknown',
              count: 1,
              isNameOnly: false,
            });
          }
        } else if (product.category_name) {
          // No Lightspeed category ID — group by category_name
          const key = `name:${product.category_name}`;
          const existing = categoryProductCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            categoryProductCounts.set(key, {
              name: product.category_name,
              count: 1,
              isNameOnly: true,
            });
          }
        }
      });
    }

    // Build a lookup of Lightspeed API category names by ID
    const lsNameById = new Map<string, string>(
      lightspeedCategoriesResponse.map((c: { categoryID: string | number; name?: string }) => [
        String(c.categoryID),
        c.name || String(c.categoryID),
      ])
    );

    // Build category options from ALL DB categories — DB-first, not API-first.
    // This ensures categories that are archived in Lightspeed but still have
    // active inventory still appear in the optimizer.
    const categoryOptions: LightspeedCategoryOption[] = [];

    for (const [key, info] of categoryProductCounts) {
      if (info.count === 0) continue;
      if (info.isNameOnly) {
        // No LS ID — use the category_name as the id so the optimizer can still
        // pass it as a filter (products route filters by category_name when
        // ls_category_id isn't set).
        categoryOptions.push({
          id: key, // "name:Bars" — the products route handles this format
          name: info.name,
          product_count: info.count,
        });
      } else {
        // Use the Lightspeed API name if available, otherwise fall back to DB name
        const apiName = lsNameById.get(key);
        categoryOptions.push({
          id: key,
          name: apiName || info.name,
          product_count: info.count,
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


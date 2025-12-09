/**
 * Store Category Names API
 * 
 * Returns auto-generated category names from products table
 * and allows creating display name overrides
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/store/category-names
 * Get all category names from products with counts
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

    // Get all unique category names with product counts
    const { data: products } = await supabase
      .from('products')
      .select('category_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gt('qoh', 0);

    // Count products per category
    const categoryCounts = new Map<string, number>();
    products?.forEach((product) => {
      const categoryName = product.category_name || 'Uncategorized';
      categoryCounts.set(categoryName, (categoryCounts.get(categoryName) || 0) + 1);
    });

    // Get existing category overrides
    const { data: overrides } = await supabase
      .from('store_categories')
      .select('*')
      .eq('user_id', user.id)
      .eq('source', 'display_override');

    const overridesMap = new Map(
      overrides?.map(o => [o.lightspeed_category_id, o]) || []
    );

    // Build category list
    const categories = Array.from(categoryCounts.entries()).map(([categoryName, count]) => {
      const override = overridesMap.get(categoryName);
      return {
        category_name: categoryName,
        display_name: override?.name || categoryName,
        product_count: count,
        has_override: !!override,
        override_id: override?.id,
      };
    });

    // Sort by product count descending
    categories.sort((a, b) => b.product_count - a.product_count);

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error in GET /api/store/category-names:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}







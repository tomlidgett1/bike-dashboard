import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_SUBCATEGORIES,
  type MarketplaceCategoriesResponse,
  type CategoryStats,
  type MarketplaceCategory,
} from '@/lib/types/marketplace';

// ============================================================
// Marketplace Categories API - Public Endpoint
// Returns category hierarchy with product counts
// ============================================================

export const dynamic = 'force-dynamic';
export const revalidate = 300; // ISR: Revalidate every 5 minutes (categories change less frequently)

export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch all active products with their categories
    const { data: products, error } = await supabase
      .from('products')
      .select('marketplace_category, marketplace_subcategory')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching category stats:', error);
      return NextResponse.json(
        { error: 'Failed to fetch categories' },
        { status: 500 }
      );
    }

    // Build category statistics
    const categoryStats: CategoryStats[] = MARKETPLACE_CATEGORIES.map((category) => {
      // Get all products in this category
      const categoryProducts = products.filter(
        (p) => p.marketplace_category === category
      );

      // Count products per subcategory
      const subcategoryStats = MARKETPLACE_SUBCATEGORIES[category as MarketplaceCategory].map(
        (subcategory) => {
          const count = categoryProducts.filter(
            (p) => p.marketplace_subcategory === subcategory
          ).length;

          return {
            name: subcategory,
            count,
          };
        }
      );

      return {
        category,
        subcategories: subcategoryStats,
        totalProducts: categoryProducts.length,
      };
    });

    // Calculate total products
    const totalProducts = products.length;

    const response: MarketplaceCategoriesResponse = {
      categories: categoryStats,
      totalProducts,
    };

    // Cache aggressively (5 minutes)
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
      },
    });
  } catch (error) {
    console.error('Unexpected error in categories API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


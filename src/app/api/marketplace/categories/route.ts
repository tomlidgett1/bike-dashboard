import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// Marketplace Categories API - Public Endpoint
// Returns category hierarchy with product counts from DB
// Supports filtering by listing type (stores, individuals)
// ============================================================

export const dynamic = 'force-dynamic';
export const revalidate = 300; // ISR: Revalidate every 5 minutes (categories change less frequently)

interface CategoryHierarchy {
  level1: string;
  level2Categories: {
    name: string;
    count: number;
    level3Categories: {
      name: string;
      count: number;
    }[];
  }[];
  totalProducts: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get listing type filter from query params
    const { searchParams } = new URL(request.url);
    const listingType = searchParams.get('listingType'); // 'store_inventory' | 'private_listing' | null

    // Build the query
    let query = supabase
      .from('products')
      .select('marketplace_category, marketplace_subcategory, marketplace_level_3_category')
      .eq('is_active', true);
    
    // Filter by listing type if specified
    if (listingType === 'store_inventory' || listingType === 'private_listing') {
      query = query.eq('listing_type', listingType);
    }

    // Fetch products with their categories
    const { data: products, error } = await query;

    if (error) {
      console.error('Error fetching category stats:', error);
      return NextResponse.json(
        { error: 'Failed to fetch categories' },
        { status: 500 }
      );
    }

    // Get distinct Level 1 categories
    const level1Categories = Array.from(
      new Set(
        products
          .map(p => p.marketplace_category)
          .filter(cat => cat != null && cat.trim() !== '')
      )
    ).sort();

    // Build hierarchical category structure
    const categoryHierarchy: CategoryHierarchy[] = level1Categories.map(level1 => {
      // Get all products in this Level 1 category
      const level1Products = products.filter(p => p.marketplace_category === level1);

      // Get distinct Level 2 categories for this Level 1
      const level2Categories = Array.from(
        new Set(
          level1Products
            .map(p => p.marketplace_subcategory)
            .filter(cat => cat != null && cat.trim() !== '')
        )
      ).sort();

      // Build Level 2 stats with Level 3 nested
      const level2Stats = level2Categories.map(level2 => {
        const level2Products = level1Products.filter(p => p.marketplace_subcategory === level2);

        // Get distinct Level 3 categories for this Level 2
        const level3Categories = Array.from(
          new Set(
            level2Products
              .map(p => p.marketplace_level_3_category)
              .filter(cat => cat != null && cat.trim() !== '')
          )
        ).sort();

        const level3Stats = level3Categories.map(level3 => ({
          name: level3,
          count: level2Products.filter(p => p.marketplace_level_3_category === level3).length,
        }));

        return {
          name: level2,
          count: level2Products.length,
          level3Categories: level3Stats,
        };
      });

      return {
        level1,
        level2Categories: level2Stats,
        totalProducts: level1Products.length,
      };
    });

    // Calculate total products
    const totalProducts = products.length;

    const response = {
      categories: categoryHierarchy,
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






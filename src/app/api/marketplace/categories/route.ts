import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
} from '@/lib/marketplace/public-card-feed';

// ============================================================
// Marketplace Categories API - Public Endpoint
// Returns category hierarchy with product counts from DB
// Supports filtering by listing type (stores, individuals)
// ============================================================

export const revalidate = 300; // ISR: Revalidate every 5 minutes (categories change less frequently)
export const runtime = 'edge';

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

interface MarketplaceCategoryRow {
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  marketplace_level_3_category: string | null;
}

function buildCategoryHierarchy(products: MarketplaceCategoryRow[]): {
  categories: CategoryHierarchy[];
  totalProducts: number;
} {
  const level1Categories = Array.from(
    new Set(
      products
        .map((p) => p.marketplace_category)
        .filter((cat): cat is string => cat != null && cat.trim() !== '')
    )
  ).sort();

  const categories: CategoryHierarchy[] = level1Categories.map((level1) => {
    const level1Products = products.filter((p) => p.marketplace_category === level1);

    const level2Categories = Array.from(
      new Set(
        level1Products
          .map((p) => p.marketplace_subcategory)
          .filter((cat): cat is string => cat != null && cat.trim() !== '')
      )
    ).sort();

    const level2Stats = level2Categories.map((level2) => {
      const level2Products = level1Products.filter((p) => p.marketplace_subcategory === level2);

      const level3Categories = Array.from(
        new Set(
          level2Products
            .map((p) => p.marketplace_level_3_category)
            .filter((cat): cat is string => cat != null && cat.trim() !== '')
        )
      ).sort();

      return {
        name: level2,
        count: level2Products.length,
        level3Categories: level3Categories.map((level3) => ({
          name: level3,
          count: level2Products.filter((p) => p.marketplace_level_3_category === level3).length,
        })),
      };
    });

    return {
      level1,
      level2Categories: level2Stats,
      totalProducts: level1Products.length,
    };
  });

  return {
    categories,
    totalProducts: products.length,
  };
}

function jsonWithCategoryCache(
  body: { categories: CategoryHierarchy[]; totalProducts: number },
  totalTime: number,
  feed: string,
) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'CDN-Cache-Control': 'public, s-maxage=300',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
      'X-Response-Time': `${totalTime}ms`,
      'X-Marketplace-Feed': feed,
    },
  });
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const supabase = createPublicSupabaseClient();
    
    // Get listing type filter from query params
    const { searchParams } = new URL(request.url);
    const listingType = searchParams.get('listingType'); // 'store_inventory' | 'private_listing' | null

    let cardQuery = supabase
      .from('public_marketplace_cards')
      .select('marketplace_category, marketplace_subcategory, marketplace_level_3_category')
      .not('marketplace_category', 'is', null);

    if (listingType === 'store_inventory') {
      cardQuery = cardQuery
        .eq('listing_type', 'store_inventory')
        .eq('is_verified_bike_store', true);
    } else if (listingType === 'private_listing') {
      cardQuery = cardQuery.eq('listing_type', 'private_listing');
    }

    const { data: cardProducts, error: cardError } = await cardQuery;

    if (!cardError && cardProducts) {
      return jsonWithCategoryCache(
        buildCategoryHierarchy(cardProducts as MarketplaceCategoryRow[]),
        Date.now() - startTime,
        'public-cards',
      );
    }

    if (cardError && !hasMissingPublicCardFeedError(cardError)) {
      console.warn('Public card category feed failed, falling back:', cardError.message);
    }

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

    return jsonWithCategoryCache(
      buildCategoryHierarchy((products || []) as MarketplaceCategoryRow[]),
      Date.now() - startTime,
      'products-fallback',
    );
  } catch (error) {
    console.error('Unexpected error in categories API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}





/**
 * Individual Seller Profile API (Optimised)
 * 
 * Fetches public seller profile for individual sellers (not bicycle stores):
 * - Seller info (name, bio, profile photo, social links, location)
 * - Active listings grouped by category
 * - Sold listings grouped by category
 * - Stats (item count, sold count, follower count, member since)
 * - Follow status for current user
 * 
 * PERFORMANCE: All database queries run in parallel
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface SellerCategory {
  id: string;
  name: string;
  display_name: string;
  display_order: number;
  product_count: number;
  products: SellerProduct[];
}

export interface SellerProduct {
  id: string;
  description: string;
  display_name: string | null;
  price: number;
  primary_image_url: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  condition_rating: string | null;
  created_at: string;
  sold_at: string | null;
  listing_type: 'individual_listing';
}

export interface SellerProfile {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  bio: string;
  logo_url: string | null;
  location: string;
  social_links: {
    instagram?: string;
    facebook?: string;
    strava?: string;
    twitter?: string;
    website?: string;
  };
  stats: {
    total_items: number;
    sold_items: number;
    follower_count: number;
    following_count: number;
    member_since: string;
  };
  is_following: boolean;
  categories: SellerCategory[];
  sold_categories: SellerCategory[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sellerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { sellerId } = await params;

    if (!sellerId) {
      return NextResponse.json(
        { error: 'Seller ID is required' },
        { status: 400 }
      );
    }

    // Get current user (non-blocking - can be null)
    const userPromise = supabase.auth.getUser();

    // Fetch seller profile first (required for validation)
    const { data: sellerUser, error: sellerError } = await supabase
      .from('users')
      .select(`
        user_id,
        first_name,
        last_name,
        business_name,
        seller_display_name,
        bio,
        logo_url,
        address,
        social_links,
        account_type,
        bicycle_store,
        created_at
      `)
      .eq('user_id', sellerId)
      .single();

    if (sellerError || !sellerUser) {
      return NextResponse.json(
        { error: 'Seller not found' },
        { status: 404 }
      );
    }

    // If this is a verified bicycle store, redirect to store endpoint
    if (sellerUser.account_type === 'bicycle_store' && sellerUser.bicycle_store) {
      return NextResponse.json(
        { error: 'This is a bicycle store, use /api/marketplace/store endpoint', redirect: `/marketplace/store/${sellerId}` },
        { status: 400 }
      );
    }

    // Get current user result
    const { data: { user: currentUser } } = await userPromise;

    // Run ALL remaining queries in parallel for maximum performance
    const [
      followerResult,
      followingResult,
      followCheckResult,
      categoryOverridesResult,
      activeListingsResult,
      soldListingsResult,
    ] = await Promise.all([
      // Follower count
      supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', sellerId),
      
      // Following count
      supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', sellerId),
      
      // Check if current user is following (only if logged in)
      currentUser
        ? supabase
            .from('user_follows')
            .select('id')
            .eq('follower_id', currentUser.id)
            .eq('following_id', sellerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      
      // Category overrides
      supabase
        .from('seller_category_overrides')
        .select('*')
        .eq('user_id', sellerId),
      
      // Active listings (NOT sold) - minimal fields for performance
      supabase
        .from('products')
        .select('id, display_name, price, primary_image_url, marketplace_category, condition_rating, created_at, images')
        .eq('user_id', sellerId)
        .eq('is_active', true)
        .is('sold_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      
      // Sold listings - minimal fields for performance
      supabase
        .from('products')
        .select('id, display_name, price, primary_image_url, marketplace_category, condition_rating, created_at, sold_at, images')
        .eq('user_id', sellerId)
        .not('sold_at', 'is', null)
        .order('sold_at', { ascending: false })
        .limit(20),
    ]);

    const followerCount = followerResult.count || 0;
    const followingCount = followingResult.count || 0;
    const isFollowing = !!followCheckResult.data;
    
    const overridesMap = new Map(
      categoryOverridesResult.data?.map(o => [o.original_category, o]) || []
    );

    const activeListings = activeListingsResult.data || [];
    const soldListings = soldListingsResult.data || [];

    // Helper function to process listings into categories
    const processListings = (listings: any[]): SellerCategory[] => {
      const categoriesMap = new Map<string, SellerProduct[]>();
      
      listings.forEach((listing) => {
        const category = listing.marketplace_category || 'Other';
        if (!categoriesMap.has(category)) {
          categoriesMap.set(category, []);
        }
        
        // Handle image URLs - private listings may use cloudinary images in the images array
        let imageUrl = listing.primary_image_url;
        
        if (!imageUrl && Array.isArray(listing.images) && listing.images.length > 0) {
          const firstImage = listing.images[0];
          if (typeof firstImage === 'object') {
            imageUrl = firstImage.cloudinaryUrl || firstImage.url || firstImage.preview;
          } else if (typeof firstImage === 'string') {
            imageUrl = firstImage;
          }
        }
        
        categoriesMap.get(category)!.push({
          id: listing.id,
          description: listing.display_name || '',
          display_name: listing.display_name,
          price: parseFloat(listing.price) || 0,
          primary_image_url: imageUrl || '/placeholder-product.svg',
          marketplace_category: listing.marketplace_category,
          marketplace_subcategory: null,
          condition_rating: listing.condition_rating,
          created_at: listing.created_at,
          sold_at: listing.sold_at || null,
          listing_type: 'individual_listing',
        });
      });

      // Convert to array and apply overrides
      return Array.from(categoriesMap.entries())
        .filter(([categoryName]) => {
          const override = overridesMap.get(categoryName);
          return !override?.is_hidden;
        })
        .map(([categoryName, products], index) => {
          const override = overridesMap.get(categoryName);
          return {
            id: `category-${categoryName.toLowerCase().replace(/\s+/g, '-')}`,
            name: categoryName,
            display_name: override?.display_name || categoryName,
            display_order: override?.display_order ?? index,
            product_count: products.length,
            products,
          };
        })
        .sort((a, b) => a.display_order - b.display_order);
    };

    const categories = processListings(activeListings);
    const soldCategories = processListings(soldListings);

    // Build display name
    const displayName = sellerUser.seller_display_name 
      || sellerUser.business_name 
      || `${sellerUser.first_name} ${sellerUser.last_name}`.trim()
      || 'Anonymous Seller';

    // Build profile response
    const sellerProfile: SellerProfile = {
      id: sellerId,
      display_name: displayName,
      first_name: sellerUser.first_name || '',
      last_name: sellerUser.last_name || '',
      bio: sellerUser.bio || '',
      logo_url: sellerUser.logo_url || null,
      location: sellerUser.address || '',
      social_links: sellerUser.social_links || {},
      stats: {
        total_items: activeListings.length,
        sold_items: soldListings.length,
        follower_count: followerCount,
        following_count: followingCount,
        member_since: sellerUser.created_at,
      },
      is_following: isFollowing,
      categories,
      sold_categories: soldCategories,
    };

    // Return with cache headers for faster subsequent loads
    return NextResponse.json(
      { seller: sellerProfile },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('Error in GET /api/marketplace/seller/[sellerId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

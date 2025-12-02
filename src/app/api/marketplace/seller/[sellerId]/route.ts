/**
 * Individual Seller Profile API
 * 
 * Fetches public seller profile for individual sellers (not bicycle stores):
 * - Seller info (name, bio, profile photo, cover image, social links, location)
 * - Active listings grouped by category
 * - Category overrides for display names and ordering
 * - Stats (item count, member since)
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
  listing_type: 'individual_listing';
}

export interface SellerProfile {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  bio: string;
  logo_url: string | null;
  cover_image_url: string | null;
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
    member_since: string;
  };
  categories: SellerCategory[];
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

    console.log(`[SELLER API] Fetching seller profile ${sellerId}`);

    // Fetch seller profile
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
        cover_image_url,
        address,
        social_links,
        account_type,
        bicycle_store,
        created_at
      `)
      .eq('user_id', sellerId)
      .single();

    if (sellerError || !sellerUser) {
      console.log(`[SELLER API] Seller not found: ${sellerId}`);
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

    // Fetch category overrides for this seller
    const { data: categoryOverrides } = await supabase
      .from('seller_category_overrides')
      .select('*')
      .eq('user_id', sellerId);

    const overridesMap = new Map(
      categoryOverrides?.map(o => [o.original_category, o]) || []
    );

    // Fetch all active listings for this seller
    // listing_status can be: null (store inventory), 'active' (published), or 'draft' (unpublished)
    const { data: listings, error: listingsError } = await supabase
      .from('products')
      .select(`
        id,
        description,
        display_name,
        price,
        primary_image_url,
        marketplace_category,
        marketplace_subcategory,
        condition_rating,
        created_at,
        listing_type,
        images
      `)
      .eq('user_id', sellerId)
      .eq('is_active', true)
      .or('listing_status.is.null,listing_status.eq.active')
      .order('created_at', { ascending: false });

    if (listingsError) {
      console.error('[SELLER API] Error fetching listings:', listingsError);
    }

    // Group listings by marketplace_category
    const categoriesMap = new Map<string, SellerProduct[]>();
    
    (listings || []).forEach((listing) => {
      const category = listing.marketplace_category || 'Other';
      if (!categoriesMap.has(category)) {
        categoriesMap.set(category, []);
      }
      
      // Handle image URLs - private listings may use cloudinary images in the images array
      let imageUrl = listing.primary_image_url;
      
      if (!imageUrl && Array.isArray(listing.images) && listing.images.length > 0) {
        // Check for cloudinary URLs in images array
        const firstImage = listing.images[0];
        if (typeof firstImage === 'object') {
          imageUrl = firstImage.cloudinaryUrl || firstImage.url || firstImage.preview;
        } else if (typeof firstImage === 'string') {
          imageUrl = firstImage;
        }
      }
      
      categoriesMap.get(category)!.push({
        id: listing.id,
        description: listing.description,
        display_name: listing.display_name,
        price: parseFloat(listing.price) || 0,
        primary_image_url: imageUrl || '/placeholder-product.svg',
        marketplace_category: listing.marketplace_category,
        marketplace_subcategory: listing.marketplace_subcategory,
        condition_rating: listing.condition_rating,
        created_at: listing.created_at,
        listing_type: 'individual_listing',
      });
    });

    // Convert to array and apply overrides
    const categories: SellerCategory[] = Array.from(categoriesMap.entries())
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
      cover_image_url: sellerUser.cover_image_url || null,
      location: sellerUser.address || '',
      social_links: sellerUser.social_links || {},
      stats: {
        total_items: listings?.length || 0,
        member_since: sellerUser.created_at,
      },
      categories,
    };

    return NextResponse.json({ seller: sellerProfile });
  } catch (error) {
    console.error('Error in GET /api/marketplace/seller/[sellerId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


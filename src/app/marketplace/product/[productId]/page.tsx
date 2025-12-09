import * as React from "react";
import { notFound } from "next/navigation";
import { createClient } from '@/lib/supabase/server';
import { ProductPageClient } from "./product-page-client";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Product Page - Server Component with Parallel Data Fetching
// Fetches all data on server for optimal performance
// Uses ISR (Incremental Static Regeneration) for cached, fast loads
// ============================================================

export const revalidate = 0; // Disable caching for testing - change back to 60 for production

interface SellerInfo {
  id: string;
  name: string;
  logo_url: string | null;
  account_type: string | null;
}

// Helper function to fetch product data
async function fetchProduct(productId: string): Promise<MarketplaceProduct | null> {
  try {
    const supabase = await createClient();

    const { data: product, error: productError } = await supabase
      .from('products')
      .select(`
        id,
        description,
        display_name,
        price,
        marketplace_category,
        marketplace_subcategory,
        marketplace_level_3_category,
        qoh,
        model_year,
        created_at,
        user_id,
        canonical_product_id,
        use_custom_image,
        custom_image_url,
        images,
        listing_type,
        listing_source,
        listing_status,
        published_at,
        frame_size,
        frame_material,
        bike_type,
        groupset,
        wheel_size,
        suspension_type,
        bike_weight,
        color_primary,
        color_secondary,
        part_type_detail,
        compatibility_notes,
        material,
        weight,
        size,
        gender_fit,
        apparel_material,
        condition_rating,
        condition_details,
        wear_notes,
        usage_estimate,
        purchase_location,
        purchase_date,
        service_history,
        upgrades_modifications,
        reason_for_selling,
        is_negotiable,
        shipping_available,
        shipping_cost,
        pickup_location,
        included_accessories,
        seller_contact_preference,
        seller_phone,
        seller_email,
        users!user_id (
          business_name,
          logo_url,
          account_type
        ),
        canonical_products!canonical_product_id (
          id,
          product_images!canonical_product_id (
            storage_path,
            is_primary,
            variants,
            approval_status,
            is_downloaded
          )
        )
      `)
      .eq('id', productId)
      .or('listing_status.is.null,listing_status.eq.active')
      .single();

    if (productError || !product) {
      return null;
    }

    // ============================================================
    // PERFORMANCE OPTIMIZED: Images now cached in products.images
    // No extra queries needed - reduces load time by ~100ms!
    // ============================================================
    const user = (product.users as any);
    let primaryImageUrl: string | null = null;
    let allImages: string[] = [];
    
    // Priority 1: Use cached images from products.images JSONB (fastest!)
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const cachedImages = product.images as Array<{ 
        url?: string; 
        cardUrl?: string; 
        galleryUrl?: string; 
        detailUrl?: string; 
        isPrimary?: boolean; 
        order?: number;
        source?: string;
      }>;
      
      const primaryImage = cachedImages.find(img => img.isPrimary) || cachedImages[0];
      // Use galleryUrl for product pages (1200px landscape, padded - shows full product)
      primaryImageUrl = primaryImage?.galleryUrl || primaryImage?.detailUrl || primaryImage?.url || primaryImage?.cardUrl || null;
      
      allImages = cachedImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(img => img.galleryUrl || img.detailUrl || img.url || img.cardUrl)
        .filter((url): url is string => !!url && !url.startsWith('blob:'));
    } 
    // Priority 2: Custom image
    else if (product.use_custom_image && product.custom_image_url) {
      primaryImageUrl = product.custom_image_url;
      allImages = [product.custom_image_url];
    } 
    // Priority 3: Fallback to placeholder
    else {
      primaryImageUrl = '/placeholder-product.svg';
      allImages = ['/placeholder-product.svg'];
    }
    
    return {
      ...product,
      primary_image_url: primaryImageUrl,
      all_images: allImages,
      image_variants: null,
      store_name: user?.business_name || 'Unknown Store',
      store_logo_url: user?.logo_url || null,
      store_account_type: user?.account_type || null,
    };
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

// Helper function to fetch similar products - DIRECTLY from Supabase (no API call)
async function fetchSimilarProducts(productId: string): Promise<MarketplaceProduct[]> {
  try {
    const supabase = await createClient();
    
    // Get source product category
    const { data: sourceProduct } = await supabase
      .from('products')
      .select('marketplace_category, marketplace_subcategory')
      .eq('id', productId)
      .single();
    
    if (!sourceProduct?.marketplace_category) return [];
    
    // Fetch similar products from same category
    const { data: products } = await supabase
      .from('products')
      .select(`
        id, description, display_name, price, qoh, model_year, marketplace_category, marketplace_subcategory,
        marketplace_level_3_category, created_at, user_id, images,
        users!user_id (business_name, logo_url, account_type)
      `)
      .eq('marketplace_category', sourceProduct.marketplace_category)
      .eq('is_active', true)
      .neq('id', productId)
      .or('listing_status.is.null,listing_status.eq.active')
      .limit(12);
    
    if (!products) return [];
    
    return products.map((p: any) => ({
      id: p.id,
      description: p.description,
      display_name: p.display_name,
      price: p.price,
      marketplace_category: p.marketplace_category,
      marketplace_subcategory: p.marketplace_subcategory,
      marketplace_level_3_category: p.marketplace_level_3_category,
      qoh: p.qoh || 1,
      model_year: p.model_year || null,
      created_at: p.created_at,
      user_id: p.user_id,
      primary_image_url: p.images?.[0]?.cloudinaryUrl || p.images?.[0]?.url || null,
      card_url: p.images?.[0]?.cardUrl || null,
      store_name: p.users?.business_name || 'Unknown Seller',
      store_logo_url: p.users?.logo_url || null,
      store_account_type: p.users?.account_type || null,
    } as MarketplaceProduct));
  } catch (error) {
    console.error('Error fetching similar products:', error);
    return [];
  }
}

// Helper function to fetch seller products - DIRECTLY from Supabase (no API call)
async function fetchSellerProducts(productId: string): Promise<{ products: MarketplaceProduct[]; seller: SellerInfo | null }> {
  try {
    const supabase = await createClient();
    
    // Get seller ID from source product
    const { data: sourceProduct } = await supabase
      .from('products')
      .select('user_id')
      .eq('id', productId)
      .single();
    
    if (!sourceProduct?.user_id) return { products: [], seller: null };
    
    // Fetch seller info
    const { data: seller } = await supabase
      .from('users')
      .select('user_id, business_name, logo_url, account_type, seller_display_name, first_name, last_name')
      .eq('user_id', sourceProduct.user_id)
      .single();
    
    // Fetch seller's other products
    const { data: products } = await supabase
      .from('products')
      .select(`
        id, description, display_name, price, qoh, model_year, marketplace_category, marketplace_subcategory,
        created_at, user_id, images,
        users!user_id (business_name, logo_url, account_type)
      `)
      .eq('user_id', sourceProduct.user_id)
      .eq('is_active', true)
      .neq('id', productId)
      .or('listing_status.is.null,listing_status.eq.active')
      .is('sold_at', null)
      .order('created_at', { ascending: false })
      .limit(12);
    
    const sellerInfo = seller ? {
      id: seller.user_id,
      name: seller.seller_display_name || seller.business_name || 
            (seller.first_name && seller.last_name ? `${seller.first_name} ${seller.last_name}`.trim() : 'Unknown Seller'),
      logo_url: seller.logo_url || null,
      account_type: seller.account_type || null,
    } : null;
    
    const formattedProducts = (products || []).map((p: any) => ({
      id: p.id,
      description: p.description,
      display_name: p.display_name,
      price: p.price,
      marketplace_category: p.marketplace_category,
      marketplace_subcategory: p.marketplace_subcategory,
      qoh: p.qoh || 1,
      model_year: p.model_year || null,
      created_at: p.created_at,
      user_id: p.user_id,
      primary_image_url: p.images?.[0]?.cloudinaryUrl || p.images?.[0]?.url || null,
      card_url: p.images?.[0]?.cardUrl || null,
      store_name: p.users?.business_name || 'Unknown Seller',
      store_logo_url: p.users?.logo_url || null,
      store_account_type: p.users?.account_type || null,
    } as MarketplaceProduct));
    
    return {
      products: formattedProducts,
      seller: sellerInfo
    };
  } catch (error) {
    console.error('Error fetching seller products:', error);
    return { products: [], seller: null };
  }
}

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;

  // Fetch all data in parallel for maximum performance
  const [product, similarProducts, sellerData] = await Promise.all([
    fetchProduct(productId),
    fetchSimilarProducts(productId),
    fetchSellerProducts(productId),
  ]);

  // If product not found, show 404
  if (!product) {
    notFound();
  }

  // Pass all data to client component
  return (
    <ProductPageClient
      product={product}
      similarProducts={similarProducts}
      sellerProducts={sellerData.products}
      sellerInfo={sellerData.seller}
    />
  );
}

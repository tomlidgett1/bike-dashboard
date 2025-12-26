import * as React from "react";
import { notFound } from "next/navigation";
import { createClient } from '@/lib/supabase/server';
import { ProductPageClient } from "./product-page-client";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { getProductImages, toJsonbFormat } from "@/lib/services/product-images";

// ============================================================
// Product Page - Server Component with Parallel Data Fetching
// Fetches all data on server for optimal performance
// Uses ISR (Incremental Static Regeneration) for cached, fast loads
// ============================================================

// Use ISR - cache product pages for 60 seconds, then revalidate in background
// This dramatically improves load times for repeat visitors
export const revalidate = 60;

interface SellerInfo {
  id: string;
  name: string;
  logo_url: string | null;
  account_type: string | null;
}

// Helper function to fetch product data
// allowSoldProducts: When true, allows fetching products regardless of listing_status
// This is used when viewing purchased products from order history
async function fetchProduct(productId: string, allowSoldProducts: boolean = false): Promise<MarketplaceProduct | null> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('products')
      .select(`
        id,
        description,
        product_description,
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
        sold_at,
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
        seller_notes,
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
          name,
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
      .eq('id', productId);

    // Only filter by listing_status if not allowing sold products
    if (!allowSoldProducts) {
      query = query.or('listing_status.is.null,listing_status.eq.active');
    }

    const { data: product, error: productError } = await query.single();

    if (productError || !product) {
      return null;
    }

    // ============================================================
    // REFACTORED: Fetch images from product_images table (source of truth)
    // This replaces the JSONB approach for cleaner data model
    // ============================================================
    const user = (product.users as any);
    let primaryImageUrl: string | null = null;
    let allImages: string[] = [];
    let imagesForClient: Array<{
      id: string;
      url: string;
      cardUrl: string | null;
      galleryUrl: string | null;
      detailUrl: string | null;
      isPrimary: boolean;
      order: number;
    }> = [];
    
    // Fetch images from product_images table (NEW source of truth)
    const productImages = await getProductImages(supabase, productId, product.canonical_product_id);
    
    if (productImages.length > 0) {
      // Convert to JSONB format for backwards compatibility with client
      imagesForClient = toJsonbFormat(productImages) as any;
      
      const primaryImage = productImages.find(img => img.is_primary) || productImages[0];
      // Use galleryUrl for product pages (1200px landscape, padded - shows full product)
      primaryImageUrl = primaryImage?.gallery_url 
        || primaryImage?.detail_url 
        || primaryImage?.cloudinary_url 
        || primaryImage?.card_url 
        || null;
      
      allImages = productImages
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(img => img.gallery_url || img.detail_url || img.cloudinary_url || img.card_url)
        .filter((url): url is string => !!url && !url.startsWith('blob:'));
    }
    // Fallback to JSONB during transition
    else if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const cachedImages = product.images as Array<{ 
        url?: string; 
        cardUrl?: string; 
        galleryUrl?: string; 
        detailUrl?: string; 
        isPrimary?: boolean; 
        order?: number;
        source?: string;
      }>;
      
      imagesForClient = cachedImages as any;
      
      const primaryImage = cachedImages.find(img => img.isPrimary) || cachedImages[0];
      primaryImageUrl = primaryImage?.galleryUrl || primaryImage?.detailUrl || primaryImage?.url || primaryImage?.cardUrl || null;
      
      allImages = cachedImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(img => img.galleryUrl || img.detailUrl || img.url || img.cardUrl)
        .filter((url): url is string => !!url && !url.startsWith('blob:'));
    } 
    // Fallback: Custom image
    else if (product.use_custom_image && product.custom_image_url) {
      primaryImageUrl = product.custom_image_url;
      allImages = [product.custom_image_url];
    } 
    // Final fallback: Placeholder
    else {
      primaryImageUrl = '/placeholder-product.svg';
      allImages = ['/placeholder-product.svg'];
    }
    
    // Format seller name: For bike stores use business_name, for individuals use "FirstName L."
    let displayName = 'Unknown Seller';
    if (user?.account_type === 'bicycle_store' && user?.business_name) {
      displayName = user.business_name;
    } else if (user?.name) {
      const nameParts = user.name.trim().split(' ');
      if (nameParts.length >= 2) {
        // Format as "FirstName L."
        displayName = `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`;
      } else {
        // Just use the first name if only one name provided
        displayName = nameParts[0];
      }
    }

    return {
      ...product,
      primary_image_url: primaryImageUrl,
      all_images: allImages,
      images: imagesForClient.length > 0 ? imagesForClient : product.images,
      image_variants: null,
      store_name: displayName,
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
        users!user_id (business_name, name, logo_url, account_type)
      `)
      .eq('marketplace_category', sourceProduct.marketplace_category)
      .eq('is_active', true)
      .neq('id', productId)
      .or('listing_status.is.null,listing_status.eq.active')
      .limit(12);
    
    if (!products) return [];
    
    return products.map((p: any) => {
      // Format seller name: For bike stores use business_name, for individuals use "FirstName L."
      let displayName = 'Unknown Seller';
      if (p.users?.account_type === 'bicycle_store' && p.users?.business_name) {
        displayName = p.users.business_name;
      } else if (p.users?.name) {
        const nameParts = p.users.name.trim().split(' ');
        if (nameParts.length >= 2) {
          // Format as "FirstName L."
          displayName = `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`;
        } else {
          // Just use the first name if only one name provided
          displayName = nameParts[0];
        }
      }

      return {
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
        store_name: displayName,
        store_logo_url: p.users?.logo_url || null,
        store_account_type: p.users?.account_type || null,
      } as MarketplaceProduct;
    });
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
        users!user_id (business_name, name, logo_url, account_type)
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
    
    const formattedProducts = (products || []).map((p: any) => {
      // Format seller name: For bike stores use business_name, for individuals use "FirstName L."
      let displayName = 'Unknown Seller';
      if (p.users?.account_type === 'bicycle_store' && p.users?.business_name) {
        displayName = p.users.business_name;
      } else if (p.users?.name) {
        const nameParts = p.users.name.trim().split(' ');
        if (nameParts.length >= 2) {
          // Format as "FirstName L."
          displayName = `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`;
        } else {
          // Just use the first name if only one name provided
          displayName = nameParts[0];
        }
      }

      return {
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
        store_name: displayName,
        store_logo_url: p.users?.logo_url || null,
        store_account_type: p.users?.account_type || null,
      } as MarketplaceProduct;
    });
    
    return {
      products: formattedProducts,
      seller: sellerInfo
    };
  } catch (error) {
    console.error('Error fetching seller products:', error);
    return { products: [], seller: null };
  }
}

export default async function ProductPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ fromPurchase?: string; fromUpload?: string }>;
}) {
  const { productId } = await params;
  const { fromPurchase, fromUpload } = await searchParams;
  
  // Allow viewing sold products if coming from purchase history
  const allowSoldProducts = fromPurchase === 'true';

  // Fetch all data in parallel for maximum performance
  const [product, similarProducts, sellerData] = await Promise.all([
    fetchProduct(productId, allowSoldProducts),
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
      showUploadBanner={fromUpload === 'true'}
    />
  );
}

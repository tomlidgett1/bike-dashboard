import * as React from "react";
import { notFound } from "next/navigation";
import { createClient } from '@/lib/supabase/server';
import { ProductPageClient } from "./product-page-client";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Product Page - Server Component with Parallel Data Fetching
// Fetches all data on server for optimal performance
// ============================================================

export const dynamic = 'force-dynamic';

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

    // Fetch images from product_images table
    const { data: productImagesFromTable } = await supabase
      .from('product_images')
      .select(`
        id,
        cloudinary_url,
        card_url,
        thumbnail_url,
        detail_url,
        external_url,
        is_primary,
        sort_order,
        approval_status
      `)
      .eq('product_id', productId)
      .eq('approval_status', 'approved')
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true });

    let allProductImages = productImagesFromTable || [];
    if (allProductImages.length === 0 && product.canonical_product_id) {
      const { data: canonicalImages } = await supabase
        .from('product_images')
        .select(`
          id,
          cloudinary_url,
          card_url,
          thumbnail_url,
          detail_url,
          external_url,
          is_primary,
          sort_order,
          approval_status
        `)
        .eq('canonical_product_id', product.canonical_product_id)
        .eq('approval_status', 'approved')
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true });
      
      allProductImages = canonicalImages || [];
    }

    const user = (product.users as any);
    let primaryImageUrl: string | null = null;
    let allImages: string[] = [];
    
    if (allProductImages.length > 0) {
      const primaryImage = allProductImages.find((img: any) => img.is_primary) || allProductImages[0];
      primaryImageUrl = primaryImage?.detail_url || primaryImage?.cloudinary_url || primaryImage?.card_url || null;
      
      allImages = allProductImages
        .map((img: any) => img.detail_url || img.cloudinary_url || img.card_url)
        .filter((url: string | null) => url && !url.startsWith('blob:'));
    } else if (product.use_custom_image && product.custom_image_url) {
      primaryImageUrl = product.custom_image_url;
      allImages = [product.custom_image_url];
    } else if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const manualImages = product.images as Array<{ url: string; cardUrl?: string; detailUrl?: string; isPrimary?: boolean; order?: number }>;
      const primaryManualImage = manualImages.find(img => img.isPrimary) || manualImages[0];
      primaryImageUrl = primaryManualImage?.detailUrl || primaryManualImage?.url;
      
      allImages = manualImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(img => img.detailUrl || img.url)
        .filter(url => url && !url.startsWith('blob:'));
    } else {
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

// Helper function to fetch similar products
async function fetchSimilarProducts(productId: string): Promise<MarketplaceProduct[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/marketplace/products/${productId}/similar?limit=12`, {
      next: { revalidate: 300 } // Cache for 5 minutes
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.products || [];
  } catch (error) {
    console.error('Error fetching similar products:', error);
    return [];
  }
}

// Helper function to fetch seller products
async function fetchSellerProducts(productId: string): Promise<{ products: MarketplaceProduct[]; seller: SellerInfo | null }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/marketplace/products/${productId}/seller-products?limit=12`, {
      next: { revalidate: 300 } // Cache for 5 minutes
    });
    
    if (!response.ok) return { products: [], seller: null };
    
    const data = await response.json();
    return {
      products: data.products || [],
      seller: data.seller || null
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

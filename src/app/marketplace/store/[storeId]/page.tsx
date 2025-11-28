import * as React from "react";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Image from "next/image";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { StoreProfileClient } from "@/components/marketplace/store-profile-client";

// ============================================================
// Store Profile Page - React Server Component
// Ultra-fast with ISR, RSC, and aggressive caching
// ============================================================

// Enable ISR - regenerate every 5 minutes
export const revalidate = 300;

// Generate metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ storeId: string }> }): Promise<Metadata> {
  const { storeId } = await params;
  const supabase = await createClient();

  const { data: store } = await supabase
    .from('users')
    .select('business_name, store_type, logo_url')
    .eq('user_id', storeId)
    .single();

  if (!store) {
    return {
      title: 'Store Not Found',
    };
  }

  const storeName = store.business_name && store.business_name.trim() !== '' 
    ? store.business_name 
    : 'Bike Store';

  return {
    title: `${storeName} | Bike Marketplace`,
    description: `Shop ${storeName} - ${store.store_type} bike store on the marketplace`,
    openGraph: {
      title: `${storeName}`,
      description: `Shop ${storeName} - ${store.store_type} bike store`,
      images: store.logo_url ? [store.logo_url] : [],
    },
  };
}

// Generate static params for top stores (optional - for even better performance)
export async function generateStaticParams() {
  try {
    const supabase = await createClient();
    
    // Pre-render top 100 stores
    const { data: stores } = await supabase
      .from('users')
      .select('user_id')
      .limit(100);
    
    if (!stores) return [];
    
    return stores.map((store) => ({
      storeId: store.user_id,
    }));
  } catch (error) {
    console.error('Error generating static params:', error);
    return [];
  }
}

interface StoreProfilePageProps {
  params: Promise<{ storeId: string }>;
}

async function getStoreData(storeId: string) {
  const supabase = await createClient();

  // Fetch store details
  const { data: store, error: storeError } = await supabase
    .from('users')
    .select('user_id, business_name, store_type, logo_url, created_at')
    .eq('user_id', storeId)
    .single();

  if (storeError || !store) {
    return null;
  }

  // Fetch product count
  const { count: productCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', storeId)
    .eq('is_active', true);

  // Fetch category stats for this store
  const { data: products } = await supabase
    .from('products')
    .select('marketplace_category, marketplace_subcategory')
    .eq('user_id', storeId)
    .eq('is_active', true);

  // Build category counts
  const categories = new Map<string, number>();
  products?.forEach((product) => {
    if (product.marketplace_category) {
      const count = categories.get(product.marketplace_category) || 0;
      categories.set(product.marketplace_category, count + 1);
    }
  });

  return {
    id: store.user_id,
    store_name: store.business_name && store.business_name.trim() !== '' 
      ? store.business_name 
      : 'Bike Store',
    store_type: store.store_type && store.store_type.trim() !== '' 
      ? store.store_type 
      : 'Retail',
    logo_url: store.logo_url,
    product_count: productCount || 0,
    joined_date: store.created_at,
    categories: Array.from(categories.entries()).map(([category, count]) => ({
      category,
      count,
    })),
  };
}

export default async function StoreProfilePage({ params }: StoreProfilePageProps) {
  const { storeId } = await params;
  
  // Fetch store data server-side for optimal performance
  const storeData = await getStoreData(storeId);

  if (!storeData) {
    notFound();
  }

  return (
    <MarketplaceLayout>
      <StoreProfileClient
        storeId={storeData.id}
        storeName={storeData.store_name}
        storeType={storeData.store_type}
        logoUrl={storeData.logo_url}
        productCount={storeData.product_count}
        joinedDate={storeData.joined_date}
        categories={storeData.categories}
      />
    </MarketplaceLayout>
  );
}


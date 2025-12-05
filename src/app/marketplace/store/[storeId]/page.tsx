"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useParams } from "next/navigation";
import { Loader2, User, Package } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductCarousel } from "@/components/marketplace/store-profile/product-carousel";
import { SellerHeader, SellerCategories } from "@/components/marketplace/seller-profile";
import { useAuth } from "@/components/providers/auth-provider";
import type { StoreProfile } from "@/lib/types/store";
import type { SellerProfile, SellerCategory } from "@/app/api/marketplace/seller/[sellerId]/route";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Unified Store/Seller Profile Page
// Public-facing profile page that handles both:
// - Bicycle stores (verified businesses)
// - Individual sellers
// Both use the same unified layout with carousels
// ============================================================

type ProfileType = 'store' | 'seller' | null;

// Convert store categories to seller categories format for unified display
function convertStoreCategoriesToSellerFormat(
  categories: StoreProfile['categories']
): SellerCategory[] {
  return categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    display_name: cat.name,
    display_order: cat.display_order,
    product_count: cat.product_count,
    products: cat.products.map(p => ({
      id: p.id,
      description: p.description,
      display_name: p.display_name || null,
      price: p.price,
      primary_image_url: p.primary_image_url,
      marketplace_category: p.marketplace_category || null,
      marketplace_subcategory: p.marketplace_subcategory || null,
      condition_rating: null,
      created_at: p.created_at || new Date().toISOString(),
      sold_at: null,
      listing_type: 'individual_listing' as const,
    })),
  }));
}

// Convert seller products to marketplace products format for carousels
function convertSellerProductsToMarketplace(
  categories: SellerCategory[],
  sellerId: string,
  displayName: string,
  logoUrl: string | null
): { name: string; products: MarketplaceProduct[] }[] {
  return categories.map(cat => ({
    name: cat.display_name || cat.name,
    products: cat.products.map(p => ({
      id: p.id,
      description: p.description,
      display_name: p.display_name ?? undefined,
      price: p.price,
      marketplace_category: p.marketplace_category ?? '',
      marketplace_subcategory: p.marketplace_subcategory ?? '',
      primary_image_url: p.primary_image_url,
      image_variants: null,
      image_formats: null,
      store_name: displayName,
      store_logo_url: logoUrl,
      store_id: sellerId,
      category: p.marketplace_category,
      qoh: 1,
      model_year: null,
      created_at: p.created_at,
      user_id: sellerId,
      listing_type: 'private_listing' as const,
      condition_rating: p.condition_rating as MarketplaceProduct['condition_rating'],
    })),
  }));
}

export default function StoreProfilePage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const { user } = useAuth();

  const [profileType, setProfileType] = React.useState<ProfileType>(null);
  const [store, setStore] = React.useState<StoreProfile | null>(null);
  const [seller, setSeller] = React.useState<SellerProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [selectedTab, setSelectedTab] = React.useState<'for-sale' | 'sold'>('for-sale');

  // Check if viewing own profile
  const isOwnProfile = user?.id === storeId;

  // Fetch profile - try store and seller in parallel for faster loading
  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch both store and seller APIs in parallel
        const [storeResponse, sellerResponse] = await Promise.all([
          fetch(`/api/marketplace/store/${storeId}`),
          fetch(`/api/marketplace/seller/${storeId}`),
        ]);

        // Check if it's a bicycle store
        if (storeResponse.ok) {
          const data = await storeResponse.json();
          setStore(data.store);
          setProfileType('store');
          return;
        }

        // Check if it's an individual seller
        if (sellerResponse.ok) {
          const data = await sellerResponse.json();
          setSeller(data.seller);
          setProfileType('seller');
          return;
        }

        // Neither store nor seller found
        setError('Profile not found');
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    if (storeId) {
      fetchProfile();
    }
  }, [storeId]);

  // Loading state
  if (loading) {
    return (
      <>
        <MarketplaceHeader />
        <MarketplaceLayout showFooter={false}>
          <div className="flex items-center justify-center min-h-[60vh] pt-20">
            <div className="text-center">
              <Loader2 className="h-12 w-12 text-gray-400 animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-600">Loading profile...</p>
            </div>
          </div>
        </MarketplaceLayout>
      </>
    );
  }

  // Error state
  if (error || (!store && !seller)) {
    return (
      <>
        <MarketplaceHeader />
        <MarketplaceLayout showFooter={false}>
          <div className="flex items-center justify-center min-h-[60vh] pt-20">
            <div className="text-center">
              <div className="rounded-full bg-gray-100 p-6 mb-4 inline-block">
                <User className="h-12 w-12 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {error || 'Profile not found'}
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                The profile you're looking for doesn't exist or is no longer available.
              </p>
              <a
                href="/marketplace"
                className="text-sm text-gray-900 hover:text-gray-700 font-medium"
              >
                Back to marketplace
              </a>
            </div>
          </div>
        </MarketplaceLayout>
      </>
    );
  }

  // ============================================================
  // UNIFIED PROFILE LAYOUT
  // Works for both bicycle stores and individual sellers
  // ============================================================

  // Prepare unified data for display
  let unifiedProfile: SellerProfile;
  let categories: SellerCategory[];
  let soldCategories: SellerCategory[] = [];
  let categoryCarousels: { name: string; products: MarketplaceProduct[] }[] = [];

  if (profileType === 'store' && store) {
    // Convert store to unified format
    categories = convertStoreCategoriesToSellerFormat(store.categories);
    
    // Create unified profile from store data
    unifiedProfile = {
      id: store.id,
      display_name: store.store_name,
      first_name: '',
      last_name: '',
      bio: store.store_type || '',
      logo_url: store.logo_url,
      location: store.address || '',
      social_links: {},
      stats: {
        total_items: store.categories.reduce((sum, cat) => sum + cat.product_count, 0),
        sold_items: 0,
        follower_count: 0,
        following_count: 0,
        member_since: new Date().toISOString(),
      },
      is_following: false,
      categories,
      sold_categories: [],
    };

    // For stores, use categories directly for carousels
    categoryCarousels = store.categories.map(cat => ({
      name: cat.name,
      products: cat.products,
    }));
  } else if (profileType === 'seller' && seller) {
    unifiedProfile = seller;
    categories = seller.categories;
    soldCategories = seller.sold_categories;
    
    // Convert seller categories for carousel display
    categoryCarousels = convertSellerProductsToMarketplace(
      selectedTab === 'for-sale' ? seller.categories : seller.sold_categories,
      seller.id,
      seller.display_name,
      seller.logo_url
    );
  } else {
    return null;
  }

  // Get current categories based on selected tab (for individual sellers)
  const currentCategories = profileType === 'seller' 
    ? (selectedTab === 'for-sale' ? categories : soldCategories)
    : categories;

  // Filter carousels based on selected category
  const displayedCarousels = selectedCategory
    ? categoryCarousels.filter(c => 
        c.name.toLowerCase().replace(/\s+/g, '-') === selectedCategory.toLowerCase().replace(/\s+/g, '-') ||
        `category-${c.name.toLowerCase().replace(/\s+/g, '-')}` === selectedCategory
      )
    : categoryCarousels;

  // Check if there are any products
  const hasProducts = displayedCarousels.some(c => c.products.length > 0);

  return (
    <>
      <MarketplaceHeader />
      <MarketplaceLayout showFooter={false}>
        <div className="pt-16 min-h-screen bg-gray-50">
          {/* Unified Header - Works for both stores and sellers */}
          <SellerHeader 
            seller={unifiedProfile} 
            isOwnProfile={isOwnProfile}
            onEditClick={() => {
              window.location.href = profileType === 'store' 
                ? '/settings/store' 
                : '/marketplace/settings';
            }}
          />

          {/* Category Tabs (For Sale/Sold) - Only for individual sellers */}
          {profileType === 'seller' && (
            <SellerCategories
              categories={categories}
              soldCategories={soldCategories}
              selectedTab={selectedTab}
              selectedCategory={selectedCategory}
              onTabSelect={(tab) => {
                setSelectedTab(tab);
                setSelectedCategory(null);
              }}
              onCategorySelect={setSelectedCategory}
            />
          )}

          {/* Category Pills - For stores (no For Sale/Sold tabs) */}
          {profileType === 'store' && categories.length > 0 && (
            <div className="bg-white border-b border-gray-100 sticky top-16 z-30">
              <div className="max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8">
                <div className="py-2.5 sm:py-3">
                  <div className="relative -mx-3 sm:mx-0">
                    {/* Fade gradient at the end on mobile */}
                    <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none z-10 sm:hidden" />
                    
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide px-3 sm:px-0 snap-x snap-mandatory sm:snap-none">
                      {/* All Items */}
                      <button
                        onClick={() => setSelectedCategory(null)}
                        className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 snap-start ${
                          selectedCategory === null
                            ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                            : "text-gray-600 bg-gray-100 hover:bg-gray-200"
                        }`}
                      >
                        <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span>All Products</span>
                      </button>

                      {/* Category Pills */}
                      {categories.map((category) => (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 snap-start ${
                            selectedCategory === category.id
                              ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                              : "text-gray-600 bg-gray-100 hover:bg-gray-200"
                          }`}
                        >
                          <span>{category.display_name}</span>
                          <span className="text-gray-500">({category.product_count})</span>
                        </button>
                      ))}
                      {/* Spacer for mobile scroll end */}
                      <div className="w-3 flex-shrink-0 sm:hidden" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Products by Category - Full Width Carousels */}
          <div className="max-w-[1920px] mx-auto sm:px-6 lg:px-8 py-4 sm:py-6">
            {hasProducts ? (
              <div className="space-y-3 sm:space-y-4">
                {displayedCarousels.map((carousel, index) => (
                  carousel.products.length > 0 && (
                    <ProductCarousel
                      key={`${carousel.name}-${index}`}
                      categoryName={carousel.name}
                      products={carousel.products}
                    />
                  )
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-16 sm:py-24 px-4">
                <div className="text-center">
                  <div className="rounded-full bg-gray-100 p-5 sm:p-6 mb-3 sm:mb-4 inline-block">
                    <Package className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    {profileType === 'seller' && selectedTab === 'sold'
                      ? 'No sold items yet'
                      : 'No products available'
                    }
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 max-w-xs mx-auto">
                    {profileType === 'seller' && selectedTab === 'sold'
                      ? "This seller hasn't sold any items yet."
                      : isOwnProfile
                        ? "You haven't listed any products yet."
                        : "This profile doesn't have any products listed."
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </MarketplaceLayout>
    </>
  );
}

"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Loader2, Store as StoreIcon, User } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { StoreHeader } from "@/components/marketplace/store-profile/store-header";
import { ContactModal } from "@/components/marketplace/store-profile/contact-modal";
import { ServicesSection } from "@/components/marketplace/store-profile/services-section";
import { ProductCarousel } from "@/components/marketplace/store-profile/product-carousel";
import { StoreSearchBar } from "@/components/marketplace/store-search-bar";
import { SellerHeader, SellerCategories, SellerProductGrid } from "@/components/marketplace/seller-profile";
import { useAuth } from "@/components/providers/auth-provider";
import type { StoreProfile } from "@/lib/types/store";
import type { SellerProfile } from "@/app/api/marketplace/seller/[sellerId]/route";

// ============================================================
// Store/Seller Profile Page
// Public-facing profile page that handles both:
// - Bicycle stores (verified businesses)
// - Individual sellers (Depop-style profile)
// ============================================================

type ProfileType = 'store' | 'seller' | null;

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
  const [isContactModalOpen, setIsContactModalOpen] = React.useState(false);

  // Check if viewing own profile
  const isOwnProfile = user?.id === storeId;

  // Fetch profile - try store first, then seller
  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        // First try to fetch as a bicycle store
        const storeResponse = await fetch(`/api/marketplace/store/${storeId}`);

        if (storeResponse.ok) {
          const data = await storeResponse.json();
          setStore(data.store);
          setProfileType('store');
          return;
        }

        // If not a store (404), try as individual seller
        if (storeResponse.status === 404) {
          const sellerResponse = await fetch(`/api/marketplace/seller/${storeId}`);

          if (sellerResponse.ok) {
            const data = await sellerResponse.json();
            setSeller(data.seller);
            setProfileType('seller');
            return;
          }

          // Neither store nor seller found
          setError('Profile not found');
          return;
        }

        // Other error
        setError('Failed to load profile');
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
  // INDIVIDUAL SELLER PROFILE (Depop-style)
  // ============================================================
  if (profileType === 'seller' && seller) {
    return (
      <>
        <MarketplaceHeader />
        <MarketplaceLayout showFooter={false}>
          <div className="pt-16 min-h-screen bg-gray-50">
            {/* Seller Header */}
            <SellerHeader 
              seller={seller} 
              isOwnProfile={isOwnProfile}
              onEditClick={() => {
                window.location.href = '/marketplace/settings';
              }}
            />

            {/* Category Pills */}
            <SellerCategories
              categories={seller.categories}
              selectedCategory={selectedCategory}
              onCategorySelect={setSelectedCategory}
            />

            {/* Product Grid */}
            <SellerProductGrid
              categories={seller.categories}
              selectedCategory={selectedCategory}
            />
          </div>
        </MarketplaceLayout>
      </>
    );
  }

  // ============================================================
  // BICYCLE STORE PROFILE (Original design)
  // ============================================================
  if (profileType === 'store' && store) {
    // Filter categories based on selection
    const displayedCategories = selectedCategory
      ? store.categories.filter((cat) => cat.id === selectedCategory)
      : store.categories;

    return (
      <>
        <MarketplaceHeader />
        <MarketplaceLayout showFooter={false}>
          {/* Store Header - Add top padding to account for fixed header */}
          <div className="pt-16">
            <StoreHeader
              storeName={store.store_name}
              storeType={store.store_type}
              logoUrl={store.logo_url}
              categories={store.categories}
              selectedCategory={selectedCategory}
              onCategorySelect={setSelectedCategory}
              onContactClick={() => setIsContactModalOpen(true)}
            />
          </div>

          {/* Main Content */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            {/* Search Bar - Instant search with dropdown */}
            <div className="mb-6">
              <StoreSearchBar 
                storeId={storeId}
                storeName={store.store_name}
              />
            </div>

            {/* Services Section */}
            {store.services.length > 0 && <ServicesSection services={store.services} />}

            {/* Products by Category */}
            {displayedCategories.length > 0 ? (
              <div className="space-y-2">
                {displayedCategories.map((category) => (
                  <ProductCarousel
                    key={category.id}
                    categoryName={category.name}
                    products={category.products}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-24">
                <div className="text-center">
                  <div className="rounded-full bg-gray-100 p-6 mb-4 inline-block">
                    <StoreIcon className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No products available
                  </h3>
                  <p className="text-sm text-gray-600">
                    This store hasn't added any products yet.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Contact Modal */}
          <ContactModal
            isOpen={isContactModalOpen}
            onClose={() => setIsContactModalOpen(false)}
            storeName={store.store_name}
            phone={store.phone}
            address={store.address}
            openingHours={store.opening_hours}
          />
        </MarketplaceLayout>
      </>
    );
  }

  // Fallback (shouldn't reach here)
  return null;
}

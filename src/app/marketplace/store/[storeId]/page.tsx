"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Store as StoreIcon } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { StoreHeader } from "@/components/marketplace/store-profile/store-header";
import { ContactModal } from "@/components/marketplace/store-profile/contact-modal";
import { ServicesSection } from "@/components/marketplace/store-profile/services-section";
import { ProductCarousel } from "@/components/marketplace/store-profile/product-carousel";
import { StoreSearchBar } from "@/components/marketplace/store-search-bar";
import type { StoreProfile } from "@/lib/types/store";

// ============================================================
// Store Profile Page
// Public-facing store profile with products and services
// ============================================================

export default function StoreProfilePage() {
  const params = useParams();
  const storeId = params.storeId as string;

  const [store, setStore] = React.useState<StoreProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Fetch store profile
  const fetchStore = React.useCallback(async (search?: string) => {
    try {
      setLoading(true);
      setError(null);

      const url = search 
        ? `/api/marketplace/store/${storeId}?search=${encodeURIComponent(search)}`
        : `/api/marketplace/store/${storeId}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Store not found');
        } else {
          setError('Failed to load store profile');
        }
        return;
      }

      const data = await response.json();
      setStore(data.store);
    } catch (err) {
      console.error('Error fetching store:', err);
      setError('Failed to load store profile');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  // Initial fetch
  React.useEffect(() => {
    if (storeId) {
      fetchStore();
    }
  }, [storeId, fetchStore]);

  // Refetch when search query changes
  React.useEffect(() => {
    if (storeId && searchQuery) {
      fetchStore(searchQuery);
    } else if (storeId && !searchQuery) {
      // Clear search - refetch all products
      fetchStore();
    }
  }, [searchQuery, storeId, fetchStore]);

  // Handle search query change
  const handleSearchChange = React.useCallback((query: string) => {
    setSearchQuery(query);
    // Reset category filter when searching
    if (query) {
      setSelectedCategory(null);
    }
  }, []);

  // Loading state
  if (loading) {
    return (
      <>
        <MarketplaceHeader />
        <MarketplaceLayout showFooter={false}>
          <div className="flex items-center justify-center min-h-[60vh] pt-20">
            <div className="text-center">
              <Loader2 className="h-12 w-12 text-gray-400 animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-600">Loading store...</p>
            </div>
          </div>
        </MarketplaceLayout>
      </>
    );
  }

  // Error state
  if (error || !store) {
    return (
      <>
        <MarketplaceHeader />
        <MarketplaceLayout showFooter={false}>
          <div className="flex items-center justify-center min-h-[60vh] pt-20">
            <div className="text-center">
              <div className="rounded-full bg-gray-100 p-6 mb-4 inline-block">
                <StoreIcon className="h-12 w-12 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {error || 'Store not found'}
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                The store you're looking for doesn't exist or is no longer available.
              </p>
              <a
                href="/marketplace?view=stores"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Browse all stores
              </a>
            </div>
          </div>
        </MarketplaceLayout>
      </>
    );
  }

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
        {/* Search Bar - Enterprise level search within store */}
        <div className="mb-6">
          <StoreSearchBar 
            onSearchChange={handleSearchChange}
            placeholder={`Search ${store.store_name}'s inventory...`}
          />
          {searchQuery && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {displayedCategories.reduce((acc, cat) => acc + cat.products.length, 0)} results for "{searchQuery}"
              </p>
              <button
                onClick={() => setSearchQuery("")}
                className="text-sm text-gray-600 hover:text-gray-900 underline"
              >
                Clear search
              </button>
            </div>
          )}
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
                {searchQuery ? `No results for "${searchQuery}"` : "No products available"}
              </h3>
              <p className="text-sm text-gray-600">
                {searchQuery 
                  ? "Try a different search term or clear your search to see all products."
                  : "This store hasn't added any products yet."}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-4 text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Clear search
                </button>
              )}
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


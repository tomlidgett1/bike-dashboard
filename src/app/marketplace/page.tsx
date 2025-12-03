"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, LogIn, Heart, Package, X, Search, Store as StoreIcon } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductCard, ProductCardSkeleton } from "@/components/marketplace/product-card";
import { ViewModePills, ViewMode } from "@/components/marketplace/view-mode-pills";
import { ListingTypeFilter, ListingTypeFilter as ListingTypeFilterType } from "@/components/marketplace/listing-type-filter";
import { CascadingCategoryFilter } from "@/components/marketplace/cascading-category-filter";
import { StoresGrid } from "@/components/marketplace/stores-grid";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useInteractionTracker } from "@/lib/tracking/interaction-tracker";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { useMarketplaceData, useCategoryCounts } from "@/lib/hooks/use-marketplace-data";

// ============================================================
// Marketplace Page - Discovery-Focused Homepage
// Default view: All Products with All Listings filter
// Can also show stores or individual sellers
// ============================================================

interface Store {
  id: string;
  store_name: string;
  store_type: string;
  logo_url: string | null;
  product_count: number;
  joined_date: string;
}

// Force dynamic rendering to avoid useSearchParams SSR issues
export const dynamic = 'force-dynamic'

function MarketplacePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const tracker = useInteractionTracker(user?.id);

  // Detect if we're in stores or sellers view from URL
  const urlView = searchParams.get('view');
  const isStoresView = urlView === 'stores';
  const isSellersView = urlView === 'sellers';

  // View mode state (trending, for-you, all) - only for products view
  // Default to 'all' products for fastest initial load
  const [viewMode, setViewMode] = React.useState<ViewMode>(
    (!isStoresView && !isSellersView && urlView as ViewMode) || 'all'
  );

  // Stores state
  const [stores, setStores] = React.useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = React.useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = React.useState<string | null>(
    searchParams.get('search') || null
  );

  // Category filter state (3 levels)
  const [selectedLevel1, setSelectedLevel1] = React.useState<string | null>(
    searchParams.get('level1') || null
  );
  const [selectedLevel2, setSelectedLevel2] = React.useState<string | null>(
    searchParams.get('level2') || null
  );
  const [selectedLevel3, setSelectedLevel3] = React.useState<string | null>(
    searchParams.get('level3') || null
  );

  // Listing type filter state (default to all listings)
  const [listingTypeFilter, setListingTypeFilter] = React.useState<ListingTypeFilterType>('all');

  // Products state (for pagination accumulation)
  const [accumulatedProducts, setAccumulatedProducts] = React.useState<MarketplaceProduct[]>([]);
  const [currentPage, setCurrentPage] = React.useState(1);

  // Track filter changes to know when to reset
  const filterKey = React.useMemo(() => 
    `${viewMode}-${listingTypeFilter}-${selectedLevel1}-${selectedLevel2}-${selectedLevel3}-${searchQuery}`,
    [viewMode, listingTypeFilter, selectedLevel1, selectedLevel2, selectedLevel3, searchQuery]
  );
  const prevFilterKeyRef = React.useRef(filterKey);
  const processedDataRef = React.useRef<Set<string>>(new Set());

  // Create stable params object
  const marketplaceParams = React.useMemo(() => ({
    viewMode,
    page: currentPage,
    pageSize: 50,
    level1: selectedLevel1,
    level2: selectedLevel2,
    level3: selectedLevel3,
    search: searchQuery,
    // Add listing type filtering
    listingType: listingTypeFilter === 'stores' ? 'store_inventory' as const : 
                 listingTypeFilter === 'individuals' ? 'private_listing' as const : undefined,
  }), [viewMode, currentPage, selectedLevel1, selectedLevel2, selectedLevel3, searchQuery, listingTypeFilter]);

  // Use SWR for products data with intelligent caching
  const { 
    products: fetchedProducts, 
    pagination, 
    isLoading, 
    isValidating 
  } = useMarketplaceData(
    marketplaceParams,
    {
      enabled: !isStoresView && !isSellersView,
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );

  // Use SWR for category counts
  const { counts: categoryCounts } = useCategoryCounts();

  // Handle filter changes and product accumulation
  // This effect ONLY handles data population, NOT filter resets (those are done in handlers)
  React.useEffect(() => {
    // Check if filters changed
    const filtersChanged = filterKey !== prevFilterKeyRef.current;
    
    if (filtersChanged) {
      // Filters changed - update tracking ref
      prevFilterKeyRef.current = filterKey;
      
      // IMPORTANT: Don't populate products here if we're validating
      // The handler already cleared products, wait for fresh data
      // SWR's keepPreviousData means fetchedProducts might be stale
      if (!isValidating && fetchedProducts.length > 0) {
        // Only use data if we're NOT currently fetching new data
        // This ensures we don't accidentally show stale data
        setAccumulatedProducts(fetchedProducts);
        processedDataRef.current = new Set(fetchedProducts.map(p => p.id));
      }
      // If isValidating is true, products stay empty (cleared by handler)
      // and loading state will be shown
    } else if (fetchedProducts.length > 0 && !isValidating) {
      // Same filter, not validating - check if we have genuinely new data
      const hasNewData = fetchedProducts.some(p => !processedDataRef.current.has(p.id));
      
      // Also handle the case where we cleared products waiting for new data
      const needsInitialData = accumulatedProducts.length === 0 && processedDataRef.current.size === 0;
      
      if (hasNewData || needsInitialData) {
        if (currentPage === 1) {
          setAccumulatedProducts(fetchedProducts);
          processedDataRef.current = new Set(fetchedProducts.map(p => p.id));
        } else {
          setAccumulatedProducts(prev => {
            // Only add products we haven't seen before
            const newProducts = fetchedProducts.filter(
              p => !processedDataRef.current.has(p.id)
            );
            return [...prev, ...newProducts];
          });
          // Mark these products as processed
          fetchedProducts.forEach(p => processedDataRef.current.add(p.id));
        }
      }
    }
  }, [fetchedProducts, currentPage, filterKey, accumulatedProducts.length, isValidating]);

  // Derive display state
  const products = accumulatedProducts;
  // Show loading state when:
  // 1. Initial loading (isLoading is true), OR
  // 2. On page 1 with no products while validating (filter just changed)
  const loading = (isLoading && currentPage === 1) || 
                  (currentPage === 1 && accumulatedProducts.length === 0 && isValidating);
  const hasMore = pagination?.hasMore || false;
  const totalCount = pagination?.total || 0;

  // Fetch stores when in stores view
  React.useEffect(() => {
    if (isStoresView) {
      const fetchStores = async () => {
        setStoresLoading(true);
        try {
          const response = await fetch('/api/marketplace/stores');
          if (response.ok) {
            const data = await response.json();
            setStores(data.stores || []);
          }
        } catch (error) {
          console.error('[Marketplace] Error fetching stores:', error);
        } finally {
          setStoresLoading(false);
        }
      };
      fetchStores();
    }
  }, [isStoresView]);

  // Update URL when filters change
  React.useEffect(() => {
    const params = new URLSearchParams();
    
    // Handle stores/sellers view
    if (isStoresView) {
      params.set('view', 'stores');
    } else if (isSellersView) {
      params.set('view', 'sellers');
    } else {
      // Handle product view modes
      if (viewMode !== 'trending') params.set('view', viewMode);
      if (selectedLevel1) params.set('level1', selectedLevel1);
      if (selectedLevel2) params.set('level2', selectedLevel2);
      if (selectedLevel3) params.set('level3', selectedLevel3);
      if (searchQuery) params.set('search', searchQuery);
    }

    const newUrl = params.toString()
      ? `/marketplace?${params.toString()}`
      : '/marketplace';

    router.replace(newUrl, { scroll: false });
  }, [viewMode, selectedLevel1, selectedLevel2, selectedLevel3, searchQuery, isStoresView, isSellersView, router]);

  const handleLoadMore = () => {
    if (!isValidating && hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    // Don't reset if clicking the same tab
    if (mode === viewMode) return;
    
    // Clear all product state FIRST before changing mode
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
    
    // Then change the mode
    setViewMode(mode);
    
    // Clear category filters when switching to Trending or For You
    if (mode === 'trending' || mode === 'for-you') {
      setSelectedLevel1(null);
      setSelectedLevel2(null);
      setSelectedLevel3(null);
    }
    
    // Track mode change
    tracker.trackClick(undefined, {
      action: 'view_mode_change',
      from: viewMode,
      to: mode,
    });
  };

  const handleLevel1Change = (category: string | null) => {
    // Don't reset if clicking the same category
    if (category === selectedLevel1) return;
    
    // Clear all product state FIRST before changing filter
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
    
    // Then change the filter
    setSelectedLevel1(category);
    setSelectedLevel2(null);
    setSelectedLevel3(null);
    
    if (category) {
      tracker.trackClick(undefined, {
        action: 'category_filter_l1',
        category: category,
        view_mode: viewMode,
      });
    }
  };

  const handleLevel2Change = (subcategory: string | null) => {
    // Don't reset if clicking the same subcategory
    if (subcategory === selectedLevel2) return;
    
    // Clear all product state FIRST before changing filter
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
    
    // Then change the filter
    setSelectedLevel2(subcategory);
    setSelectedLevel3(null);
    
    if (subcategory) {
      tracker.trackClick(undefined, {
        action: 'category_filter_l2',
        category: `${selectedLevel1} > ${subcategory}`,
        view_mode: viewMode,
      });
    }
  };

  const handleLevel3Change = (level3: string | null) => {
    // Don't reset if clicking the same level3 category
    if (level3 === selectedLevel3) return;
    
    // Clear all product state FIRST before changing filter
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
    
    // Then change the filter
    setSelectedLevel3(level3);
    
    if (level3) {
      tracker.trackClick(undefined, {
        action: 'category_filter_l3',
        category: `${selectedLevel1} > ${selectedLevel2} > ${level3}`,
        view_mode: viewMode,
      });
    }
  };

  const handleClearSearch = () => {
    setSearchQuery(null);
    setCurrentPage(1);
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
  };

  // Handler for listing type filter changes (All Listings, Stores, Individual Sellers)
  const handleListingTypeChange = (filter: ListingTypeFilterType) => {
    // Don't reset if clicking the same filter
    if (filter === listingTypeFilter) return;
    
    // Clear all product state FIRST before changing filter
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
    
    // Then change the filter
    setListingTypeFilter(filter);
    
    // Track filter change
    tracker.trackClick(undefined, {
      action: 'listing_type_filter_change',
      from: listingTypeFilter,
      to: filter,
      view_mode: viewMode,
    });
  };

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <MarketplaceLayout showFooter={false} showStoreCTA={isStoresView}>
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-4 sm:py-8 pt-16 sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Stores View */}
            {isStoresView && (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900">Bike Stores</h1>
                  {!storesLoading && (
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="text-sm text-gray-700 font-medium">
                        {stores.length.toLocaleString()} {stores.length === 1 ? 'store' : 'stores'}
                      </span>
                    </div>
                  )}
                </div>
                
                <StoresGrid stores={stores} loading={storesLoading} />
              </>
            )}

            {/* Sellers View */}
            {isSellersView && (
              <div className="flex flex-col items-center justify-center py-24 px-4">
                <div className="rounded-full bg-gray-100 p-6 mb-4">
                  <StoreIcon className="h-12 w-12 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Individual Sellers Coming Soon
                </h3>
                <p className="text-sm text-gray-600 text-center max-w-md">
                  We're working on adding individual seller profiles. Check back soon!
                </p>
              </div>
            )}

            {/* Products View */}
            {!isStoresView && !isSellersView && (
              <>
                {/* View Mode Pills & Listing Type Filter - Scrollable on mobile */}
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                  <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 sm:pb-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <ViewModePills
                      activeMode={viewMode}
                      onModeChange={handleViewModeChange}
                      showForYouBadge={!user && viewMode !== 'for-you'}
                    />
                    <ListingTypeFilter 
                      activeFilter={listingTypeFilter}
                      onFilterChange={handleListingTypeChange}
                    />
                  </div>

                  {/* Product Count */}
                  {!searchQuery && (
                    <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm text-gray-700 font-medium">
                        {totalCount.toLocaleString()} {viewMode === 'trending' ? 'trending' : ''} products
                      </span>
                    </div>
                  )}
                </div>

                {/* Active Search Display */}
                {searchQuery && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-md border border-gray-200 p-3 flex items-center justify-between gap-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        Search results for:
                      </span>
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        "{searchQuery}"
                      </span>
                    </div>
                    <button
                      onClick={handleClearSearch}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </button>
                  </motion.div>
                )}

                {/* Cascading Category Filter - Only show on All Products tab */}
                {viewMode === 'all' && (
                  <CascadingCategoryFilter
                    selectedLevel1={selectedLevel1}
                    selectedLevel2={selectedLevel2}
                    selectedLevel3={selectedLevel3}
                    onLevel1Change={handleLevel1Change}
                    onLevel2Change={handleLevel2Change}
                    onLevel3Change={handleLevel3Change}
                    counts={categoryCounts}
                  />
                )}

                {/* Loading State - Amazon-style instant skeletons */}
                {loading && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <ProductCardSkeleton key={i} />
                    ))}
                  </div>
                )}

                {/* Anonymous user on For You - Show sign-in message */}
                {!user && viewMode === 'for-you' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-md border border-gray-200 p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <Heart className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Sign in for personalised recommendations
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Showing trending products for now
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => router.push('/login')}
                      className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium flex items-center gap-2"
                    >
                      <LogIn className="h-4 w-4" />
                      Sign In
                    </Button>
                  </motion.div>
                )}

                  {/* Empty State - No Products */}
                  {!loading && products.length === 0 && (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key="empty-state"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="bg-white rounded-md border border-gray-200 p-12 text-center"
                      >
                        {searchQuery ? (
                          <>
                            <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                              No results found for "{searchQuery}"
                            </h3>
                            <p className="text-gray-600 max-w-md mx-auto mb-6">
                              We couldn't find any products matching your search. Try different keywords or browse all products.
                            </p>
                            <Button
                              onClick={handleClearSearch}
                              className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium"
                            >
                              Clear Search
                            </Button>
                          </>
                        ) : !searchQuery && viewMode === 'trending' ? (
                          <>
                            <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                              No trending products yet
                            </h3>
                            <p className="text-gray-600 max-w-md mx-auto mb-6">
                              {selectedLevel1 
                                ? `No trending ${selectedLevel1.toLowerCase()} products right now. Try browsing all products or check back soon!`
                                : 'Products will appear here as they gain popularity. Check back soon or browse all products!'}
                            </p>
                            <Button
                              onClick={() => setViewMode('all')}
                              className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium"
                            >
                              Browse All Products
                            </Button>
                          </>
                        ) : !searchQuery && viewMode === 'for-you' ? (
                          <>
                            <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                              {user ? "We're learning your preferences" : "Sign in for personalised recommendations"}
                            </h3>
                            <p className="text-gray-600 max-w-md mx-auto mb-6">
                              {user 
                                ? 'Browse products to help us understand what you like. Your personalised feed will appear here!'
                                : 'Sign in to get recommendations based on your browsing history and preferences.'}
                            </p>
                            <Button
                              onClick={() => user ? setViewMode('trending') : router.push('/login')}
                              className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium"
                            >
                              {user ? 'Browse Trending' : 'Sign In'}
                            </Button>
                          </>
                        ) : null}

                        {!searchQuery && viewMode === 'all' && (
                          <>
                            <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                              No products found
                            </h3>
                            <p className="text-gray-600 max-w-md mx-auto mb-6">
                              {selectedLevel1 
                                ? `No ${selectedLevel1.toLowerCase()} products available. Try a different category!`
                                : 'No products available at the moment.'}
                            </p>
                            {selectedLevel1 && (
                              <Button
                                onClick={() => {
                                  setSelectedLevel1(null);
                                  setSelectedLevel2(null);
                                  setSelectedLevel3(null);
                                }}
                                variant="outline"
                                className="rounded-md"
                              >
                                Clear Filters
                              </Button>
                            )}
                          </>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  )}

                  {/* Products Grid - Progressive Loading */}
                  {products.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4">
                      {products.map((product, index) => (
                        <ProductCard 
                          key={product.id} 
                          product={product}
                          priority={index < 6} 
                        />
                      ))}
                    </div>
                  )}

                  {/* Load More Button */}
                  {!loading && hasMore && products.length > 0 && (
                    <div className="flex justify-center pt-6">
                      <Button
                        onClick={handleLoadMore}
                        variant="outline"
                        className="rounded-md px-8"
                      >
                        Load More Products
                      </Button>
                    </div>
                  )}

                  {/* Info Section for Trending/For You */}
                  {!loading && products.length > 0 && viewMode !== 'all' && (
                    <div className="bg-white rounded-md border border-gray-200 p-6 mt-8">
                      {viewMode === 'trending' && (
                        <>
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            About Trending
                          </h3>
                          <ul className="space-y-2 text-sm text-gray-600">
                            <li className="flex items-start gap-2">
                              <span className="text-[#FFC72C] mt-1">•</span>
                              <span>Products getting the most attention right now</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#FFC72C] mt-1">•</span>
                              <span>Updated every 15 minutes based on real user activity</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#FFC72C] mt-1">•</span>
                              <span>Discover what the cycling community is browsing</span>
                            </li>
                          </ul>
                        </>
                      )}

                      {viewMode === 'for-you' && user && (
                        <>
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Heart className="h-4 w-4" />
                            Your Personalised Feed
                          </h3>
                          <ul className="space-y-2 text-sm text-gray-600">
                            <li className="flex items-start gap-2">
                              <span className="text-[#FFC72C] mt-1">•</span>
                              <span>Based on products you've viewed and clicked</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#FFC72C] mt-1">•</span>
                              <span>Matches keywords from your browsing history</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-[#FFC72C] mt-1">•</span>
                              <span>Gets smarter as you browse more products</span>
                            </li>
                          </ul>
                        </>
                      )}
                    </div>
                  )}
              </>
            )}
          </motion.div>
        </div>
      </MarketplaceLayout>
    </>
  );
}

// Wrap with Suspense to handle useSearchParams
export default function MarketplacePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    }>
      <MarketplacePageContent />
    </Suspense>
  );
}


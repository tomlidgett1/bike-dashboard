"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, LogIn, Heart, Package, X, Search, Store as StoreIcon, User } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductCard, ProductCardSkeleton } from "@/components/marketplace/product-card";
import { UnifiedFilterBar, ViewMode, ListingTypeFilter as ListingTypeFilterType } from "@/components/marketplace/unified-filter-bar";
import { AdvancedFilters, DEFAULT_ADVANCED_FILTERS, countActiveFilters, type AdvancedFiltersState } from "@/components/marketplace/advanced-filters";
import { StoresGrid } from "@/components/marketplace/stores-grid";
import { SellersGrid } from "@/components/marketplace/sellers-grid";
import { ImageDiscoveryModal } from "@/components/marketplace/image-discovery-modal";
import type { IndividualSeller } from "@/app/api/marketplace/sellers/route";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useInteractionTracker } from "@/lib/tracking/interaction-tracker";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { useMarketplaceData } from "@/lib/hooks/use-marketplace-data";

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
  const { openAuthModal } = useAuthModal();
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

  // Sellers state
  const [sellers, setSellers] = React.useState<IndividualSeller[]>([]);
  const [sellersLoading, setSellersLoading] = React.useState(false);

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

  // Sync category filter state with URL params when they change
  // This ensures filters reset when navigating between views (Products, Stores, Sellers)
  React.useEffect(() => {
    const urlLevel1 = searchParams.get('level1') || null;
    const urlLevel2 = searchParams.get('level2') || null;
    const urlLevel3 = searchParams.get('level3') || null;
    
    // When on Stores or Sellers view, clear the category filters
    if (isStoresView || isSellersView) {
      if (selectedLevel1 !== null) setSelectedLevel1(null);
      if (selectedLevel2 !== null) setSelectedLevel2(null);
      if (selectedLevel3 !== null) setSelectedLevel3(null);
    } else {
      // On Products view, sync state with URL params
      if (urlLevel1 !== selectedLevel1) setSelectedLevel1(urlLevel1);
      if (urlLevel2 !== selectedLevel2) setSelectedLevel2(urlLevel2);
      if (urlLevel3 !== selectedLevel3) setSelectedLevel3(urlLevel3);
    }
  }, [searchParams, isStoresView, isSellersView]);

  // Listing type filter state (default to all listings)
  const [listingTypeFilter, setListingTypeFilter] = React.useState<ListingTypeFilterType>('all');

  // Advanced filters state
  const [advancedFilters, setAdvancedFilters] = React.useState<AdvancedFiltersState>(DEFAULT_ADVANCED_FILTERS);
  const activeFilterCount = countActiveFilters(advancedFilters);

  // Products state (for pagination accumulation)
  const [accumulatedProducts, setAccumulatedProducts] = React.useState<MarketplaceProduct[]>([]);
  const [currentPage, setCurrentPage] = React.useState(1);

  // Image Discovery Modal state (admin only)
  const [imageDiscoveryModal, setImageDiscoveryModal] = React.useState<{
    isOpen: boolean;
    productId: string;
    productName: string;
  }>({
    isOpen: false,
    productId: '',
    productName: '',
  });

  // Check if user is admin (tom@lidgett.net)
  const isAdmin = user?.email === 'tom@lidgett.net';

  // Track filter changes to know when to reset
  const filterKey = React.useMemo(() => 
    `${viewMode}-${listingTypeFilter}-${selectedLevel1}-${selectedLevel2}-${selectedLevel3}-${searchQuery}-${advancedFilters.minPrice}-${advancedFilters.maxPrice}-${advancedFilters.condition}-${advancedFilters.sortBy}`,
    [viewMode, listingTypeFilter, selectedLevel1, selectedLevel2, selectedLevel3, searchQuery, advancedFilters]
  );
  const prevFilterKeyRef = React.useRef(filterKey);
  const processedDataRef = React.useRef<Set<string>>(new Set());
  const lastProcessedPageRef = React.useRef(0);
  const lastDataHashRef = React.useRef<string>('');

  // Create stable params object - DON'T include page in SWR key for pagination
  const marketplaceParams = React.useMemo(() => ({
    viewMode,
    page: 1, // Always fetch page 1 from SWR, handle pagination manually
    pageSize: 200, // Load 200 products per page
    level1: selectedLevel1,
    level2: selectedLevel2,
    level3: selectedLevel3,
    search: searchQuery,
    // Add listing type filtering
    listingType: listingTypeFilter === 'stores' ? 'store_inventory' as const : 
                 listingTypeFilter === 'individuals' ? 'private_listing' as const : undefined,
    // Add advanced filters
    minPrice: advancedFilters.minPrice || null,
    maxPrice: advancedFilters.maxPrice || null,
    condition: advancedFilters.condition !== 'all' ? advancedFilters.condition : null,
    sortBy: advancedFilters.sortBy,
    brand: advancedFilters.brand || null,
  }), [viewMode, selectedLevel1, selectedLevel2, selectedLevel3, searchQuery, listingTypeFilter, advancedFilters]);

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

  // Handle initial page load from SWR (page 1 only)
  // Pagination is handled manually in handleLoadMore
  React.useEffect(() => {
    // Create a hash of current fetched products to detect data changes
    const currentDataHash = fetchedProducts.map(p => p.id).join(',');
    
    // Check if filters changed
    const filtersChanged = filterKey !== prevFilterKeyRef.current;
    
    // Check if data actually changed (new products arrived from SWR)
    const dataChanged = currentDataHash !== lastDataHashRef.current && currentDataHash !== '';
    
    console.log('[MARKETPLACE] SWR Effect triggered:', {
      filtersChanged,
      dataChanged,
      isValidating,
      fetchedCount: fetchedProducts.length,
      accumulatedCount: accumulatedProducts.length,
    });
    
    if (filtersChanged) {
      // Filters changed - reset everything
      console.log('[MARKETPLACE] Filter changed, resetting...');
      prevFilterKeyRef.current = filterKey;
      lastProcessedPageRef.current = 0;
      lastDataHashRef.current = '';
      
      // Wait for fresh data if validating
      if (!isValidating && fetchedProducts.length > 0) {
        console.log('[MARKETPLACE] Setting initial products from SWR');
        setAccumulatedProducts(fetchedProducts);
        processedDataRef.current = new Set(fetchedProducts.map(p => p.id));
        lastDataHashRef.current = currentDataHash;
      }
    } else if (dataChanged && fetchedProducts.length > 0) {
      // Data changed - this is page 1 data from SWR
      const needsInitialData = accumulatedProducts.length === 0;
      
      if (needsInitialData) {
        console.log('[MARKETPLACE] Setting initial page 1 data:', fetchedProducts.length, 'products');
        setAccumulatedProducts(fetchedProducts);
        processedDataRef.current = new Set(fetchedProducts.map(p => p.id));
        lastDataHashRef.current = currentDataHash;
      }
    }
  }, [fetchedProducts, filterKey, accumulatedProducts.length, isValidating]);

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

  // Fetch sellers when in sellers view
  React.useEffect(() => {
    if (isSellersView) {
      const fetchSellers = async () => {
        setSellersLoading(true);
        try {
          const response = await fetch('/api/marketplace/sellers');
          if (response.ok) {
            const data = await response.json();
            setSellers(data.sellers || []);
          }
        } catch (error) {
          console.error('[Marketplace] Error fetching sellers:', error);
        } finally {
          setSellersLoading(false);
        }
      };
      fetchSellers();
    }
  }, [isSellersView]);

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

  const handleLoadMore = async () => {
    if (isValidating || !hasMore) return;
    
    const nextPage = currentPage + 1;
    console.log('[MARKETPLACE] Loading more products, page:', nextPage);
    
    try {
      // Build the URL for the next page
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('pageSize', '200'); // Load 200 products per page
      
      if (listingTypeFilter === 'stores') {
        params.set('listingType', 'store_inventory');
      } else if (listingTypeFilter === 'individuals') {
        params.set('listingType', 'private_listing');
      }
      
      if (advancedFilters.minPrice) params.set('minPrice', advancedFilters.minPrice);
      if (advancedFilters.maxPrice) params.set('maxPrice', advancedFilters.maxPrice);
      if (advancedFilters.condition && advancedFilters.condition !== 'all') {
        params.set('condition', advancedFilters.condition);
      }
      if (advancedFilters.sortBy && advancedFilters.sortBy !== 'newest') {
        params.set('sortBy', advancedFilters.sortBy);
      }
      if (advancedFilters.brand) params.set('brand', advancedFilters.brand);
      
      let endpoint = '';
      if (searchQuery) {
        params.set('search', searchQuery);
        if (selectedLevel1) params.set('level1', selectedLevel1);
        if (selectedLevel2) params.set('level2', selectedLevel2);
        if (selectedLevel3) params.set('level3', selectedLevel3);
        endpoint = `/api/marketplace/products?${params}`;
      } else {
        switch (viewMode) {
          case 'trending':
            params.delete('pageSize');
            params.set('limit', '200'); // Load 200 products per page
            if (selectedLevel1) {
              params.delete('level1');
              params.set('category', selectedLevel1);
            }
            endpoint = `/api/marketplace/trending?${params}`;
            break;
          
          case 'for-you':
            params.delete('pageSize');
            params.set('limit', '200'); // Load 200 products per page
            params.set('enrich', 'true');
            if (selectedLevel1) params.set('level1', selectedLevel1);
            if (selectedLevel2) params.set('level2', selectedLevel2);
            if (selectedLevel3) params.set('level3', selectedLevel3);
            endpoint = `/api/recommendations/for-you?${params}`;
            break;
          
          case 'all':
            if (selectedLevel1) params.set('level1', selectedLevel1);
            if (selectedLevel2) params.set('level2', selectedLevel2);
            if (selectedLevel3) params.set('level3', selectedLevel3);
            endpoint = `/api/marketplace/products?${params}`;
            break;
        }
      }
      
      console.log('[MARKETPLACE] Fetching:', endpoint);
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error('Failed to fetch more products');
      }
      
      const data = await response.json();
      const newProducts = data.products || data.recommendations || [];
      
      console.log('[MARKETPLACE] Received products:', newProducts.length);
      
      // Add new products to accumulated list
      setAccumulatedProducts(prev => {
        const filtered = newProducts.filter((p: any) => !processedDataRef.current.has(p.id));
        console.log('[MARKETPLACE] Adding', filtered.length, 'new products (filtered duplicates)');
        return [...prev, ...filtered];
      });
      
      // Update refs
      newProducts.forEach((p: any) => processedDataRef.current.add(p.id));
      setCurrentPage(nextPage);
      
      // Update pagination state if provided
      if (data.pagination) {
        // Note: We can't easily update the SWR pagination state, 
        // but we can track hasMore locally if needed
      }
    } catch (error) {
      console.error('[MARKETPLACE] Error loading more products:', error);
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
    
    // Reset category filters since categories may differ between listing types
    setSelectedLevel1(null);
    setSelectedLevel2(null);
    setSelectedLevel3(null);
    
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

  // Handler for advanced filters changes
  const handleAdvancedFiltersChange = (filters: AdvancedFiltersState) => {
    setAdvancedFilters(filters);
  };

  const handleAdvancedFiltersApply = () => {
    // Clear all product state to trigger fresh fetch
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
    
    // Track filter application
    tracker.trackClick(undefined, {
      action: 'advanced_filters_applied',
      min_price: advancedFilters.minPrice || null,
      max_price: advancedFilters.maxPrice || null,
      condition: advancedFilters.condition,
      sort_by: advancedFilters.sortBy,
    });
  };

  const handleAdvancedFiltersReset = () => {
    setAdvancedFilters(DEFAULT_ADVANCED_FILTERS);
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
    
    tracker.trackClick(undefined, {
      action: 'advanced_filters_reset',
    });
  };

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <MarketplaceLayout showFooter={false} showStoreCTA={isStoresView}>
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-4 sm:py-8 pt-16 sm:pt-20 pb-24 sm:pb-8">
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
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900">Individual Sellers</h1>
                  {!sellersLoading && (
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="text-sm text-gray-700 font-medium">
                        {sellers.length.toLocaleString()} {sellers.length === 1 ? 'seller' : 'sellers'}
                      </span>
                    </div>
                  )}
                </div>
                
                <SellersGrid sellers={sellers} loading={sellersLoading} />
              </>
            )}

            {/* Products View */}
            {!isStoresView && !isSellersView && (
              <>
                {/* Unified Filter Bar - View modes, categories, source filter */}
                <UnifiedFilterBar
                  viewMode={viewMode}
                  onViewModeChange={handleViewModeChange}
                  showForYouBadge={!user && viewMode !== 'for-you'}
                  selectedLevel1={selectedLevel1}
                  selectedLevel2={selectedLevel2}
                  selectedLevel3={selectedLevel3}
                  onLevel1Change={handleLevel1Change}
                  onLevel2Change={handleLevel2Change}
                  onLevel3Change={handleLevel3Change}
                  listingTypeFilter={listingTypeFilter}
                  onListingTypeChange={handleListingTypeChange}
                  productCount={!searchQuery ? totalCount : undefined}
                  additionalFilters={
                    <AdvancedFilters
                      filters={advancedFilters}
                      onFiltersChange={handleAdvancedFiltersChange}
                      onApply={handleAdvancedFiltersApply}
                      onReset={handleAdvancedFiltersReset}
                      activeFilterCount={activeFilterCount}
                    />
                  }
                />

                {/* Active Advanced Filters Summary */}
                {viewMode === 'all' && activeFilterCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 flex-wrap"
                  >
                    <span className="text-xs text-gray-500 font-medium">Active filters:</span>
                    {advancedFilters.minPrice && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md">
                        Min: ${advancedFilters.minPrice}
                        <button
                          onClick={() => {
                            setAdvancedFilters(prev => ({ ...prev, minPrice: '' }));
                            handleAdvancedFiltersApply();
                          }}
                          className="ml-1 hover:text-gray-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {advancedFilters.maxPrice && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md">
                        Max: ${advancedFilters.maxPrice}
                        <button
                          onClick={() => {
                            setAdvancedFilters(prev => ({ ...prev, maxPrice: '' }));
                            handleAdvancedFiltersApply();
                          }}
                          className="ml-1 hover:text-gray-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {advancedFilters.condition !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md">
                        {advancedFilters.condition}
                        <button
                          onClick={() => {
                            setAdvancedFilters(prev => ({ ...prev, condition: 'all' }));
                            handleAdvancedFiltersApply();
                          }}
                          className="ml-1 hover:text-gray-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {advancedFilters.brand && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md">
                        {advancedFilters.brand}
                        <button
                          onClick={() => {
                            setAdvancedFilters(prev => ({ ...prev, brand: '' }));
                            handleAdvancedFiltersApply();
                          }}
                          className="ml-1 hover:text-gray-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {advancedFilters.sortBy !== 'newest' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md">
                        {advancedFilters.sortBy === 'oldest' ? 'Oldest' : 
                         advancedFilters.sortBy === 'price_asc' ? 'Price ↑' : 'Price ↓'}
                        <button
                          onClick={() => {
                            setAdvancedFilters(prev => ({ ...prev, sortBy: 'newest' }));
                            handleAdvancedFiltersApply();
                          }}
                          className="ml-1 hover:text-gray-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={handleAdvancedFiltersReset}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium underline underline-offset-2"
                    >
                      Clear all
                    </button>
                  </motion.div>
                )}

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

                {/* Loading State - Amazon-style instant skeletons */}
                {loading && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4">
                    {Array.from({ length: 36 }).map((_, i) => (
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
                      onClick={openAuthModal}
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
                              onClick={() => user ? setViewMode('trending') : openAuthModal()}
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
                          priority={index < 18} // Prioritize first 18 images (top 3 rows on XL screens)
                          isAdmin={isAdmin}
                          onImageDiscoveryClick={(productId) => {
                            // Use canonical_product_id if available (for private listings)
                            // Otherwise use product id (for store inventory which IS the canonical product)
                            const canonicalId = product.canonical_product_id || product.id;
                            setImageDiscoveryModal({
                              isOpen: true,
                              productId: canonicalId,
                              productName: (product as any).display_name || product.description,
                            });
                          }}
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

      {/* Image Discovery Modal (admin only) */}
      {isAdmin && (
        <ImageDiscoveryModal
          isOpen={imageDiscoveryModal.isOpen}
          onClose={() => setImageDiscoveryModal({ isOpen: false, productId: '', productName: '' })}
          productId={imageDiscoveryModal.productId}
          productName={imageDiscoveryModal.productName}
          onComplete={() => {
            // Optionally refresh products after completion
            console.log('[IMAGE DISCOVERY] Completed for product:', imageDiscoveryModal.productId);
          }}
        />
      )}
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


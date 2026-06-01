"use client";

import * as React from "react";
import { Suspense, startTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { TrendingUp, Package, X, Search, Store as StoreIcon, User, Clock, DollarSign, SlidersHorizontal, Loader2 } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductCard, ProductCardSkeleton } from "@/components/marketplace/product-card";
import { ListItemBanner } from "@/components/marketplace/list-item-banner";
import { UnifiedFilterBar, ViewMode, ListingTypeFilter as ListingTypeFilterType } from "@/components/marketplace/unified-filter-bar";
import { SpaceNavigator, useMarketplaceSpace } from "@/components/marketplace/space-navigator";
import { StoreCategoryPills } from "@/components/marketplace/store-category-pills";
import type { MarketplaceSpace } from "@/lib/types/marketplace";
import { AdvancedFilters, DEFAULT_ADVANCED_FILTERS, countActiveFilters, type AdvancedFiltersState } from "@/components/marketplace/advanced-filters";
import { StoresGrid } from "@/components/marketplace/stores-grid";
import { ImageDiscoveryModal } from "@/components/marketplace/image-discovery-modal";
import { SplitSearchResults } from "@/components/marketplace/split-search-results";
import { PromoBannerCarousel } from "@/components/marketplace/promo-banner-carousel";
import { useUserVouchers } from "@/lib/hooks/use-user-vouchers";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/components/providers/auth-provider";
import { useInteractionTracker } from "@/lib/tracking/interaction-tracker";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { useMarketplaceData } from "@/lib/hooks/use-marketplace-data";
import { MARKETPLACE_PROMO_BANNERS_ENABLED } from "@/lib/marketplace-feature-flags";
import { MARKETPLACE_INITIAL_PAGE_SIZE } from "@/lib/marketplace-constants";
import type { InitialMarketplacePagination } from "@/lib/server/fetch-initial-marketplace-products";
import { cn } from "@/lib/utils";

// ============================================================
// Marketplace Page - Discovery-Focused Homepage
// Two distinct spaces:
// - Marketplace (default): Private listings from individuals
// - Bike Stores: Products from bike stores
// ============================================================

// Default marketplace tab when URL is missing or legacy (?view=for-you)
function normaliseMarketplaceViewParam(raw: string | null): ViewMode {
  if (raw === "all") return "all";
  return "all";
}

interface Store {
  id: string;
  store_name: string;
  store_type: string;
  logo_url: string | null;
  product_count: number;
  joined_date: string;
}

interface MarketplacePageContentProps {
  /** Products pre-fetched server-side for immediate first paint. */
  initialProducts?: MarketplaceProduct[];
  /** Pagination metadata from the server fetch. */
  initialPagination?: InitialMarketplacePagination;
}

export function MarketplacePageContent({ initialProducts, initialPagination }: MarketplacePageContentProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const tracker = useInteractionTracker(user?.id);
  
  // User vouchers and first upload eligibility — only needed when promo banners are active
  const { eligibleForFirstUploadPromo, listingCount, isLoading: vouchersLoading, error: vouchersError } = useUserVouchers(MARKETPLACE_PROMO_BANNERS_ENABLED);

  // Navigation loading state
  const [isNavigating, setIsNavigating] = React.useState(false);

  // Space navigation - determines which "world" we're in
  const { currentSpace, setSpace } = useMarketplaceSpace();
  
  // Derive view states from space
  const isStoresView = currentSpace === 'stores';
  const isMarketplaceView = currentSpace === 'marketplace';

  // View mode state (trending, all) - only for products view
  // Default to 'all' for browsing all products
  const urlView = searchParams.get("view");
  const [viewMode, setViewMode] = React.useState<ViewMode>(() =>
    !isStoresView ? normaliseMarketplaceViewParam(urlView) : "all"
  );

  // Stores state
  const [stores, setStores] = React.useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = React.useState(false);

  // Store filter state (for stores space - filter products by specific store)
  const [selectedStoreId, setSelectedStoreId] = React.useState<string | null>(null);
  
  // Store category filter state (for filtering within a selected store - zero API calls)
  const [selectedStoreCategory, setSelectedStoreCategory] = React.useState<string | null>(null);

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
    
    // When on Stores view, clear the category filters
    if (isStoresView) {
      if (selectedLevel1 !== null) setSelectedLevel1(null);
      if (selectedLevel2 !== null) setSelectedLevel2(null);
      if (selectedLevel3 !== null) setSelectedLevel3(null);
    } else {
      // On Products view, sync state with URL params
      if (urlLevel1 !== selectedLevel1) setSelectedLevel1(urlLevel1);
      if (urlLevel2 !== selectedLevel2) setSelectedLevel2(urlLevel2);
      if (urlLevel3 !== selectedLevel3) setSelectedLevel3(urlLevel3);
    }
  }, [searchParams, isStoresView]);

  // Listing type filter state - derived from space
  // Marketplace space = individuals only, Stores space = stores only
  const spaceListingType = React.useMemo((): ListingTypeFilterType => {
    if (isStoresView) return 'stores';
    if (isMarketplaceView) return 'individuals';
    return 'all';
  }, [isStoresView, isMarketplaceView]);
  
  const [listingTypeFilter, setListingTypeFilter] = React.useState<ListingTypeFilterType>(spaceListingType);
  
  // Track previous space to detect changes
  const prevSpaceRef = React.useRef(currentSpace);

  // Advanced filters state
  const [advancedFilters, setAdvancedFilters] = React.useState<AdvancedFiltersState>(DEFAULT_ADVANCED_FILTERS);
  const activeFilterCount = countActiveFilters(advancedFilters);

  // Quick filter state (for mobile floating bar)
  const [privateOnly, setPrivateOnly] = React.useState(false);
  const [quickPriceRange, setQuickPriceRange] = React.useState<string | null>(null);
  const [recentlyAdded, setRecentlyAdded] = React.useState<string | null>(null);

  /** Mobile Browse: filter sheet opened from header FAB (controlled with UnifiedFilterBar). */
  const [mobileBrowseSheetOpen, setMobileBrowseSheetOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isMarketplaceView || viewMode !== "all") {
      setMobileBrowseSheetOpen(false);
    }
  }, [isMarketplaceView, viewMode]);

  // Handler for private only toggle
  const handlePrivateOnlyChange = (checked: boolean) => {
    setPrivateOnly(checked);
    if (checked) {
      // Switch to individuals filter
      setAccumulatedProducts([]);
      processedDataRef.current = new Set();
      setCurrentPage(1);
      setListingTypeFilter('individuals');
    } else {
      // Switch back to all
      setAccumulatedProducts([]);
      processedDataRef.current = new Set();
      setCurrentPage(1);
      setListingTypeFilter('all');
    }
  };

  // Handler for quick price range
  const handleQuickPriceChange = (priceId: string | null) => {
    setQuickPriceRange(priceId);
    
    let minPrice = '';
    let maxPrice = '';
    
    if (priceId) {
      switch (priceId) {
        case 'under50':
          maxPrice = '50';
          break;
        case '50-100':
          minPrice = '50';
          maxPrice = '100';
          break;
        case '100-250':
          minPrice = '100';
          maxPrice = '250';
          break;
        case '250plus':
          minPrice = '250';
          break;
      }
    }
    
    setAdvancedFilters(prev => ({ ...prev, minPrice, maxPrice }));
    // Trigger refresh
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
  };

  // Handler for recently added filter
  const handleRecentlyAddedChange = (timeId: string | null) => {
    setRecentlyAdded(timeId);
    // Update sort and trigger refresh
    setAdvancedFilters(prev => ({ 
      ...prev, 
      sortBy: timeId ? 'newest' : prev.sortBy 
    }));
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
  };

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

  // Sticky filter header state (mobile only)
  const [showStickyFilters, setShowStickyFilters] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const categoryPillsRef = React.useRef<HTMLDivElement | null>(null);
  const [productGridLayout, setProductGridLayout] = React.useState<
    "grid4" | "grid6" | "grid8"
  >("grid6");
  const sentinelRef = React.useRef<HTMLDivElement>(null); // Sentinel for tracking scroll

  // Track if we're on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      // Reset sticky filters when switching to desktop
      if (!mobile) {
        setShowStickyFilters(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Detect when filters scroll out of view (mobile only, Browse mode only)
  React.useEffect(() => {
    // Only run on mobile, in Browse mode (or stores view)
    if (!isMobile || (viewMode !== 'all' && !isStoresView)) {
      setShowStickyFilters(false);
      return;
    }

    if (!sentinelRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky filters when sentinel scrolls out of view
        const shouldShow = !entry.isIntersecting;
        setShowStickyFilters(shouldShow);
      },
      {
        threshold: 0,
        rootMargin: '-56px 0px 0px 0px', // Account for mobile header height
      }
    );

    const element = sentinelRef.current;
    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [isMobile, viewMode, isStoresView]);

  // Infinite scroll sentinel ref — effect added after handleLoadMore is declared
  const bottomSentinelRef = React.useRef<HTMLDivElement>(null);

  // Tracks IDs already in accumulatedProducts to deduplicate pagination appends
  const processedDataRef = React.useRef<Set<string>>(new Set());

  // Sync listing type filter when space changes
  React.useEffect(() => {
    if (prevSpaceRef.current !== currentSpace) {
      setListingTypeFilter(spaceListingType);
      // Reset products when space changes (avoid showing marketplace inventory under Bike Stores, etc.)
      setAccumulatedProducts([]);
      processedDataRef.current = new Set();
      setCurrentPage(1);
      prevSpaceRef.current = currentSpace;
    }
  }, [currentSpace, spaceListingType]);

  const resetProductsForFilterChange = React.useCallback(() => {
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setCurrentPage(1);
  }, []);

  const handleNavigateToAllStores = React.useCallback(() => {
    setSelectedStoreId(null);
    setSelectedStoreCategory(null);
    resetProductsForFilterChange();
    router.push("/marketplace?space=stores", { scroll: false });
  }, [router, resetProductsForFilterChange]);

  const handleNavigateToStore = React.useCallback(
    (storeId: string) => {
      setSelectedStoreId(storeId);
      setSelectedStoreCategory(null);
      resetProductsForFilterChange();
      const params = new URLSearchParams();
      params.set("space", "stores");
      params.set("store", storeId);
      router.push(`/marketplace?${params.toString()}`, { scroll: false });
    },
    [router, resetProductsForFilterChange]
  );

  const handleStoreFilterChange = React.useCallback(
    (storeId: string | null) => {
      setSelectedStoreId(storeId);
      setSelectedStoreCategory(null);
      resetProductsForFilterChange();
      const params = new URLSearchParams();
      params.set("space", "stores");
      if (storeId) params.set("store", storeId);
      else params.delete("store");
      router.replace(`/marketplace?${params.toString()}`, { scroll: false });
    },
    [router, resetProductsForFilterChange]
  );

  React.useEffect(() => {
    if (!isStoresView) return;
    const storeFromUrl = searchParams.get("store") || null;
    // Only update if genuinely different — React bails out on equal values so
    // the idempotent call after a click-driven router.replace is harmless.
    setSelectedStoreId(storeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isStoresView]); // intentionally omit selectedStoreId: including it
  // causes the effect to fire immediately after a click (before the URL updates),
  // reading the stale URL value and resetting state back — the multi-flash bug.

  // Bike Stores always uses the browse/products index, not trending — keeps filterKey and fetchers aligned.
  React.useEffect(() => {
    if (isStoresView && viewMode !== "all") {
      setViewMode("all");
    }
  }, [isStoresView, viewMode]);

  // Calculate created after date based on recentlyAdded filter
  const createdAfter = React.useMemo(() => {
    if (!recentlyAdded) return null;
    const now = new Date();
    switch (recentlyAdded) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return null;
    }
  }, [recentlyAdded]);

  // Create stable params object - DON'T include page in SWR key for pagination
  const marketplaceParams = React.useMemo(() => ({
    viewMode,
    page: 1, // Always fetch page 1 from SWR, handle pagination manually
    pageSize: MARKETPLACE_INITIAL_PAGE_SIZE,
    level1: selectedLevel1,
    level2: selectedLevel2,
    level3: selectedLevel3,
    search: searchQuery,
    // Add listing type filtering
    listingType: listingTypeFilter === 'stores' ? 'store_inventory' as const : 
                 listingTypeFilter === 'individuals' ? 'private_listing' as const : undefined,
    // Add store filter (for stores space)
    storeId: selectedStoreId,
    // Add advanced filters
    minPrice: advancedFilters.minPrice || null,
    maxPrice: advancedFilters.maxPrice || null,
    condition: advancedFilters.condition !== 'all' ? advancedFilters.condition : null,
    sortBy: advancedFilters.sortBy,
    brand: advancedFilters.brand || null,
    // Add recently added filter
    createdAfter: createdAfter,
  }), [viewMode, selectedLevel1, selectedLevel2, selectedLevel3, searchQuery, listingTypeFilter, selectedStoreId, advancedFilters, createdAfter]);

  // Use SWR for products data with intelligent caching
  const { 
    products: fetchedProducts, 
    pagination, 
    isLoading, 
    isValidating 
  } = useMarketplaceData(
    marketplaceParams,
    {
      enabled: true, // Enable for both marketplace and stores space
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );

  // Sync SWR page-1 data into accumulatedProducts so pagination can append to it.
  // Only runs when not paginated — page 2+ data is appended manually in handleLoadMore.
  React.useEffect(() => {
    if (isLoading) return;
    if (currentPage > 1) return;
    setAccumulatedProducts(fetchedProducts);
    processedDataRef.current = new Set(fetchedProducts.map(p => p.id));
    setLocalHasMore(null); // reset so hasMore re-reads from fresh SWR response
  }, [fetchedProducts, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only use server-prefetched products when the view is in its default state —
  // no filters, no search, default mode. This prevents flash when a user arrives
  // with URL params that differ from what the server fetched.
  const canUseInitialProducts =
    !!initialProducts?.length &&
    viewMode === 'all' &&
    !isStoresView &&
    !searchQuery &&
    !selectedLevel1 &&
    advancedFilters.condition === 'all' &&
    !advancedFilters.minPrice &&
    !advancedFilters.maxPrice;

  // For page 1: SWR data when available, otherwise fall back to server-prefetched products.
  // For page 2+: render from accumulatedProducts which contains all appended pages.
  const products =
    currentPage === 1
      ? fetchedProducts.length > 0
        ? fetchedProducts
        : canUseInitialProducts
        ? initialProducts!
        : []
      : accumulatedProducts;

  // Only show the skeleton when there is genuinely no data yet (SWR loading AND no
  // server-prefetched products to fall back to).
  const loading = isLoading && products.length === 0;
  // localHasMore tracks whether the last paginated fetch returned more pages.
  // null = not yet paginated (fall back to SWR's first-page value).
  const [localHasMore, setLocalHasMore] = React.useState<boolean | null>(null);
  const hasMore = localHasMore ?? (pagination?.hasMore ?? initialPagination?.hasMore ?? false);
  const totalCount = pagination?.total ?? initialPagination?.total ?? 0;

  // Resolve the currently selected store object (for identity strip)
  const selectedStore = React.useMemo(
    () => (selectedStoreId ? stores.find(s => s.id === selectedStoreId) ?? null : null),
    [selectedStoreId, stores]
  );

  // Featured store for the Bike Stores tab (shown when browsing all stores)
  const featuredStore = React.useMemo(
    () => stores.find(s => s.store_name?.toLowerCase().includes('ashburton')) ?? null,
    [stores]
  );

  // Derive marketplace category pills from the currently loaded products
  const marketplaceCategories = React.useMemo(() => {
    if (!products?.length) return [];
    const categoryMap = new Map<string, number>();
    products.forEach(product => {
      const cat = product.marketplace_category;
      if (cat) categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    });
    return Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([level1]) => ({ label: level1, level1 }));
  }, [products]);

  // Derive store categories from fetched products (zero API calls - instant)
  const storeCategories = React.useMemo(() => {
    if (!selectedStoreId || !products?.length) return [];
    
    const categoryMap = new Map<string, number>();
    products.forEach(product => {
      const cat = product.marketplace_category;
      if (cat) {
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
      }
    });
    
    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedStoreId, products]);

  // Filter products by selected store category (client-side, instant)
  const displayProducts = React.useMemo(() => {
    if (!selectedStoreCategory || !isStoresView) return products;
    return products.filter(p => p.marketplace_category === selectedStoreCategory);
  }, [products, selectedStoreCategory, isStoresView]);

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

  // Update URL when filters change (excluding space - that's handled by useMarketplaceSpace)
  React.useEffect(() => {
    // Don't update URL for stores - space navigation handles that
    if (isStoresView) return;
    
    const params = new URLSearchParams(window.location.search);
    
    // Handle product view modes
    if (viewMode !== 'trending' && viewMode !== 'all') {
      params.set('view', viewMode);
    } else {
      params.delete('view');
    }
    
    if (selectedLevel1) params.set('level1', selectedLevel1);
    else params.delete('level1');
    
    if (selectedLevel2) params.set('level2', selectedLevel2);
    else params.delete('level2');
    
    if (selectedLevel3) params.set('level3', selectedLevel3);
    else params.delete('level3');
    
    if (searchQuery) params.set('search', searchQuery);
    else params.delete('search');

    const newUrl = params.toString()
      ? `/marketplace?${params.toString()}`
      : '/marketplace';

    startTransition(() => {
      router.replace(newUrl, { scroll: false });
    });
  }, [viewMode, selectedLevel1, selectedLevel2, selectedLevel3, searchQuery, isStoresView, router]);

  const [isPaginating, setIsPaginating] = React.useState(false);

  const handleLoadMore = async () => {
    if (isValidating || isPaginating || !hasMore) return;
    setIsPaginating(true);

    const nextPage = currentPage + 1;
    // Snapshot page-1 data before the async fetch in case the effect hasn't seeded
    // accumulatedProducts yet (effect fires after render; user may click Load More before it runs).
    const baseProducts = accumulatedProducts.length > 0 ? accumulatedProducts : fetchedProducts;
    console.log('[MARKETPLACE] Loading more products, page:', nextPage);
    
    try {
      // Build the URL for the next page
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('pageSize', String(MARKETPLACE_INITIAL_PAGE_SIZE));
      
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
      } else if (listingTypeFilter === 'stores') {
        if (selectedLevel1) params.set('level1', selectedLevel1);
        if (selectedLevel2) params.set('level2', selectedLevel2);
        if (selectedLevel3) params.set('level3', selectedLevel3);
        endpoint = `/api/marketplace/products?${params}`;
      } else {
        switch (viewMode) {
          case 'trending':
            params.delete('pageSize');
            params.set('limit', String(MARKETPLACE_INITIAL_PAGE_SIZE));
            if (selectedLevel1) {
              params.delete('level1');
              params.set('category', selectedLevel1);
            }
            endpoint = `/api/marketplace/trending?${params}`;
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
      
      // Add new products to accumulated list, deduplicating against already-seen IDs
      const newFiltered = newProducts.filter((p: any) => !processedDataRef.current.has(p.id));
      console.log('[MARKETPLACE] Adding', newFiltered.length, 'new products (filtered duplicates)');
      newFiltered.forEach((p: any) => processedDataRef.current.add(p.id));
      setAccumulatedProducts([...baseProducts, ...newFiltered]);
      setCurrentPage(nextPage);
      
      // Update local hasMore from this page's pagination response
      if (data.pagination) {
        setLocalHasMore(data.pagination.hasMore ?? false);
      } else {
        // No pagination info — assume no more pages if we got fewer than a full page
        setLocalHasMore(newProducts.length >= MARKETPLACE_INITIAL_PAGE_SIZE);
      }
    } catch (error) {
      console.error('[MARKETPLACE] Error loading more products:', error);
    } finally {
      setIsPaginating(false);
    }
  };

  // Infinite scroll — re-observe whenever the ability to load more changes
  React.useEffect(() => {
    const el = bottomSentinelRef.current;
    if (!el || !hasMore || isPaginating || isValidating || searchQuery) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 0, rootMargin: '300px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, isPaginating, isValidating, searchQuery]);

  const handleViewModeChange = (mode: ViewMode) => {
    // Don't reset if clicking the same tab and already in marketplace
    if (mode === viewMode && !isStoresView) return;

    // Wrap all state updates in startTransition so the expensive re-render
    // (effects, SWR rekey, URL sync) is non-blocking. The tab bar shows the
    // new active state immediately via its own optimistic local state.
    startTransition(() => {
      setCurrentPage(1);
      if (isStoresView) setSpace('marketplace');
      setViewMode(mode);
      if (mode === "trending") {
        setSelectedLevel1(null);
        setSelectedLevel2(null);
        setSelectedLevel3(null);
      }
    });

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
    setLocalHasMore(null); // fall back to SWR for the fresh query
    
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
      {/* Main header - always rendered so modals remain accessible */}
      <MarketplaceHeader 
        compactSearchOnMobile 
        showFloatingButton 
        showSpaceNavigator
        currentSpace={currentSpace}
        onSpaceChange={setSpace}
        isNavigating={isNavigating}
        showStickyFilters={showStickyFilters}
        showMobileBrowseFiltersFab={isMarketplaceView && viewMode === "all"}
        mobileBrowseFiltersBadge={activeFilterCount}
        onOpenMobileBrowseFilters={() => setMobileBrowseSheetOpen(true)}
      />

      {/* Sticky Filter Header - Mobile Only (appears when category pills scroll out) */}
      <AnimatePresence>
        {showStickyFilters && ((isMarketplaceView && viewMode === 'all') || isStoresView) && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="sm:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-md"
          >
            {/* Navigation Loading Bar */}
            <AnimatePresence>
              {isNavigating && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-0 left-0 right-0 h-1 bg-[#ffde59] overflow-hidden"
                >
                  {/* Animated shimmer effect */}
                  <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "200%" }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.2,
                      ease: "easeInOut",
                    }}
                    className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                  />
                  {/* Indeterminate progress animation */}
                  <motion.div
                    initial={{ left: "-40%", width: "40%" }}
                    animate={{ left: "100%", width: "40%" }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                    className="absolute inset-y-0 bg-[#f0cf45]"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            {/* Top Row - Filters Button */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
              {/* Space label - Marketplace or Bike Stores */}
              {isStoresView ? (
                <Image 
                  src="/bikestores.svg" 
                  alt="Bike Stores" 
                  width={120} 
                  height={28}
                  className="h-7 w-auto"
                  priority
                  unoptimized
                />
              ) : (
                <Image 
                  src="/marketplace.svg" 
                  alt="Marketplace" 
                  width={120} 
                  height={28}
                  className="h-7 w-auto"
                  priority
                  unoptimized
                />
              )}

              {/* All Filters Button */}
              <AdvancedFilters
                filters={advancedFilters}
                onFiltersChange={handleAdvancedFiltersChange}
                onApply={handleAdvancedFiltersApply}
                onReset={handleAdvancedFiltersReset}
                activeFilterCount={activeFilterCount}
                listingTypeFilter={listingTypeFilter}
                onListingTypeChange={handleListingTypeChange}
                variant="compact"
              />
            </div>

            {/* Bottom Row - Scrollable Quick Filters */}
            <div className="flex items-center gap-2 px-3 pb-2.5 overflow-x-auto scrollbar-hide">
              {/* Price Pills */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                {[
                  { id: 'under50', label: '<$50' },
                  { id: '50-100', label: '$50-100' },
                  { id: '100-250', label: '$100-250' },
                  { id: '250plus', label: '$250+' },
                ].map((price) => (
                  <button
                    key={price.id}
                    onClick={() => handleQuickPriceChange(quickPriceRange === price.id ? null : price.id)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-full border transition-all whitespace-nowrap",
                      quickPriceRange === price.id
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {price.label}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

              {/* Recently Added Pills */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                {[
                  { id: '24h', label: '24h' },
                  { id: '7d', label: '7 days' },
                  { id: '30d', label: '30 days' },
                ].map((time) => (
                  <button
                    key={time.id}
                    onClick={() => handleRecentlyAddedChange(recentlyAdded === time.id ? null : time.id)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-full border transition-all whitespace-nowrap",
                      recentlyAdded === time.id
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {time.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MarketplaceLayout showFooter={false} showStoreCTA={false}>
        {/* Mobile: promo above Hot / Browse / Stores, then sticky tabs + category pills */}
        <div className="sm:hidden bg-white pt-14">
          {MARKETPLACE_PROMO_BANNERS_ENABLED &&
            (isMarketplaceView || isStoresView) &&
            !searchQuery && (
            <div className="px-3 pt-1 pb-1">
              <PromoBannerCarousel
                hasListings={listingCount > 0}
                isLoggedIn={!!user}
                onNavigateToStores={() => setSpace("stores")}
              />
            </div>
          )}
          <div className="sticky top-14 z-30 bg-white border-b border-gray-100 shadow-sm">
            <UnifiedFilterBar
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              selectedLevel1={selectedLevel1}
              selectedLevel2={selectedLevel2}
              selectedLevel3={selectedLevel3}
              onLevel1Change={handleLevel1Change}
              onLevel2Change={handleLevel2Change}
              onLevel3Change={handleLevel3Change}
              listingTypeFilter={listingTypeFilter}
              onListingTypeChange={handleListingTypeChange}
              productCount={!searchQuery && !isStoresView ? totalCount : undefined}
              categoryPillsRef={categoryPillsRef}
              onNavigateToStores={handleNavigateToAllStores}
              selectedStoreId={selectedStoreId}
              onStoreSelect={handleNavigateToStore}
              browseFilters={advancedFilters}
              onBrowseFiltersChange={handleAdvancedFiltersChange}
              onBrowseFiltersApply={handleAdvancedFiltersApply}
              onBrowseFiltersReset={handleAdvancedFiltersReset}
              productGridLayout={productGridLayout}
              onProductGridLayoutChange={setProductGridLayout}
              dynamicCategories={marketplaceCategories}
              categoriesLoading={loading}
              mobileBrowseSheetOpen={mobileBrowseSheetOpen}
              onMobileBrowseSheetOpenChange={setMobileBrowseSheetOpen}
            />
            {isStoresView && selectedStoreId && storeCategories.length > 0 && (
              <div className="px-3 pt-2 pb-2.5">
                <AnimatePresence>
                  <StoreCategoryPills
                    categories={storeCategories}
                    selectedCategory={selectedStoreCategory}
                    onCategoryChange={setSelectedStoreCategory}
                  />
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
        {/* Sentinel div for scroll tracking - invisible marker */}
        <div ref={sentinelRef} className="sm:hidden h-px" aria-hidden="true" />

        <div className="px-3 sm:px-6 py-4 sm:py-8 pt-4 sm:pt-20 pb-24 sm:pb-8">
          <div className="space-y-4">
            {/* Promo Banners - Marketplace and Bike Stores (hidden while searching) */}
            {MARKETPLACE_PROMO_BANNERS_ENABLED &&
              (isMarketplaceView || isStoresView) &&
              !searchQuery && (
              <div className="hidden sm:block">
                <PromoBannerCarousel
                  hasListings={listingCount > 0}
                  isLoggedIn={!!user}
                  onNavigateToStores={() => setSpace("stores")}
                />
              </div>
            )}

            {/* Stores View - Products from Stores with Store Filter */}
            {isStoresView && (
              <div className="space-y-3 sm:space-y-4">
                {/* Desktop: main tabs + store pills grouped tightly */}
                <div className="hidden sm:block space-y-2.5">
                  <UnifiedFilterBar
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    selectedLevel1={selectedLevel1}
                    selectedLevel2={selectedLevel2}
                    selectedLevel3={selectedLevel3}
                    onLevel1Change={handleLevel1Change}
                    onLevel2Change={handleLevel2Change}
                    onLevel3Change={handleLevel3Change}
                    listingTypeFilter={listingTypeFilter}
                    onListingTypeChange={handleListingTypeChange}
                    productCount={!searchQuery ? totalCount : undefined}
                    categoryPillsRef={categoryPillsRef}
                    onNavigateToStores={handleNavigateToAllStores}
                    selectedStoreId={selectedStoreId}
                    onStoreSelect={handleNavigateToStore}
                    browseFilters={advancedFilters}
                    onBrowseFiltersChange={handleAdvancedFiltersChange}
                    onBrowseFiltersApply={handleAdvancedFiltersApply}
                    onBrowseFiltersReset={handleAdvancedFiltersReset}
                    productGridLayout={productGridLayout}
                    onProductGridLayoutChange={setProductGridLayout}
                    dynamicCategories={marketplaceCategories}
                    categoriesLoading={loading}
                    additionalFilters={
                      <AdvancedFilters
                        filters={advancedFilters}
                        onFiltersChange={handleAdvancedFiltersChange}
                        onApply={handleAdvancedFiltersApply}
                        onReset={handleAdvancedFiltersReset}
                        activeFilterCount={activeFilterCount}
                        listingTypeFilter={listingTypeFilter}
                        onListingTypeChange={handleListingTypeChange}
                      />
                    }
                  />
                  <AnimatePresence>
                    {selectedStoreId && storeCategories.length > 0 && (
                      <StoreCategoryPills
                        categories={storeCategories}
                        selectedCategory={selectedStoreCategory}
                        onCategoryChange={setSelectedStoreCategory}
                      />
                    )}
                  </AnimatePresence>
                </div>

                {/* Store identity strip — shown when a specific store is selected */}
                {selectedStore && (
                  <div className="flex items-center justify-between gap-3 px-0.5">
                    <button
                      type="button"
                      onClick={() => router.push(`/marketplace/store/${selectedStore.id}`)}
                      className="flex items-center gap-2.5 min-w-0 group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      {selectedStore.logo_url ? (
                        <div className="relative h-8 w-8 rounded-full overflow-hidden border border-gray-200 flex-shrink-0 shadow-sm">
                          <Image
                            src={selectedStore.logo_url}
                            alt={selectedStore.store_name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                          <StoreIcon className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:underline">{selectedStore.store_name}</p>
                        {totalCount > 0 && (
                          <p className="text-xs text-gray-500">{totalCount.toLocaleString()} products</p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={handleNavigateToAllStores}
                      className="text-xs text-gray-500 hover:text-gray-700 underline flex-shrink-0"
                    >
                      All stores
                    </button>
                  </div>
                )}

                {/* Featured Stores — same identity-strip design as a selected store (no store selected) */}
                {!selectedStoreId && featuredStore && (
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-semibold text-gray-900">Featured stores</h3>
                    <button
                      type="button"
                      onClick={() => router.push(`/marketplace/store/${featuredStore.id}`)}
                      className="flex items-center gap-2.5 min-w-0 group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      {featuredStore.logo_url ? (
                        <div className="relative h-8 w-8 rounded-full overflow-hidden border border-gray-200 flex-shrink-0 shadow-sm">
                          <Image
                            src={featuredStore.logo_url}
                            alt={featuredStore.store_name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                          <StoreIcon className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:underline">{featuredStore.store_name}</p>
                        {featuredStore.product_count > 0 && (
                          <p className="text-xs text-gray-500">{featuredStore.product_count.toLocaleString()} products</p>
                        )}
                      </div>
                    </button>
                  </div>
                )}

                {/* Advanced Filters for Stores - Mobile only (desktop has it in filter bar) */}
                <div className="flex justify-end sm:hidden">
                  <AdvancedFilters
                    filters={advancedFilters}
                    onFiltersChange={handleAdvancedFiltersChange}
                    onApply={handleAdvancedFiltersApply}
                    onReset={handleAdvancedFiltersReset}
                    activeFilterCount={activeFilterCount}
                    listingTypeFilter={listingTypeFilter}
                    onListingTypeChange={handleListingTypeChange}
                  />
                </div>
              </div>
            )}

            {/* Products View - Shown for both Marketplace and Stores space */}
            {(
              <>
                {/* Desktop Filter Bar - View modes, categories - Only for Marketplace space */}
                {isMarketplaceView && (
                  <div className="hidden sm:block">
                    <UnifiedFilterBar
                      viewMode={viewMode}
                      onViewModeChange={handleViewModeChange}
                      selectedLevel1={selectedLevel1}
                      selectedLevel2={selectedLevel2}
                      selectedLevel3={selectedLevel3}
                      onLevel1Change={handleLevel1Change}
                      onLevel2Change={handleLevel2Change}
                      onLevel3Change={handleLevel3Change}
                      listingTypeFilter={listingTypeFilter}
                      onListingTypeChange={handleListingTypeChange}
                      productCount={!searchQuery ? totalCount : undefined}
                      categoryPillsRef={categoryPillsRef}
                      onNavigateToStores={handleNavigateToAllStores}
                      selectedStoreId={selectedStoreId}
                      onStoreSelect={handleNavigateToStore}
                      browseFilters={advancedFilters}
                      onBrowseFiltersChange={handleAdvancedFiltersChange}
                      onBrowseFiltersApply={handleAdvancedFiltersApply}
                      onBrowseFiltersReset={handleAdvancedFiltersReset}
                      productGridLayout={productGridLayout}
                      onProductGridLayoutChange={setProductGridLayout}
                      dynamicCategories={marketplaceCategories}
                      categoriesLoading={loading}
                      additionalFilters={
                        <AdvancedFilters
                          filters={advancedFilters}
                          onFiltersChange={handleAdvancedFiltersChange}
                          onApply={handleAdvancedFiltersApply}
                          onReset={handleAdvancedFiltersReset}
                          activeFilterCount={activeFilterCount}
                          listingTypeFilter={listingTypeFilter}
                          onListingTypeChange={handleListingTypeChange}
                        />
                      }
                    />
                  </div>
                )}

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

                {/* Split Search Results - Shows both Stores and Marketplace sections */}
                {searchQuery && (
                  <SplitSearchResults
                    searchQuery={searchQuery}
                    onClearSearch={handleClearSearch}
                    isAdmin={isAdmin}
                    onNavigate={() => setIsNavigating(true)}
                    onImageDiscoveryClick={(productId, productName) => {
                      setImageDiscoveryModal({
                        isOpen: true,
                        productId,
                        productName,
                      });
                    }}
                  />
                )}

                {!searchQuery && (loading || displayProducts.length > 0) && (
                  <div className="min-h-0">
                    {loading ? (
                      <div className="space-y-3">
                        {isStoresView && selectedStore && (
                          <p className="text-sm text-gray-500 px-0.5">
                            Loading {selectedStore.store_name}…
                          </p>
                        )}
                        <div
                          className={
                            productGridLayout === "grid8"
                              ? "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1 sm:gap-1.5"
                              : productGridLayout === "grid4"
                              ? "grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4"
                              : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3"
                          }
                        >
                          {Array.from({
                            length: isStoresView ? 12 : 36,
                          }).map((_, i) => (
                            <ProductCardSkeleton key={i} layout="grid" />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          productGridLayout === "grid8"
                            ? "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1 sm:gap-1.5"
                            : productGridLayout === "grid4"
                            ? "grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4"
                            : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 sm:gap-3",
                        )}
                      >
                        {displayProducts.map((product, index) => (
                          <React.Fragment key={product.id}>
                            <ProductCard
                              product={product}
                              priority={index < 18}
                              layout="grid"
                              compact={productGridLayout === "grid8"}
                              isAdmin={isAdmin}
                              onNavigate={() => setIsNavigating(true)}
                              onImageDiscoveryClick={(productId) => {
                                const canonicalId = product.canonical_product_id || product.id;
                                setImageDiscoveryModal({
                                  isOpen: true,
                                  productId: canonicalId,
                                  productName: (product as any).display_name || product.description,
                                });
                              }}
                            />
                            {MARKETPLACE_PROMO_BANNERS_ENABLED &&
                              index === 11 &&
                              isMarketplaceView && (
                              <div>
                                <ListItemBanner className="sm:hidden" />
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                  {!searchQuery && !loading && products.length === 0 && (
                    <div className="bg-white rounded-md border border-gray-200 p-12 text-center">
                      {isStoresView ? (
                        <>
                          <StoreIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            No shop products to show yet
                          </h3>
                          <p className="text-gray-600 max-w-md mx-auto mb-6">
                            {selectedStoreId
                              ? "This store has no visible inventory in the marketplace right now. Try all stores or check back soon."
                              : "There are no bike shop products listed yet, or filters are hiding results. Try clearing filters or browse private listings."}
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            {(selectedStoreId || selectedStoreCategory) && (
                              <Button
                                onClick={() => {
                                  setSelectedStoreId(null);
                                  setSelectedStoreCategory(null);
                                  setAccumulatedProducts([]);
                                  processedDataRef.current = new Set();
                                  setCurrentPage(1);
                                }}
                                variant="outline"
                                className="rounded-md"
                              >
                                Clear store filters
                              </Button>
                            )}
                            <Button
                              onClick={() => setSpace("marketplace")}
                              className="rounded-md bg-[#ffde59] hover:bg-[#f0cf45] text-gray-900 font-medium"
                            >
                              Back to marketplace
                            </Button>
                          </div>
                        </>
                      ) : viewMode === "trending" ? (
                        <>
                          <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            No trending items from private sellers
                          </h3>
                          <p className="text-gray-600 max-w-md mx-auto mb-6">
                            {selectedLevel1
                              ? `No trending ${selectedLevel1.toLowerCase()} items from private sellers right now. Try browsing all listings or check back soon!`
                              : "Popular items from private sellers will appear here. Browse all listings or check back soon!"}
                          </p>
                          <Button
                            onClick={() => setViewMode("all")}
                            className="rounded-md bg-[#ffde59] hover:bg-[#f0cf45] text-gray-900 font-medium"
                          >
                            Browse All Listings
                          </Button>
                        </>
                      ) : (
                        <>
                          <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            No listings found
                          </h3>
                          <p className="text-gray-600 max-w-md mx-auto mb-6">
                            {selectedLevel1
                              ? `No ${selectedLevel1.toLowerCase()} listings from private sellers available. Try a different category!`
                              : "No listings from private sellers available at the moment."}
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
                    </div>
                  )}

                  {/* Infinite scroll sentinel — sits just below the product grid */}
                  <div ref={bottomSentinelRef} className="h-4" aria-hidden="true" />

                  {/* Skeleton cards while next page loads */}
                  {!searchQuery && isPaginating && displayProducts.length > 0 && (
                    <div className={
                      productGridLayout === "grid8"
                        ? "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1 sm:gap-1.5"
                        : productGridLayout === "grid4"
                        ? "grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4"
                        : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 sm:gap-3"
                    }>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <ProductCardSkeleton key={i} layout="grid" />
                      ))}
                    </div>
                  )}
              </>
            )}
          </div>
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


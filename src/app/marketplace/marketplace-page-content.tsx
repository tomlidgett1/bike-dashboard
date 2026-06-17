"use client";

import * as React from "react";
import { Suspense, startTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { TrendingUp, Package, X, Search, Store as StoreIcon, User, Clock, DollarSign, SlidersHorizontal, Loader2 } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductCard, ProductCardSkeleton } from "@/components/marketplace/product-card";
import { ListItemBannerSlot } from "@/components/marketplace/list-item-banner";
import { UnifiedFilterBar, ViewMode, ListingTypeFilter as ListingTypeFilterType } from "@/components/marketplace/unified-filter-bar";
import { SpaceNavigator, useMarketplaceSpace } from "@/components/marketplace/space-navigator";
import { ForYouFeedView, ForYouFeedSkeletonBody } from "@/app/for-you/for-you-content";
import type { ForYouFeedPayload } from "@/lib/for-you/types";
import { StoreCategoryPills } from "@/components/marketplace/store-category-pills";
import type { MarketplaceSpace } from "@/lib/types/marketplace";
import { AdvancedFilters, DEFAULT_ADVANCED_FILTERS, countActiveFilters, type AdvancedFiltersState } from "@/components/marketplace/advanced-filters";
import { ImageDiscoveryModal } from "@/components/marketplace/image-discovery-modal";
import { PromoBannerCarousel } from "@/components/marketplace/promo-banner-carousel";
import { useUserVouchers } from "@/lib/hooks/use-user-vouchers";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/components/providers/auth-provider";
import { useInteractionTracker } from "@/lib/tracking/interaction-tracker";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { useMarketplaceData, useLightspeedCategories } from "@/lib/hooks/use-marketplace-data";
import { MARKETPLACE_PROMO_BANNERS_ENABLED } from "@/lib/marketplace-feature-flags";
import { MARKETPLACE_INITIAL_PAGE_SIZE } from "@/lib/marketplace-constants";
import { saveStoreSplashSeed } from "@/lib/marketplace/store-splash";
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

interface MarketplaceProductsPayload {
  products?: MarketplaceProduct[];
  recommendations?: MarketplaceProduct[];
  pagination?: {
    hasMore?: boolean;
    nextCursor?: {
      createdAt: string;
      id: string;
    } | null;
  };
}

interface MarketplacePageContentProps {
  /** Products pre-fetched server-side for immediate first paint. */
  initialProducts?: MarketplaceProduct[];
  /** Pagination metadata from the server fetch. */
  initialPagination?: InitialMarketplacePagination;
}

const EMPTY_FOR_YOU_FEED: ForYouFeedPayload = {
  feedId: "",
  carousels: [],
  moreProducts: [],
  personalised: false,
  source: "deterministic",
  generatedAt: "",
  enhanceable: false,
};

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
  const isUberView = currentSpace === 'uber';
  const isMarketplaceView = currentSpace === 'marketplace';
  const isForYouView = currentSpace === 'for-you';
  const isStoreInventoryView = isStoresView || isUberView;

  const [forYouFeed, setForYouFeed] = React.useState<ForYouFeedPayload | null>(null);

  React.useEffect(() => {
    if (!isForYouView || forYouFeed) return;

    let active = true;
    fetch("/api/for-you/feed")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (data?.success && data.feed?.carousels) {
          setForYouFeed(data.feed as ForYouFeedPayload);
        } else {
          setForYouFeed(EMPTY_FOR_YOU_FEED);
        }
      })
      .catch(() => {
        if (active) setForYouFeed(EMPTY_FOR_YOU_FEED);
      });

    return () => {
      active = false;
    };
  }, [isForYouView, forYouFeed]);

  // View mode state (trending, all) - only for products view
  // Default to 'all' for browsing all products
  const urlView = searchParams.get("view");
  const [viewMode, setViewMode] = React.useState<ViewMode>(() =>
    !isStoreInventoryView ? normaliseMarketplaceViewParam(urlView) : "all"
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
  const isProductSearchActive = Boolean(searchQuery?.trim());

  React.useEffect(() => {
    const urlSearch = searchParams.get('search');
    setSearchQuery(urlSearch || null);
  }, [searchParams]);

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
    if (isStoreInventoryView) {
      if (selectedLevel1 !== null) setSelectedLevel1(null);
      if (selectedLevel2 !== null) setSelectedLevel2(null);
      if (selectedLevel3 !== null) setSelectedLevel3(null);
    } else {
      // On Products view, sync state with URL params
      if (urlLevel1 !== selectedLevel1) setSelectedLevel1(urlLevel1);
      if (urlLevel2 !== selectedLevel2) setSelectedLevel2(urlLevel2);
      if (urlLevel3 !== selectedLevel3) setSelectedLevel3(urlLevel3);
    }
  }, [searchParams, isStoreInventoryView]);

  // Listing type filter state - derived from space
  // Marketplace space = individuals only, Stores space = stores only
  const spaceListingType = React.useMemo((): ListingTypeFilterType => {
    if (isStoreInventoryView) return 'stores';
    if (isMarketplaceView) return 'individuals';
    return 'all';
  }, [isStoreInventoryView, isMarketplaceView]);
  
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
    const filtersAvailable = (isMarketplaceView || isStoreInventoryView) && viewMode === "all";
    if (!filtersAvailable) {
      setMobileBrowseSheetOpen(false);
    }
  }, [isMarketplaceView, isStoreInventoryView, viewMode]);

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
    if (!isMobile || (viewMode !== 'all' && !isStoreInventoryView)) {
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
  }, [isMobile, viewMode, isStoreInventoryView]);

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

  const handleNavigateToUber = React.useCallback(() => {
    setSelectedStoreId(null);
    setSelectedStoreCategory(null);
    resetProductsForFilterChange();
    router.push("/marketplace?space=uber", { scroll: false });
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

  // Store inventory spaces always use the browse/products index, not trending — keeps filterKey and fetchers aligned.
  React.useEffect(() => {
    if (isStoreInventoryView && viewMode !== "all") {
      setViewMode("all");
    }
  }, [isStoreInventoryView, viewMode]);

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

  const resolvedListingType = React.useMemo((): 'store_inventory' | 'private_listing' | undefined => {
    if (isProductSearchActive) {
      if (isStoreInventoryView || isUberView) return 'store_inventory';
      if (isMarketplaceView) return undefined;
    }
    if (listingTypeFilter === 'stores') return 'store_inventory';
    if (listingTypeFilter === 'individuals') return 'private_listing';
    return undefined;
  }, [
    isProductSearchActive,
    isStoreInventoryView,
    isUberView,
    isMarketplaceView,
    listingTypeFilter,
  ]);

  // Create stable params object - DON'T include page in SWR key for pagination
  const marketplaceParams = React.useMemo(() => ({
    viewMode,
    page: 1,
    pageSize: MARKETPLACE_INITIAL_PAGE_SIZE,
    // Stores tab uses category_name (Lightspeed); marketplace tab uses marketplace_category
    level1: isProductSearchActive ? null : isStoreInventoryView ? null : selectedLevel1,
    level2: isProductSearchActive ? null : selectedLevel2,
    level3: isProductSearchActive ? null : selectedLevel3,
    lsCategory: isProductSearchActive ? null : isStoreInventoryView ? selectedLevel1 : null,
    search: searchQuery,
    listingType: resolvedListingType,
    storeId: selectedStoreId,
    minPrice: advancedFilters.minPrice || null,
    maxPrice: advancedFilters.maxPrice || null,
    condition: advancedFilters.condition !== 'all' ? advancedFilters.condition : null,
    sortBy: advancedFilters.sortBy,
    brand: advancedFilters.brand || null,
    createdAfter: createdAfter,
    uberOnly: isUberView,
  }), [
    isStoreInventoryView,
    isUberView,
    isProductSearchActive,
    viewMode,
    selectedLevel1,
    selectedLevel2,
    selectedLevel3,
    searchQuery,
    resolvedListingType,
    selectedStoreId,
    advancedFilters,
    createdAfter,
  ]);

  // Only seed SWR with server-prefetched products in the default public view.
  // We still revalidate on mount so recently deactivated listings disappear
  // quickly after navigating back from owner/settings screens.
  const canUseInitialProducts =
    !!initialProducts?.length &&
    viewMode === 'all' &&
    !isStoreInventoryView &&
    !searchQuery &&
    !selectedLevel1 &&
    advancedFilters.condition === 'all' &&
    !advancedFilters.minPrice &&
    !advancedFilters.maxPrice;

  // Use SWR for products data with intelligent caching
  const { 
    products: fetchedProducts, 
    pagination, 
    isLoading, 
    isValidating 
  } = useMarketplaceData(
    marketplaceParams,
    {
      enabled: !isForYouView, // For You has its own feed; skip product queries
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      fallbackData: canUseInitialProducts && initialPagination
        ? {
            products: initialProducts ?? [],
            pagination: initialPagination,
            success: true,
          }
        : undefined,
      revalidateOnMount: canUseInitialProducts ? true : undefined,
    }
  );

  // Sync SWR page-1 data into accumulatedProducts so pagination can append to it.
  // Only runs when not paginated — page 2+ data is appended manually in handleLoadMore.
  React.useEffect(() => {
    if (isLoading) return;
    if (currentPage > 1) return;
    setAccumulatedProducts((prev) => {
      if (
        prev.length === fetchedProducts.length &&
        prev.every((product, index) => product.id === fetchedProducts[index]?.id)
      ) {
        return prev;
      }

      return fetchedProducts;
    });
    processedDataRef.current = new Set(fetchedProducts.map(p => p.id));
    setLocalHasMore(null); // reset so hasMore re-reads from fresh SWR response
    setLocalNextCursor(null); // reset so cursor re-reads from fresh SWR response
  }, [fetchedProducts, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [localNextCursor, setLocalNextCursor] = React.useState<{
    createdAt: string;
    id: string;
  } | null>(null);
  const hasMore = localHasMore ?? (pagination?.hasMore ?? initialPagination?.hasMore ?? false);
  const nextCursor = localNextCursor ?? pagination?.nextCursor ?? initialPagination?.nextCursor ?? null;
  const totalCount = pagination?.total ?? initialPagination?.total ?? 0;

  const productGridClassName = React.useMemo(() => {
    if (isProductSearchActive) {
      return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-1 sm:gap-3 md:gap-4";
    }
    if (productGridLayout === "grid8") {
      return "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-0.5 sm:gap-1.5";
    }
    if (productGridLayout === "grid4") {
      return isStoresView
        ? "grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-4"
        : "grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-4";
    }
    return isStoresView
      ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-0.5 sm:gap-2.5"
      : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-0.5 sm:gap-3";
  }, [isProductSearchActive, productGridLayout, isStoresView]);

  React.useEffect(() => {
    setCurrentPage(1);
    setAccumulatedProducts([]);
    processedDataRef.current = new Set();
    setLocalHasMore(null);
    setLocalNextCursor(null);
  }, [searchQuery]);

  // Resolve the currently selected store object (for identity strip)
  const selectedStore = React.useMemo(
    () => (selectedStoreId ? stores.find(s => s.id === selectedStoreId) ?? null : null),
    [selectedStoreId, stores]
  );

  // Derive marketplace category pills from the currently loaded products
  const marketplaceCategories = React.useMemo(() => {
    if (isStoreInventoryView || !products?.length) return [];
    const categoryMap = new Map<string, number>();
    products.forEach(product => {
      const cat = product.marketplace_category;
      if (cat) categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    });
    return Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([level1]) => ({ label: level1, level1 }));
  }, [isStoreInventoryView, products]);

  // Bike Stores tab category pills — fetched from dedicated public API,
  // same data source as the Lightspeed category_name field on products.
  const { categories: storesViewCategories, isLoading: storesViewCategoriesLoading } = useLightspeedCategories(isUberView, isStoreInventoryView);

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
    if (!selectedStoreCategory || !isStoresView || isProductSearchActive) return products;
    return products.filter(p => p.marketplace_category === selectedStoreCategory);
  }, [products, selectedStoreCategory, isStoresView, isProductSearchActive]);

  const gridProducts = displayProducts;

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
    if (isStoreInventoryView) return;
    
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
  }, [viewMode, selectedLevel1, selectedLevel2, selectedLevel3, searchQuery, isStoreInventoryView, router]);

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
      if (!searchQuery && advancedFilters.sortBy === 'newest' && nextCursor) {
        params.set('cursorCreatedAt', nextCursor.createdAt);
        params.set('cursorId', nextCursor.id);
      }
      
      if (listingTypeFilter === 'stores') {
        params.set('listingType', 'store_inventory');
      } else if (listingTypeFilter === 'individuals') {
        params.set('listingType', 'private_listing');
      }

      if (isUberView) {
        params.set('uberOnly', 'true');
      }

      if (selectedStoreId) {
        params.set('storeId', selectedStoreId);
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
        if (listingTypeFilter === 'stores') {
          if (selectedLevel1) params.set('lsCategory', selectedLevel1);
        } else {
          if (selectedLevel1) params.set('level1', selectedLevel1);
          if (selectedLevel2) params.set('level2', selectedLevel2);
          if (selectedLevel3) params.set('level3', selectedLevel3);
        }
        endpoint = `/api/marketplace/products?${params}`;
      } else if (listingTypeFilter === 'stores') {
        if (selectedLevel1) params.set('lsCategory', selectedLevel1);
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
      
      const data = (await response.json()) as MarketplaceProductsPayload;
      const newProducts = data.products ?? data.recommendations ?? [];
      
      console.log('[MARKETPLACE] Received products:', newProducts.length);
      
      // Add new products to accumulated list, deduplicating against already-seen IDs
      const newFiltered = newProducts.filter((p) => !processedDataRef.current.has(p.id));
      console.log('[MARKETPLACE] Adding', newFiltered.length, 'new products (filtered duplicates)');
      newFiltered.forEach((p) => processedDataRef.current.add(p.id));
      setAccumulatedProducts([...baseProducts, ...newFiltered]);
      setCurrentPage(nextPage);
      
      // Update local hasMore from this page's pagination response
      if (data.pagination) {
        setLocalHasMore(data.pagination.hasMore ?? false);
        setLocalNextCursor(data.pagination.nextCursor ?? null);
      } else {
        // No pagination info — assume no more pages if we got fewer than a full page
        setLocalHasMore(newProducts.length >= MARKETPLACE_INITIAL_PAGE_SIZE);
        setLocalNextCursor(null);
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
    if (!el || !hasMore || isPaginating || isValidating) return;

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
    if (mode === viewMode && isMarketplaceView) return;

    // Wrap all state updates in startTransition so the expensive re-render
    // (effects, SWR rekey, URL sync) is non-blocking. The tab bar shows the
    // new active state immediately via its own optimistic local state.
    startTransition(() => {
      setCurrentPage(1);
      if (isStoreInventoryView || isForYouView) setSpace('marketplace');
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

  const handleNavigateToStoreProfile = React.useCallback((store: Store) => {
    saveStoreSplashSeed({
      storeId: store.id,
      storeName: store.store_name,
      logoUrl: store.logo_url,
    });
    router.push(`/marketplace/store/${store.id}`);
  }, [router]);

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
        showMobileBrowseFiltersFab={(isMarketplaceView || isStoreInventoryView) && viewMode === "all"}
        mobileBrowseFiltersBadge={activeFilterCount}
        onOpenMobileBrowseFilters={() => setMobileBrowseSheetOpen(true)}
      />

      {/* Sticky Filter Header - Mobile Only (appears when category pills scroll out) */}
      {showStickyFilters && ((isMarketplaceView && viewMode === 'all') || isStoreInventoryView) && (
        <div className="sm:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-md animate-in fade-in slide-in-from-top-4 duration-200">
            {/* Navigation Loading Bar */}
            {isNavigating && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#ffde59] overflow-hidden animate-pulse">
                <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                <div className="absolute inset-y-0 left-1/3 w-1/3 bg-[#f0cf45]" />
              </div>
            )}
            {/* Top Row - Filters Button */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
              {/* Space label - Marketplace, Bike Stores, or Uber */}
              {isStoresView ? (
                <Image 
                  src="/bikestores.svg" 
                  alt="Bike Stores" 
                  width={120} 
                  height={28}
                  className="h-7 w-auto"
                  unoptimized
                />
              ) : isUberView ? (
                <Image
                  src="/uber.png"
                  alt="Uber"
                  width={82}
                  height={28}
                  className="h-6 w-auto"
                  unoptimized
                />
              ) : (
                <Image 
                  src="/marketplace.svg" 
                  alt="Marketplace" 
                  width={120} 
                  height={28}
                  className="h-7 w-auto"
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
          </div>
        )}

      <MarketplaceLayout showFooter={false} showStoreCTA={false}>
        {/* Mobile: promo above tabs, then sticky tabs + category pills */}
        <div className="sm:hidden bg-white">
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
          <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
            <UnifiedFilterBar
              currentSpace={currentSpace}
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
              onNavigateToUber={handleNavigateToUber}
              onNavigateToForYou={() => setSpace("for-you")}
              selectedStoreId={selectedStoreId}
              onStoreSelect={handleNavigateToStore}
              browseFilters={advancedFilters}
              onBrowseFiltersChange={handleAdvancedFiltersChange}
              onBrowseFiltersApply={handleAdvancedFiltersApply}
              onBrowseFiltersReset={handleAdvancedFiltersReset}
              productGridLayout={productGridLayout}
              onProductGridLayoutChange={setProductGridLayout}
              dynamicCategories={isStoreInventoryView ? storesViewCategories : marketplaceCategories}
              categoriesLoading={isStoreInventoryView ? storesViewCategoriesLoading : loading}
              mobileBrowseSheetOpen={mobileBrowseSheetOpen}
              onMobileBrowseSheetOpenChange={setMobileBrowseSheetOpen}
              suppressCategoryBrowse={isProductSearchActive}
            />
            {isStoresView && selectedStoreId && storeCategories.length > 0 && !isProductSearchActive && (
              <div className="px-3 pt-2 pb-2.5">
                <StoreCategoryPills
                  categories={storeCategories}
                  selectedCategory={selectedStoreCategory}
                  onCategoryChange={setSelectedStoreCategory}
                />
              </div>
            )}
          </div>
        </div>
        {/* Sentinel div for scroll tracking - invisible marker */}
        <div ref={sentinelRef} className="sm:hidden h-px" aria-hidden="true" />

        {/* Desktop filter chrome — sits directly under the sticky header */}
        <div className="hidden sm:block border-b border-gray-200 bg-gray-50">
          <div className="space-y-1.5 px-4 py-3 sm:px-6">
            {isStoresView && (
              <>
                <UnifiedFilterBar
                  currentSpace={currentSpace}
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
                  categoryPillsRef={categoryPillsRef}
                  onNavigateToStores={handleNavigateToAllStores}
                  onNavigateToUber={handleNavigateToUber}
                  onNavigateToForYou={() => setSpace("for-you")}
                  selectedStoreId={selectedStoreId}
                  onStoreSelect={handleNavigateToStore}
                  browseFilters={advancedFilters}
                  onBrowseFiltersChange={handleAdvancedFiltersChange}
                  onBrowseFiltersApply={handleAdvancedFiltersApply}
                  onBrowseFiltersReset={handleAdvancedFiltersReset}
                  productGridLayout={productGridLayout}
                  onProductGridLayoutChange={setProductGridLayout}
                  dynamicCategories={storesViewCategories}
                  categoriesLoading={storesViewCategoriesLoading}
                  suppressCategoryBrowse={isProductSearchActive}
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
                {selectedStoreId && storeCategories.length > 0 && !isProductSearchActive && (
                  <StoreCategoryPills
                    categories={storeCategories}
                    selectedCategory={selectedStoreCategory}
                    onCategoryChange={setSelectedStoreCategory}
                  />
                )}
              </>
            )}
            {(isMarketplaceView || isUberView) && (
              <UnifiedFilterBar
                currentSpace={currentSpace}
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
                onNavigateToUber={handleNavigateToUber}
                onNavigateToForYou={() => setSpace("for-you")}
                selectedStoreId={selectedStoreId}
                onStoreSelect={handleNavigateToStore}
                browseFilters={advancedFilters}
                onBrowseFiltersChange={handleAdvancedFiltersChange}
                onBrowseFiltersApply={handleAdvancedFiltersApply}
                onBrowseFiltersReset={handleAdvancedFiltersReset}
                productGridLayout={productGridLayout}
                onProductGridLayoutChange={setProductGridLayout}
                dynamicCategories={isUberView ? storesViewCategories : marketplaceCategories}
                categoriesLoading={isUberView ? storesViewCategoriesLoading : loading}
                suppressCategoryBrowse={isProductSearchActive}
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
            )}
            {isForYouView && (
              <UnifiedFilterBar
                currentSpace={currentSpace}
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
                categoryPillsRef={categoryPillsRef}
                onNavigateToStores={handleNavigateToAllStores}
                onNavigateToUber={handleNavigateToUber}
                onNavigateToForYou={() => setSpace("for-you")}
                selectedStoreId={selectedStoreId}
                onStoreSelect={handleNavigateToStore}
                browseFilters={advancedFilters}
                onBrowseFiltersChange={handleAdvancedFiltersChange}
                onBrowseFiltersApply={handleAdvancedFiltersApply}
                onBrowseFiltersReset={handleAdvancedFiltersReset}
                productGridLayout={productGridLayout}
                onProductGridLayoutChange={setProductGridLayout}
                suppressCategoryBrowse
              />
            )}
          </div>
        </div>

        <div className="px-2 pb-24 sm:px-6 sm:pb-8">
          <div className={isForYouView ? "pt-2 pb-5 sm:pt-3 sm:pb-7" : "space-y-3 pt-4 sm:pt-5"}>
            {isForYouView ? (
              forYouFeed ? (
                <ForYouFeedView initialFeed={forYouFeed} hadIdentity embedded />
              ) : (
                <ForYouFeedSkeletonBody embedded />
              )
            ) : (
              <>
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

            {/* Store identity strip — only when a specific store is selected */}
            {isStoresView && selectedStore && (
              <div className="flex items-center justify-between gap-3 px-0.5">
                <button
                  type="button"
                  onClick={() => handleNavigateToStoreProfile(selectedStore)}
                  className="group flex min-w-0 cursor-pointer items-center gap-2.5 transition-opacity hover:opacity-80"
                >
                  {selectedStore.logo_url ? (
                    <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-gray-200 shadow-sm">
                      <Image
                        src={selectedStore.logo_url}
                        alt={selectedStore.store_name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100">
                      <StoreIcon className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 text-left">
                    <p className="truncate text-sm font-semibold text-gray-900 group-hover:underline">
                      {selectedStore.store_name}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleNavigateToAllStores}
                  className="flex-shrink-0 text-xs text-gray-500 underline hover:text-gray-700"
                >
                  All stores
                </button>
              </div>
            )}

            {/* Products View - Shown for both Marketplace and Stores space */}
            {(
              <>
                {/* Active Advanced Filters Summary */}
                {viewMode === 'all' && activeFilterCount > 0 && !isProductSearchActive && (
                  <div className="flex items-center gap-2 flex-wrap animate-in fade-in slide-in-from-top-2 duration-200">
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
                  </div>
                )}

                <div className="space-y-3">
                    {isProductSearchActive && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-800">
                          <span className="truncate">{searchQuery?.trim()}</span>
                          <button
                            type="button"
                            onClick={handleClearSearch}
                            className="flex-shrink-0 rounded-md p-0.5 text-gray-500 transition-colors hover:bg-gray-200/80 hover:text-gray-800"
                            aria-label="Clear search"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                        <span className="text-sm text-gray-500 tabular-nums">
                          {loading && gridProducts.length === 0
                            ? "Searching…"
                            : `${totalCount > 0 ? totalCount : gridProducts.length} ${
                                (totalCount > 0 ? totalCount : gridProducts.length) === 1
                                  ? "result"
                                  : "results"
                              }`}
                        </span>
                      </div>
                    )}

                    {(loading || gridProducts.length > 0) && (
                      <div className="min-h-0">
                        {loading ? (
                          <div className="space-y-3">
                            {isStoresView && selectedStore && (
                              <p className="text-sm text-gray-500 px-0.5">
                                Loading {selectedStore.store_name}…
                              </p>
                            )}
                            <div className={productGridClassName}>
                              {Array.from({
                                length: isProductSearchActive ? 24 : isStoreInventoryView ? 12 : 36,
                              }).map((_, i) => (
                                <ProductCardSkeleton key={i} layout="grid" />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className={productGridClassName}>
                            {gridProducts.map((product, index) => (
                              <React.Fragment key={product.id}>
                                <ProductCard
                                  product={product}
                                  priority={index < 8}
                                  layout="grid"
                                  compact={!isProductSearchActive && productGridLayout === "grid8"}
                                  isAdmin={isAdmin}
                                  onNavigate={() => setIsNavigating(true)}
                                  onImageDiscoveryClick={(productId) => {
                                    const canonicalId = product.canonical_product_id || product.id;
                                    setImageDiscoveryModal({
                                      isOpen: true,
                                      productId: canonicalId,
                                      productName: product.display_name || product.description,
                                    });
                                  }}
                                />
                                <ListItemBannerSlot
                                  productIndex={index}
                                  productCount={gridProducts.length}
                                />
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isProductSearchActive && !loading && gridProducts.length === 0 && (
                      <div className="rounded-md border border-gray-200 bg-white p-12 text-center">
                        <Search className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                        <h3 className="mb-2 text-xl font-semibold text-gray-900">
                          No matching products
                        </h3>
                        <p className="mx-auto mb-6 max-w-md text-gray-600">
                          Nothing matched “{searchQuery?.trim()}”. Try different keywords or clear the search.
                        </p>
                        <Button
                          onClick={handleClearSearch}
                          className="rounded-md bg-[#ffde59] font-medium text-gray-900 hover:bg-[#f0cf45]"
                        >
                          Clear search
                        </Button>
                      </div>
                    )}

                    {!isProductSearchActive && !loading && products.length === 0 && (
                      <div className="bg-white rounded-md border border-gray-200 p-12 text-center">
                        {isUberView ? (
                          <>
                            <Image
                              src="/uber.png"
                              alt="Uber"
                              width={92}
                              height={36}
                              className="mx-auto mb-5 h-7 w-auto opacity-40"
                              unoptimized
                            />
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                              No Uber delivery products right now
                            </h3>
                            <p className="text-gray-600 max-w-md mx-auto mb-6">
                              {selectedLevel1
                                ? `No Uber-eligible ${selectedLevel1.toLowerCase()} products are visible right now. Try a different category or clear filters.`
                                : "Bike-store products marked for Uber delivery will appear here once they are available."}
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-3">
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
                                  Clear filters
                                </Button>
                              )}
                              <Button
                                onClick={() => setSpace("stores")}
                                className="rounded-md bg-[#ffde59] hover:bg-[#f0cf45] text-gray-900 font-medium"
                              >
                                Browse bike stores
                              </Button>
                            </div>
                          </>
                        ) : isStoresView ? (
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
                    {isPaginating && gridProducts.length > 0 && (
                      <div className={productGridClassName}>
                        {Array.from({ length: 6 }).map((_, i) => (
                          <ProductCardSkeleton key={i} layout="grid" />
                        ))}
                      </div>
                    )}
                </div>
              </>
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

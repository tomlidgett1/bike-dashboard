"use client";

import * as React from 'react';
import useSWR, { preload } from 'swr';
import type { MarketplaceProduct, MarketplaceSpace } from '@/lib/types/marketplace';
import type { ForYouFeedPayload } from '@/lib/for-you/types';
import { MARKETPLACE_INITIAL_PAGE_SIZE } from '@/lib/marketplace-constants';

// ============================================================
// SWR Hook for Marketplace Data - Enterprise Caching
// ============================================================

interface MarketplaceDataParams {
  viewMode: 'trending' | 'all';
  page?: number;
  pageSize?: number;
  level1?: string | null;
  level2?: string | null;
  level3?: string | null;
  search?: string | null;
  listingType?: 'store_inventory' | 'private_listing';
  // Store filter (for stores space)
  storeId?: string | null;
  // Lightspeed category filter (store inventory tab, filters by category_name)
  lsCategory?: string | null;
  // Advanced filters
  minPrice?: string | null;
  maxPrice?: string | null;
  condition?: string | null;
  sortBy?: 'newest' | 'oldest' | 'price_asc' | 'price_desc';
  brand?: string | null;
  // Time filter
  createdAfter?: string | null;
  // Uber delivery feed
  uberOnly?: boolean;
}

interface MarketplaceDataResponse {
  products: MarketplaceProduct[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    nextCursor?: {
      createdAt: string;
      id: string;
    } | null;
  };
  success?: boolean;
}

interface UseMarketplaceDataReturn {
  products: MarketplaceProduct[];
  pagination: MarketplaceDataResponse['pagination'] | null;
  isLoading: boolean;
  isValidating: boolean;
  error: unknown;
  mutate: () => void;
}

const EMPTY_MARKETPLACE_PRODUCTS: MarketplaceProduct[] = [];

// Fetcher function for SWR
const fetcher = async (url: string): Promise<MarketplaceDataResponse> => {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error('Failed to fetch products');
  }

  const data = await response.json();
  
  // Handle different response formats from different endpoints
  return {
    products: data.products || data.recommendations || [],
    pagination: data.pagination || {
      page: 1,
      pageSize: 50,
      total: (data.products || data.recommendations || []).length,
      totalPages: 1,
      hasMore: false,
    },
    success: data.success !== false,
  };
};

// Build API URL based on view mode and filters
function buildApiUrl(params: MarketplaceDataParams): string {
  const {
    viewMode,
    page = 1,
    pageSize = MARKETPLACE_INITIAL_PAGE_SIZE,
    level1,
    level2,
    level3,
    search,
    listingType,
    storeId,
    lsCategory,
    minPrice,
    maxPrice,
    condition,
    sortBy,
    brand,
    createdAfter,
    uberOnly,
  } = params;
  
  let endpoint = '';
  const urlParams = new URLSearchParams();
  urlParams.set('page', String(page));

  // Add listing type filter if specified
  if (listingType) {
    urlParams.set('listingType', listingType);
  }

  // Add store filter if specified (for stores space)
  if (storeId) {
    urlParams.set('storeId', storeId);
  }

  // Add advanced filters
  if (minPrice) urlParams.set('minPrice', minPrice);
  if (maxPrice) urlParams.set('maxPrice', maxPrice);
  if (condition && condition !== 'all') urlParams.set('condition', condition);
  if (sortBy && sortBy !== 'newest') urlParams.set('sortBy', sortBy);
  if (brand) urlParams.set('brand', brand);
  if (createdAfter) urlParams.set('createdAfter', createdAfter);
  if (uberOnly) urlParams.set('uberOnly', 'true');

  // Handle search queries
  if (search) {
    urlParams.set('pageSize', String(pageSize));
    urlParams.set('search', search);
    if (level1) urlParams.set('level1', level1);
    if (level2) urlParams.set('level2', level2);
    if (level3) urlParams.set('level3', level3);
    endpoint = `/api/marketplace/products?${urlParams}`;
  } else if (listingType === 'store_inventory') {
    // Shop inventory uses the same canonical Yellow Jersey L1/L2 filters as
    // private listings. Provider Lightspeed categories remain available via
    // lsCategory for merchant storefront tooling only.
    urlParams.set('pageSize', String(pageSize));
    if (level1) urlParams.set('level1', level1);
    if (level2) urlParams.set('level2', level2);
    if (level3) urlParams.set('level3', level3);
    if (lsCategory) urlParams.set('lsCategory', lsCategory);
    endpoint = `/api/marketplace/products?${urlParams}`;
  } else {
    // Handle different view modes (marketplace / private listings)
    switch (viewMode) {
      case 'trending':
        urlParams.set('limit', String(pageSize));
        if (level1) {
          urlParams.delete('level1');
          urlParams.set('category', level1);
        }
        endpoint = `/api/marketplace/trending?${urlParams}`;
        break;

      case 'all':
        urlParams.set('pageSize', String(pageSize));
        if (level1) urlParams.set('level1', level1);
        if (level2) urlParams.set('level2', level2);
        if (level3) urlParams.set('level3', level3);
        endpoint = `/api/marketplace/products?${urlParams}`;
        break;
    }
  }

  return endpoint;
}

// ============================================================
// Tab prefetching — warm the SWR cache for sibling spaces so
// switching between For You / Browse / Stores / Uber is instant
// (cache hit → no skeleton, no blocking network on tap).
// ============================================================

/** SWR key for the personalised For You feed. */
export const FOR_YOU_FEED_KEY = '/api/for-you/feed';

/** Empty feed used when the For You request fails or returns nothing. */
export const EMPTY_FOR_YOU_FEED: ForYouFeedPayload = {
  feedId: '',
  carousels: [],
  moreProducts: [],
  personalised: false,
  source: 'deterministic',
  generatedAt: '',
  enhanceable: false,
};

/** Fetcher for the For You feed — normalises the API envelope to a payload. */
export const forYouFetcher = async (url: string): Promise<ForYouFeedPayload> => {
  const res = await fetch(url);
  if (!res.ok) return EMPTY_FOR_YOU_FEED;
  const data = await res.json();
  if (data?.success && data.feed?.carousels) {
    return data.feed as ForYouFeedPayload;
  }
  return EMPTY_FOR_YOU_FEED;
};

/**
 * The default first-page product URL for a space (no filters / no search).
 * Must produce the exact same key the live `useMarketplaceData` hook builds on
 * a fresh visit, so a preloaded response is read straight from cache on switch.
 */
export function spaceProductUrl(space: MarketplaceSpace): string | null {
  switch (space) {
    case 'stores':
      return buildApiUrl({ viewMode: 'all', page: 1, pageSize: MARKETPLACE_INITIAL_PAGE_SIZE, listingType: 'store_inventory' });
    case 'uber':
      return buildApiUrl({ viewMode: 'all', page: 1, pageSize: MARKETPLACE_INITIAL_PAGE_SIZE, listingType: 'store_inventory', uberOnly: true });
    case 'marketplace':
      return buildApiUrl({ viewMode: 'all', page: 1, pageSize: MARKETPLACE_INITIAL_PAGE_SIZE, listingType: 'private_listing' });
    default:
      return null; // for-you uses its own feed endpoint
  }
}

/**
 * Warm the cache for a marketplace space. Safe to call repeatedly (SWR dedupes)
 * and from event handlers (e.g. onPointerDown for predictive prefetch).
 */
export function prefetchMarketplaceSpace(space: MarketplaceSpace): void {
  if (typeof window === 'undefined') return;
  if (space === 'for-you') {
    preload(FOR_YOU_FEED_KEY, forYouFetcher);
    return;
  }
  const url = spaceProductUrl(space);
  if (url) preload(url, fetcher);
  if (space === 'stores') {
    // Warm the secondary stores-list request (CDN-cached) used by the picker
    // and store identity strip, so it's ready when the tab opens.
    fetch('/api/marketplace/stores').catch(() => {});
  }
}

/**
 * SWR-backed For You feed. Session-stable: preloaded data is reused without a
 * refetch (revalidateIfStale: false), matching the original "fetch once" behaviour
 * while letting `prefetchMarketplaceSpace('for-you')` make the tab open instantly.
 */
export function useForYouFeed(enabled: boolean): { feed: ForYouFeedPayload | null } {
  const { data } = useSWR<ForYouFeedPayload>(
    enabled ? FOR_YOU_FEED_KEY : null,
    forYouFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 60_000,
    },
  );
  return { feed: data ?? null };
}

/**
 * Custom SWR hook for marketplace data with intelligent caching
 * 
 * Features:
 * - Instant cache hits for previously viewed data
 * - Stale-while-revalidate strategy
 * - Automatic deduplication of requests
 * - Background revalidation
 * - Optimistic UI updates
 */
export function useMarketplaceData(
  params: MarketplaceDataParams,
  options: {
    enabled?: boolean;
    revalidateOnFocus?: boolean;
    dedupingInterval?: number;
    fallbackData?: MarketplaceDataResponse;
    revalidateOnMount?: boolean;
  } = {}
): UseMarketplaceDataReturn {
  const {
    enabled = true,
    revalidateOnFocus = false,
    dedupingInterval = 5000, // Dedupe requests within 5 seconds
    fallbackData,
    revalidateOnMount,
  } = options;

  // Build cache key and URL
  const url = enabled ? buildApiUrl(params) : null;
  
  // Use SWR with aggressive caching
  const { data, error, isLoading, isValidating, mutate } = useSWR<MarketplaceDataResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus,
      revalidateOnReconnect: false,
      revalidateOnMount,
      dedupingInterval,
      fallbackData,
      // Don't keep previous key's data — lets isLoading work correctly and allows
      // instant display from cache on re-visits (cache hit → isLoading false, no skeleton).
      keepPreviousData: false,
      // Retry once on error
      errorRetryCount: 1,
      errorRetryInterval: 3000,
      // For trending: revalidate every 15 minutes
      // For others: revalidate every 5 minutes
      refreshInterval: params.viewMode === 'trending' ? 15 * 60 * 1000 : 5 * 60 * 1000,
    }
  );

  return {
    products: data?.products ?? EMPTY_MARKETPLACE_PRODUCTS,
    pagination: data?.pagination || null,
    // Treat "no data yet" as loading — SWR's internal isLoading is false during SSR
    // (no fetch runs on the server), which previously flashed the empty state before
    // the client request completed.
    isLoading: !data && !error,
    isValidating,
    error,
    mutate,
  };
}

// Fetcher for category counts
const categoryCountsFetcher = async (url: string): Promise<{ counts: Record<string, number>; total: number }> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch category counts');
  }
  return response.json();
};

/**
 * Hook for Lightspeed store categories (Bike Stores tab pills).
 * Fetches distinct category_name values from all active store inventory.
 */
export function useLightspeedCategories(uberOnly = false, enabled = true): {
  categories: { label: string; level1: string }[];
  isLoading: boolean;
} {
  const key = enabled
    ? uberOnly
      ? '/api/marketplace/store-categories?uberOnly=true'
      : '/api/marketplace/store-categories'
    : null;

  const { data, error, isLoading } = useSWR<{ categories: { name: string; count: number }[] }>(
    key,
    (url: string) => fetch(url).then(r => r.json()),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
      refreshInterval: 5 * 60 * 1000,
    }
  );

  const categories = React.useMemo(() => {
    if (!data?.categories) return [];
    return data.categories.map(c => ({ label: c.name, level1: c.name }));
  }, [data]);

  return { categories, isLoading: !data && !error && isLoading };
}

/**
 * Hook for category counts with aggressive caching
 */
export function useCategoryCounts() {
  const { data, error, isLoading } = useSWR<{ counts: Record<string, number>; total: number }>(
    '/api/marketplace/category-counts',
    categoryCountsFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // 1 minute
      refreshInterval: 5 * 60 * 1000, // 5 minutes
    }
  );

  return {
    counts: data?.counts || {},
    total: data?.total || 0,
    isLoading: !data && !error && isLoading,
    error,
  };
}

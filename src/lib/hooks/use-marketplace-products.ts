"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MarketplaceProduct,
  MarketplaceFilters,
  MarketplaceCategoriesResponse,
} from '@/lib/types/marketplace';

// ============================================================
// Marketplace Products Hook
// Client-side data fetching with caching and optimization
// ============================================================

interface UseMarketplaceProductsReturn {
  products: MarketplaceProduct[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export function useMarketplaceProducts(
  filters: MarketplaceFilters = {}
): UseMarketplaceProductsReturn {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 24,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

  // Track if a request is in progress to prevent duplicate requests
  const isLoadingRef = useRef(false);

  // Create a stable string key from filters for comparison
  const filterKey = JSON.stringify({
    category: filters.category,
    subcategory: filters.subcategory,
    level1: filters.level1,
    level2: filters.level2,
    level3: filters.level3,
    search: filters.search,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    sortBy: filters.sortBy,
    pageSize: filters.pageSize,
    createdAfter: filters.createdAfter,
  });

  const prevFilterKey = useRef(filterKey);

  // Fetch products function (no dependencies on filters object)
  const fetchProducts = useCallback(
    async (page: number, append: boolean = false) => {
      // Prevent duplicate requests
      if (isLoadingRef.current) {
        console.log('⏳ Request already in progress, skipping...');
        return;
      }

      try {
        isLoadingRef.current = true;
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        // Support new 3-level taxonomy
        if (filters.level1) params.set('level1', filters.level1);
        if (filters.level2) params.set('level2', filters.level2);
        if (filters.level3) params.set('level3', filters.level3);
        // Legacy support
        if (filters.category) params.set('category', filters.category);
        if (filters.subcategory) params.set('subcategory', filters.subcategory);
        if (filters.search) params.set('search', filters.search);
        if (filters.minPrice !== undefined)
          params.set('minPrice', filters.minPrice.toString());
        if (filters.maxPrice !== undefined)
          params.set('maxPrice', filters.maxPrice.toString());
        if (filters.sortBy) params.set('sortBy', filters.sortBy);
        if (filters.createdAfter) params.set('createdAfter', filters.createdAfter);
        params.set('page', page.toString());
        params.set('pageSize', (filters.pageSize || 24).toString());

        console.log(`🚀 Fetching page ${page}...`);
        const startTime = Date.now();

        const response = await fetch(`/api/marketplace/products?${params}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorMessage = errorData?.error || `Failed to fetch products (${response.status})`;
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const loadTime = Date.now() - startTime;
        console.log(`✅ Page ${page} loaded in ${loadTime}ms (${data.products.length} products)`);

        if (append) {
          setProducts((prev) => [...prev, ...data.products]);
        } else {
          setProducts(data.products);
        }

        setPagination(data.pagination);
        setCurrentPage(page);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching marketplace products:', err);
      } finally {
        setLoading(false);
        isLoadingRef.current = false;
      }
    },
    [filters.category, filters.subcategory, filters.search, filters.minPrice, filters.maxPrice, filters.sortBy, filters.pageSize, filters.createdAfter]
  );

  // Stable loadMore function that doesn't recreate on every render
  const loadMore = useCallback(async () => {
    // Use ref to check loading state to avoid dependency
    if (isLoadingRef.current) {
      console.log('⏳ Already loading, skipping loadMore...');
      return;
    }

    // Check pagination state
    if (!pagination.hasMore) {
      console.log('📭 No more products to load');
      return;
    }

    console.log(`📄 Loading more products (next page: ${currentPage + 1})...`);
    await fetchProducts(currentPage + 1, true);
  }, [fetchProducts, currentPage, pagination.hasMore]);

  const refetch = useCallback(async () => {
    setCurrentPage(1);
    await fetchProducts(1, false);
  }, [fetchProducts]);

  // Initial fetch and refetch when filters change
  useEffect(() => {
    if (filterKey !== prevFilterKey.current) {
      prevFilterKey.current = filterKey;
      setCurrentPage(1);
      fetchProducts(1, false);
    } else if (currentPage === 1 && products.length === 0) {
      // Initial load
      fetchProducts(1, false);
    }
  }, [filterKey, fetchProducts, currentPage, products.length]);

  return {
    products,
    loading,
    error,
    pagination,
    refetch,
    loadMore,
  };
}

// ============================================================
// Marketplace Categories Hook
// ============================================================

interface UseMarketplaceCategoriesReturn {
  categories: MarketplaceCategoriesResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMarketplaceCategories(): UseMarketplaceCategoriesReturn {
  const [categories, setCategories] = useState<MarketplaceCategoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/marketplace/categories');
      
      if (!response.ok) {
        // Try to get detailed error message from response
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || `Failed to fetch categories (${response.status})`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching marketplace categories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    await fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    refetch,
  };
}


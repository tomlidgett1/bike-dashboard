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

  // Create a stable string key from filters for comparison
  const filterKey = JSON.stringify({
    category: filters.category,
    subcategory: filters.subcategory,
    search: filters.search,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    sortBy: filters.sortBy,
    pageSize: filters.pageSize,
  });

  const prevFilterKey = useRef(filterKey);

  // Fetch products function (no dependencies on filters object)
  const fetchProducts = useCallback(
    async (page: number, append: boolean = false) => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (filters.category) params.set('category', filters.category);
        if (filters.subcategory) params.set('subcategory', filters.subcategory);
        if (filters.search) params.set('search', filters.search);
        if (filters.minPrice !== undefined)
          params.set('minPrice', filters.minPrice.toString());
        if (filters.maxPrice !== undefined)
          params.set('maxPrice', filters.maxPrice.toString());
        if (filters.sortBy) params.set('sortBy', filters.sortBy);
        params.set('page', page.toString());
        params.set('pageSize', (filters.pageSize || 24).toString());

        const response = await fetch(`/api/marketplace/products?${params}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorMessage = errorData?.error || `Failed to fetch products (${response.status})`;
          throw new Error(errorMessage);
        }

        const data = await response.json();

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
      }
    },
    [filters.category, filters.subcategory, filters.search, filters.minPrice, filters.maxPrice, filters.sortBy, filters.pageSize]
  );

  const loadMore = useCallback(async () => {
    if (pagination.hasMore && !loading) {
      await fetchProducts(currentPage + 1, true);
    }
  }, [pagination.hasMore, loading, fetchProducts, currentPage]);

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


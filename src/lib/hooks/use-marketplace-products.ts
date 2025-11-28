"use client";

import { useState, useEffect, useCallback } from 'react';
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
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 24,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

  const fetchProducts = useCallback(
    async (append: boolean = false) => {
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
        params.set('page', (filters.page || 1).toString());
        params.set('pageSize', (filters.pageSize || 24).toString());

        const response = await fetch(`/api/marketplace/products?${params}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch products');
        }

        const data = await response.json();

        if (append) {
          setProducts((prev) => [...prev, ...data.products]);
        } else {
          setProducts(data.products);
        }

        setPagination(data.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching marketplace products:', err);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const refetch = useCallback(async () => {
    await fetchProducts(false);
  }, [fetchProducts]);

  const loadMore = useCallback(async () => {
    if (pagination.hasMore && !loading) {
      await fetchProducts(true);
    }
  }, [pagination.hasMore, loading, fetchProducts]);

  useEffect(() => {
    fetchProducts(false);
  }, [fetchProducts]);

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
        throw new Error('Failed to fetch categories');
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


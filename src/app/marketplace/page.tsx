"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SlidersHorizontal, Package, Store } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { CategoryFilters } from "@/components/marketplace/category-filters";
import { ProductGrid } from "@/components/marketplace/product-grid";
import { StoresGrid } from "@/components/marketplace/stores-grid";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMarketplaceProducts, useMarketplaceCategories } from "@/lib/hooks/use-marketplace-products";
import type { MarketplaceCategory } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

// ============================================================
// Marketplace Page
// Main marketplace with filters, search, and products
// ============================================================

export default function MarketplacePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Tab state - products or stores
  const [activeTab, setActiveTab] = React.useState<'products' | 'stores'>(
    (searchParams.get('view') as 'products' | 'stores') || 'products'
  );

  // Get filters from URL
  const [search, setSearch] = React.useState(searchParams.get('search') || '');
  const [category, setCategory] = React.useState<MarketplaceCategory | null>(
    (searchParams.get('category') as MarketplaceCategory) || null
  );
  const [subcategory, setSubcategory] = React.useState<string | null>(
    searchParams.get('subcategory') || null
  );
  const [sortBy, setSortBy] = React.useState<string>(
    searchParams.get('sortBy') || 'newest'
  );
  const [page, setPage] = React.useState(1);

  // Stores state
  const [stores, setStores] = React.useState<any[]>([]);
  const [storesLoading, setStoresLoading] = React.useState(false);

  // Fetch products with filters
  const { products, loading, pagination, refetch } = useMarketplaceProducts({
    category: category || undefined,
    subcategory: subcategory || undefined,
    search: search || undefined,
    sortBy: sortBy as any,
    page,
    pageSize: 24,
  });

  // Fetch category stats
  const { categories: categoryStats } = useMarketplaceCategories();

  // Build category counts for badges
  const categoryCounts = React.useMemo(() => {
    if (!categoryStats) return {} as Record<MarketplaceCategory, number>;
    
    const counts: Record<string, number> = {};
    categoryStats.categories.forEach((cat) => {
      counts[cat.category] = cat.totalProducts;
    });
    return counts as Record<MarketplaceCategory, number>;
  }, [categoryStats]);

  // Fetch stores when stores tab is active
  React.useEffect(() => {
    if (activeTab === 'stores') {
      const fetchStores = async () => {
        setStoresLoading(true);
        try {
          const response = await fetch('/api/marketplace/stores');
          if (response.ok) {
            const data = await response.json();
            setStores(data.stores || []);
          }
        } catch (error) {
          console.error('Error fetching stores:', error);
        } finally {
          setStoresLoading(false);
        }
      };
      fetchStores();
    }
  }, [activeTab]);

  // Update URL when filters change
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== 'products') params.set('view', activeTab);
    if (category) params.set('category', category);
    if (subcategory) params.set('subcategory', subcategory);
    if (search) params.set('search', search);
    if (sortBy && sortBy !== 'newest') params.set('sortBy', sortBy);

    const newUrl = params.toString()
      ? `/marketplace?${params.toString()}`
      : '/marketplace';

    router.replace(newUrl, { scroll: false });
  }, [activeTab, category, subcategory, search, sortBy, router]);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [category, subcategory, search, sortBy]);

  const handleLoadMore = () => {
    if (pagination.hasMore && !loading) {
      setPage((prev) => prev + 1);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleCategoryChange = (newCategory: MarketplaceCategory | null) => {
    setCategory(newCategory);
    setSubcategory(null); // Reset subcategory when category changes
  };

  return (
    <MarketplaceLayout>
      {/* Header */}
      <MarketplaceHeader
        searchValue={search}
        onSearchChange={handleSearchChange}
        searchLoading={loading}
      />

      {/* Main Content */}
      <div className="max-w-[1920px] mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {/* View Tabs */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
            <button
              onClick={() => setActiveTab('products')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === 'products'
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70"
              )}
            >
              <Package size={15} />
              Products
            </button>
            <button
              onClick={() => setActiveTab('stores')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === 'stores'
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70"
              )}
            >
              <Store size={15} />
              Stores
            </button>
          </div>

          {/* Page Title */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">
              {activeTab === 'stores' 
                ? 'Browse All Stores'
                : category ? `${category}` : 'Browse All Products'
              }
            </h1>
            <p className="text-gray-600">
              {activeTab === 'stores'
                ? `${stores.length} bike stores on the platform`
                : categoryStats
                  ? `${categoryStats.totalProducts.toLocaleString()} products available`
                  : 'Discover bikes, parts, apparel, and more'
              }
            </p>
          </div>

          {/* Products View */}
          {activeTab === 'products' && (
            <>
              {/* Filters Section */}
              <div className="space-y-4">
                {/* Category Filters */}
                <CategoryFilters
                  selectedCategory={category}
                  selectedSubcategory={subcategory}
                  onCategoryChange={handleCategoryChange}
                  onSubcategoryChange={setSubcategory}
                  categoryCounts={categoryCounts}
                />

                {/* Sort and Filter Bar */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      {pagination.total.toLocaleString()} products
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Sort Dropdown */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Sort:</span>
                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[160px] rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest First</SelectItem>
                          <SelectItem value="oldest">Oldest First</SelectItem>
                          <SelectItem value="price_asc">Price: Low to High</SelectItem>
                          <SelectItem value="price_desc">Price: High to Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Advanced Filters Button (Future) */}
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-md border-gray-300"
                      disabled
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Products Grid */}
              <ProductGrid
                products={products}
                loading={loading && page === 1}
                hasMore={pagination.hasMore}
                onLoadMore={handleLoadMore}
              />
            </>
          )}

          {/* Stores View */}
          {activeTab === 'stores' && (
            <StoresGrid stores={stores} loading={storesLoading} />
          )}
        </motion.div>
      </div>
    </MarketplaceLayout>
  );
}


"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SlidersHorizontal, Package, Store, User, Bike, Settings, Shirt, Apple } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
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

  // Tab state - products, stores, or individual sellers
  const [activeTab, setActiveTab] = React.useState<'products' | 'stores' | 'sellers'>(
    (searchParams.get('view') as 'products' | 'stores' | 'sellers') || 'products'
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

  // Stores state
  const [stores, setStores] = React.useState<any[]>([]);
  const [storesLoading, setStoresLoading] = React.useState(false);

  // Memoize filters to prevent recreating object on every render
  const filters = React.useMemo(() => ({
    category: category || undefined,
    subcategory: subcategory || undefined,
    search: search || undefined,
    sortBy: sortBy as any,
    pageSize: 24,
  }), [category, subcategory, search, sortBy]);

  // Fetch products with filters (no page state - handled by hook)
  const { products, loading, pagination, refetch, loadMore } = useMarketplaceProducts(filters);

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

  const handleLoadMore = () => {
    loadMore();
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleCategoryChange = (newCategory: MarketplaceCategory | null) => {
    setCategory(newCategory);
    setSubcategory(null); // Reset subcategory when category changes
  };

  // Category icons mapping
  const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    Bicycles: Bike,
    Parts: Settings,
    Apparel: Shirt,
    Nutrition: Apple,
  };

  return (
    <>
      {/* Header - Full Width, Fixed with Enterprise Search */}
      <MarketplaceHeader />

      <MarketplaceLayout>
        {/* Main Content - Add top padding to account for fixed header */}
        <div className="max-w-[1920px] mx-auto px-6 py-8 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {/* Category Tabs - Only show for products view */}
          {activeTab === 'products' && (
            <div className="space-y-3">
              {/* Header */}
              <h2 className="text-lg font-medium text-gray-900">
                What are you looking for?
              </h2>
              
              {/* Category Filters */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => handleCategoryChange(null)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                    !category
                      ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                      : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
                  )}
                >
                  All Products
                </button>

                {(['Bicycles', 'Parts', 'Apparel', 'Nutrition'] as MarketplaceCategory[]).map((cat) => {
                  const Icon = CATEGORY_ICONS[cat];
                  const count = categoryCounts[cat] || 0;
                  const isActive = category === cat;

                  return (
                    <button
                      key={cat}
                      onClick={() => handleCategoryChange(cat)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                        isActive
                          ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                          : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
                      )}
                    >
                      <Icon size={15} />
                      {cat}
                      {count > 0 && (
                        <span className="ml-1 text-xs text-gray-500">
                          ({count})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Products View */}
          {activeTab === 'products' && (
            <>
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

              {/* Products Grid */}
              <ProductGrid
                products={products}
                loading={loading}
                hasMore={pagination.hasMore}
                onLoadMore={handleLoadMore}
              />
            </>
          )}

          {/* Stores View */}
          {activeTab === 'stores' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {stores.length} {stores.length === 1 ? 'store' : 'stores'} found
                </p>
              </div>
              <StoresGrid stores={stores} loading={storesLoading} />
            </>
          )}

          {/* Individual Sellers View */}
          {activeTab === 'sellers' && (
            <div className="bg-white rounded-md border border-gray-200 p-12 text-center">
              <User className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Individual Sellers Coming Soon
              </h3>
              <p className="text-gray-600 max-w-md mx-auto">
                We're working on bringing individual sellers to the marketplace. 
                Check back soon to discover unique products from the cycling community.
              </p>
            </div>
          )}
        </motion.div>
      </div>
      </MarketplaceLayout>
    </>
  );
}


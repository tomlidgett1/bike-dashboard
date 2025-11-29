"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SlidersHorizontal, Package, Store, User, Bike, Settings, Shirt, Apple } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductGrid } from "@/components/marketplace/product-grid";
import { StoresGrid } from "@/components/marketplace/stores-grid";
import { AdvancedCategoryFilter } from "@/components/marketplace/advanced-category-filter";
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
  const [level1, setLevel1] = React.useState<string | null>(
    searchParams.get('level1') || null
  );
  const [level2, setLevel2] = React.useState<string | null>(
    searchParams.get('level2') || null
  );
  const [level3, setLevel3] = React.useState<string | null>(
    searchParams.get('level3') || null
  );
  const [sortBy, setSortBy] = React.useState<string>(
    searchParams.get('sortBy') || 'newest'
  );

  // Stores state
  const [stores, setStores] = React.useState<any[]>([]);
  const [storesLoading, setStoresLoading] = React.useState(false);

  // Memoize filters to prevent recreating object on every render
  const filters = React.useMemo(() => ({
    level1: level1 || undefined,
    level2: level2 || undefined,
    level3: level3 || undefined,
    search: search || undefined,
    sortBy: sortBy as any,
    pageSize: 24,
  }), [level1, level2, level3, search, sortBy]);

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
    if (level1) params.set('level1', level1);
    if (level2) params.set('level2', level2);
    if (level3) params.set('level3', level3);
    if (search) params.set('search', search);
    if (sortBy && sortBy !== 'newest') params.set('sortBy', sortBy);

    const newUrl = params.toString()
      ? `/marketplace?${params.toString()}`
      : '/marketplace';

    router.replace(newUrl, { scroll: false });
  }, [activeTab, level1, level2, level3, search, sortBy, router]);

  const handleLoadMore = () => {
    loadMore();
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleLevel1Change = (newLevel1: string | null) => {
    setLevel1(newLevel1);
  };

  const handleLevel2Change = (newLevel2: string | null) => {
    setLevel2(newLevel2);
  };

  const handleLevel3Change = (newLevel3: string | null) => {
    setLevel3(newLevel3);
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

      <MarketplaceLayout 
        showStoreCTA={activeTab === 'stores'}
        showFooter={activeTab !== 'products' && activeTab !== 'stores'}
      >
        {/* Main Content - Add top padding to account for fixed header */}
        <div className="max-w-[1920px] mx-auto px-6 py-8 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {/* Category Filters - Only show for products view */}
          {activeTab === 'products' && (
            <AdvancedCategoryFilter
              selectedLevel1={level1}
              selectedLevel2={level2}
              selectedLevel3={level3}
              onLevel1Change={handleLevel1Change}
              onLevel2Change={handleLevel2Change}
              onLevel3Change={handleLevel3Change}
            />
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


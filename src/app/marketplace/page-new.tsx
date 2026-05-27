"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Package } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductGrid } from "@/components/marketplace/product-grid";
import { ViewModePills, ViewMode } from "@/components/marketplace/view-mode-pills";
import { CategoryPills } from "@/components/marketplace/category-pills";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useInteractionTracker } from "@/lib/tracking/interaction-tracker";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

function normalisePageNewViewParam(raw: string | null): ViewMode {
  if (raw === "trending" || raw === "all") return raw;
  return "trending";
}

// ============================================================
// Marketplace Page - Discovery-Focused Homepage
// Default view: Trending products with pill filters
// ============================================================

export default function MarketplacePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const tracker = useInteractionTracker(user?.id);

  const [viewMode, setViewMode] = React.useState<ViewMode>(() =>
    normalisePageNewViewParam(searchParams.get("view"))
  );

  // Category filter state
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    searchParams.get('category') || null
  );

  // Products state
  const [products, setProducts] = React.useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [totalCount, setTotalCount] = React.useState(0);

  // Category counts for pills
  const [categoryCounts, setCategoryCounts] = React.useState<Record<string, number>>({});

  // Fetch products based on view mode
  const fetchProducts = React.useCallback(async (isLoadMore = false) => {
    try {
      setLoading(!isLoadMore);

      let endpoint = '';
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('page', isLoadMore ? String(page + 1) : '1');

      if (selectedCategory) {
        params.set('category', selectedCategory);
      }

      // Determine endpoint based on view mode
      switch (viewMode) {
        case 'trending':
          endpoint = `/api/marketplace/trending?${params}`;
          break;
        case 'all':
          endpoint = `/api/marketplace/products?${params}`;
          break;
      }

      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }

      const data = await response.json();

      if (data.success) {
        const newProducts = data.products || data.recommendations || [];
        
        if (isLoadMore) {
          setProducts(prev => [...prev, ...newProducts]);
          setPage(prev => prev + 1);
        } else {
          setProducts(newProducts);
          setPage(1);
        }

        // Update pagination
        if (data.pagination) {
          setHasMore(data.pagination.hasMore);
          setTotalCount(data.pagination.total || 0);
        } else {
          setHasMore(false);
          setTotalCount(newProducts.length);
        }
      }
    } catch (error) {
      console.error('[Marketplace] Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }, [viewMode, selectedCategory, page]);

  // Fetch category counts
  React.useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await fetch('/api/marketplace/products?pageSize=10000');
        if (response.ok) {
          const data = await response.json();
          const prods = data.products || [];
          
          const counts: Record<string, number> = {};
          prods.forEach((product: any) => {
            if (product.marketplace_category) {
              counts[product.marketplace_category] = (counts[product.marketplace_category] || 0) + 1;
            }
          });
          
          setCategoryCounts(counts);
        }
      } catch (error) {
        console.error('[Marketplace] Error fetching counts:', error);
      }
    };
    fetchCounts();
  }, []);

  // Fetch products when view mode or category changes
  React.useEffect(() => {
    fetchProducts(false);
  }, [viewMode, selectedCategory]);

  // Update URL when filters change
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (viewMode !== 'trending') params.set('view', viewMode);
    if (selectedCategory) params.set('category', selectedCategory);

    const newUrl = params.toString()
      ? `/marketplace?${params.toString()}`
      : '/marketplace';

    router.replace(newUrl, { scroll: false });
  }, [viewMode, selectedCategory, router]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchProducts(true);
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setProducts([]);
    setPage(1);
    
    // Track mode change
    tracker.trackClick(undefined, {
      action: 'view_mode_change',
      from: viewMode,
      to: mode,
    });
  };

  const handleCategoryChange = (category: string | null) => {
    setSelectedCategory(category);
    setProducts([]);
    setPage(1);
    
    // Track category selection
    if (category) {
      tracker.trackClick(undefined, {
        action: 'category_filter',
        category: category,
        view_mode: viewMode,
      });
    }
  };

  return (
    <>
      <MarketplaceHeader />

      <MarketplaceLayout showFooter={false}>
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-4 sm:py-8 pt-16 sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* View Mode Pills */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <ViewModePills
                activeMode={viewMode}
                onModeChange={handleViewModeChange}
              />

              {/* Product Count */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-sm text-gray-700 font-medium">
                  {totalCount.toLocaleString()} {viewMode === 'trending' ? 'trending' : ''} products
                </span>
              </div>
            </div>

            {/* Category Pills - Only show on All Products tab */}
            {viewMode === 'all' && (
              <CategoryPills
                selectedCategory={selectedCategory}
                onCategoryChange={handleCategoryChange}
                counts={categoryCounts}
              />
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
                  {viewMode === 'trending' && (
                    <>
                      <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        No trending products yet
                      </h3>
                      <p className="text-gray-600 max-w-md mx-auto mb-6">
                        {selectedCategory 
                          ? `No trending ${selectedCategory.toLowerCase()} products right now. Try browsing all products or check back soon!`
                          : 'Products will appear here as they gain popularity. Check back soon or browse all products!'}
                      </p>
                      <Button
                        onClick={() => setViewMode('all')}
                        className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium"
                      >
                        Browse All Products
                      </Button>
                    </>
                  )}

                  {viewMode === 'all' && (
                    <>
                      <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        No products found
                      </h3>
                      <p className="text-gray-600 max-w-md mx-auto mb-6">
                        {selectedCategory 
                          ? `No ${selectedCategory.toLowerCase()} products available. Try a different category!`
                          : 'No products available at the moment.'}
                      </p>
                      {selectedCategory && (
                        <Button
                          onClick={() => setSelectedCategory(null)}
                          variant="outline"
                          className="rounded-md"
                        >
                          Clear Filter
                        </Button>
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            {/* Products Grid */}
            <AnimatePresence mode="wait">
              {products.length > 0 && (
                <motion.div
                  key={`${viewMode}-${selectedCategory}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ProductGrid
                    products={products}
                    loading={loading}
                    hasMore={hasMore}
                    onLoadMore={handleLoadMore}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </MarketplaceLayout>
    </>
  );
}


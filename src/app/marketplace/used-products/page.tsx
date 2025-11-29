"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SlidersHorizontal, RefreshCw } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductGrid } from "@/components/marketplace/product-grid";
import { AdvancedCategoryFilter } from "@/components/marketplace/advanced-category-filter";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMarketplaceProducts } from "@/lib/hooks/use-marketplace-products";
import { cn } from "@/lib/utils";

// ============================================================
// Used Products Page
// Shows pre-owned bikes and equipment from individual sellers
// ============================================================

export default function UsedProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get filters from URL
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

  // Memoize filters - Used products are private_listing type
  const filters = React.useMemo(() => ({
    level1: level1 || undefined,
    level2: level2 || undefined,
    level3: level3 || undefined,
    sortBy: sortBy as any,
    pageSize: 24,
    listingType: 'private_listing', // Only show used/private listings
  }), [level1, level2, level3, sortBy]);

  // Fetch products with filters
  const { products, loading, pagination, loadMore } = useMarketplaceProducts(filters);

  // Update URL when filters change
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (level1) params.set('level1', level1);
    if (level2) params.set('level2', level2);
    if (level3) params.set('level3', level3);
    if (sortBy && sortBy !== 'newest') params.set('sortBy', sortBy);

    const newUrl = params.toString()
      ? `/marketplace/used-products?${params.toString()}`
      : '/marketplace/used-products';

    router.replace(newUrl, { scroll: false });
  }, [level1, level2, level3, sortBy, router]);

  const handleLoadMore = () => {
    loadMore();
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

  return (
    <>
      {/* Header - Full Width, Fixed */}
      <MarketplaceHeader />

      <MarketplaceLayout showFooter={false}>
        {/* Main Content - Add top padding to account for fixed header */}
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-4 sm:py-8 pt-16 sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Page Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-md">
                <RefreshCw className="h-6 w-6 text-gray-700" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Used Products</h1>
                <p className="text-sm text-gray-600">
                  Pre-owned bikes and equipment from individual sellers
                </p>
              </div>
            </div>

            {/* Category Filters */}
            <AdvancedCategoryFilter
              selectedLevel1={level1}
              selectedLevel2={level2}
              selectedLevel3={level3}
              onLevel1Change={handleLevel1Change}
              onLevel2Change={handleLevel2Change}
              onLevel3Change={handleLevel3Change}
            />

            {/* Sort and Filter Bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {pagination.total.toLocaleString()} used products
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
          </motion.div>
        </div>
      </MarketplaceLayout>
    </>
  );
}


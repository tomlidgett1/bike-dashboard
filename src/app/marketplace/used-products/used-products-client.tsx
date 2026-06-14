"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import {
  useMarketplaceProducts,
  type MarketplaceInitialData,
} from "@/lib/hooks/use-marketplace-products";

// Pre-owned listings from individual sellers. Initial filters arrive as props
// (read server-side from the URL) rather than useSearchParams, so the grid
// server-renders for crawlers. The hook is seeded with `initialData` (provided
// only for the default, unfiltered view) to avoid a refetch flash.
export function UsedProductsClient({
  initialData,
  initialLevel1 = null,
  initialLevel2 = null,
  initialLevel3 = null,
  initialSortBy = "newest",
}: {
  initialData?: MarketplaceInitialData;
  initialLevel1?: string | null;
  initialLevel2?: string | null;
  initialLevel3?: string | null;
  initialSortBy?: string;
}) {
  const router = useRouter();

  const [level1, setLevel1] = React.useState<string | null>(initialLevel1);
  const [level2, setLevel2] = React.useState<string | null>(initialLevel2);
  const [level3, setLevel3] = React.useState<string | null>(initialLevel3);
  const [sortBy, setSortBy] = React.useState<string>(initialSortBy);

  const filters = React.useMemo(() => ({
    level1: level1 || undefined,
    level2: level2 || undefined,
    level3: level3 || undefined,
    sortBy: sortBy as any,
    pageSize: 24,
    listingType: 'private_listing' as const, // Only show used/private listings
  }), [level1, level2, level3, sortBy]);

  const { products, loading, pagination, loadMore } = useMarketplaceProducts(filters, initialData);

  // Keep the URL in sync as filters change (no useSearchParams → SSR-safe grid).
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

  return (
    <>
      <MarketplaceHeader />

      <MarketplaceLayout showFooter={false}>
        <div className="px-3 sm:px-6 py-4 sm:py-8 pt-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
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

            <AdvancedCategoryFilter
              selectedLevel1={level1}
              selectedLevel2={level2}
              selectedLevel3={level3}
              onLevel1Change={setLevel1}
              onLevel2Change={setLevel2}
              onLevel3Change={setLevel3}
            />

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {pagination.total.toLocaleString()} used products
                </span>
              </div>

              <div className="flex items-center gap-3">
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

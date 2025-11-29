"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles, SlidersHorizontal } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductGrid } from "@/components/marketplace/product-grid";
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
// New Products Page
// Shows recently added products to the marketplace
// ============================================================

export default function NewProductsPage() {
  // Time filter - last 7 days, 30 days, or all time
  const [timeFilter, setTimeFilter] = React.useState<string>("7days");
  const [sortBy, setSortBy] = React.useState<string>("newest");

  // Calculate date threshold based on time filter
  const getDateThreshold = () => {
    const now = new Date();
    switch (timeFilter) {
      case "7days": {
        const date = new Date(now);
        date.setDate(date.getDate() - 7);
        return date.toISOString();
      }
      case "30days": {
        const date = new Date(now);
        date.setDate(date.getDate() - 30);
        return date.toISOString();
      }
      case "all":
      default:
        return null;
    }
  };

  // Memoize filters to prevent recreating object on every render
  const filters = React.useMemo(() => ({
    sortBy: sortBy as any,
    pageSize: 24,
    // Only include createdAfter if not "all"
    ...(timeFilter !== "all" && { createdAfter: getDateThreshold() }),
  }), [sortBy, timeFilter]);

  // Fetch products with filters
  const { products, loading, pagination, loadMore } = useMarketplaceProducts(filters);

  const handleLoadMore = () => {
    loadMore();
  };

  return (
    <>
      {/* Header - Full Width, Fixed with Enterprise Search */}
      <MarketplaceHeader />

      <MarketplaceLayout>
        {/* Main Content - Add top padding to account for fixed header */}
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-4 sm:py-8 pt-16 sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Page Header */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 shadow-sm">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">New Products</h1>
                  <p className="text-sm text-gray-600">
                    Discover the latest additions to our marketplace
                  </p>
                </div>
              </div>
            </div>

            {/* Time Filter Tabs */}
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-gray-700">
                Show products from:
              </h2>
              
              <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                <button
                  onClick={() => setTimeFilter("7days")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    timeFilter === "7days"
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70"
                  )}
                >
                  Last 7 Days
                </button>
                <button
                  onClick={() => setTimeFilter("30days")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    timeFilter === "30days"
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70"
                  )}
                >
                  Last 30 Days
                </button>
                <button
                  onClick={() => setTimeFilter("all")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    timeFilter === "all"
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70"
                  )}
                >
                  All Time
                </button>
              </div>
            </div>

            {/* Sort and Filter Bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="hidden sm:flex items-center gap-2">
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
          </motion.div>
        </div>
      </MarketplaceLayout>
    </>
  );
}


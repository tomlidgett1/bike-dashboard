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
import {
  useMarketplaceProducts,
  type MarketplaceInitialData,
} from "@/lib/hooks/use-marketplace-products";
import { cn } from "@/lib/utils";

// Interactive grid for recently-added listings. Seeded with a server-rendered
// initial page (`initialData`) so crawlers see real products without a refetch.
export function NewProductsClient({
  initialData,
}: {
  initialData?: MarketplaceInitialData;
}) {
  const [timeFilter, setTimeFilter] = React.useState<string>("7days");
  const [sortBy, setSortBy] = React.useState<string>("newest");

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

  const filters = React.useMemo(() => ({
    sortBy: sortBy as any,
    pageSize: 24,
    ...(timeFilter !== "all" && { createdAfter: getDateThreshold() }),
  }), [sortBy, timeFilter]);

  // The seed matches the default view (7 days / newest); keep it so the first
  // paint shows the server-rendered grid. Other filters refetch as before.
  const seed = timeFilter === "7days" && sortBy === "newest" ? initialData : undefined;

  const { products, loading, pagination, loadMore } = useMarketplaceProducts(filters, seed);

  const handleLoadMore = () => {
    loadMore();
  };

  return (
    <>
      <MarketplaceHeader />

      <MarketplaceLayout>
        <div className="px-3 sm:px-6 py-4 sm:py-8 pt-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
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

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {pagination.total.toLocaleString()} products
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

"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Store, ArrowLeft, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductGrid } from "@/components/marketplace/product-grid";
import { useMarketplaceProducts } from "@/lib/hooks/use-marketplace-products";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import type { MarketplaceCategory } from "@/lib/types/marketplace";

// ============================================================
// Store Profile Client Component
// Handles interactive tabs, product filtering, and scroll header
// ============================================================

interface StoreProfileClientProps {
  storeId: string;
  storeName: string;
  storeType: string;
  logoUrl: string | null;
  productCount: number;
  joinedDate: string;
  categories: Array<{
    category: string;
    count: number;
  }>;
}

export function StoreProfileClient({ 
  storeId, 
  storeName,
  storeType,
  logoUrl,
  productCount,
  joinedDate,
  categories 
}: StoreProfileClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = React.useState("");

  // Scroll detection for header transformation
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 200);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Get active category from URL or default to first available
  const defaultCategory = categories.length > 0 ? categories[0].category : null;
  const [activeCategory, setActiveCategory] = React.useState<string | null>(
    searchParams.get('category') || defaultCategory
  );
  const [page, setPage] = React.useState(1);

  const joinedDateFormatted = new Date(joinedDate).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });

  // Fetch products for this store and category
  const { products, loading, pagination } = useMarketplaceProducts({
    category: activeCategory as MarketplaceCategory | undefined,
    storeId,
    page,
    pageSize: 24,
  });

  // Debug logging
  console.log("[PRODUCTS DEBUG]", {
    activeCategory,
    storeId,
    productsCount: products.length,
    loading,
    pagination
  });

  // Update URL when category changes
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (activeCategory) {
      params.set('category', activeCategory);
    }

    const newUrl = params.toString()
      ? `/marketplace/store/${storeId}?${params.toString()}`
      : `/marketplace/store/${storeId}`;

    router.replace(newUrl, { scroll: false });
  }, [activeCategory, storeId, router]);

  // Reset page when category changes
  React.useEffect(() => {
    setPage(1);
  }, [activeCategory]);

  const handleLoadMore = () => {
    if (pagination.hasMore && !loading) {
      setPage((prev) => prev + 1);
    }
  };

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
  };

  // Show message if store has no products
  if (categories.length === 0) {
    return (
      <>
        {/* Sticky Header */}
        <div className="sticky top-0 z-50">
          <MarketplaceHeader
            searchValue={search}
            onSearchChange={setSearch}
            searchLoading={false}
          />
        </div>

        {/* Content */}
        <div className="max-w-[1920px] mx-auto px-6 py-8">
          <Link 
            href="/marketplace?view=stores"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Stores
          </Link>

          <div className="flex items-start gap-6 mb-12">
            <div className="flex-shrink-0 h-32 w-32 rounded-full bg-gray-100 overflow-hidden border-4 border-white shadow-lg">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={storeName}
                  width={128}
                  height={128}
                  className="object-cover w-full h-full"
                  priority
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Store className="h-16 w-16 text-gray-300" />
                </div>
              )}
            </div>

            <div className="flex-1 pt-4">
              <h1 className="text-4xl font-bold text-gray-900 mb-3">
                {storeName}
              </h1>
              <div className="flex items-center gap-4 text-base text-gray-600">
                <span className="inline-flex items-center px-3 py-1 rounded-md bg-gray-100 text-gray-700 font-medium">
                  {storeType}
                </span>
                <span className="flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  {productCount} products
                </span>
                <span>•</span>
                <span>Joined {joinedDateFormatted}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-24 px-4">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No products available
              </h3>
              <p className="text-sm text-gray-600">
                {storeName} doesn't have any products listed yet.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Sticky Header with Transform */}
      <div className="sticky top-0 z-50">
        <MarketplaceHeader
          searchValue={search}
          onSearchChange={setSearch}
          searchLoading={false}
        />
        
        {/* Compact Store Info - Shows on Scroll */}
        <AnimatePresence>
          {isScrolled && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.3,
                ease: [0.04, 0.62, 0.23, 0.98]
              }}
              className="bg-white border-b border-gray-200"
            >
              <div className="max-w-[1920px] mx-auto px-6 py-3">
                <div className="flex items-center gap-4">
                  {/* Compact Logo */}
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-100 overflow-hidden border-2 border-white shadow-sm">
                    {logoUrl ? (
                      <Image
                        src={logoUrl}
                        alt={storeName}
                        width={40}
                        height={40}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Store className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Compact Info */}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">
                      {storeName}
                    </h2>
                  </div>

                  {/* Compact Tabs */}
                  <div className="flex items-center gap-2">
                    {categories.slice(0, 4).map((cat) => (
                      <button
                        key={cat.category}
                        onClick={() => handleCategoryChange(cat.category)}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                          activeCategory === cat.category
                            ? "text-gray-900 bg-gray-100"
                            : "text-gray-600 hover:bg-gray-50"
                        )}
                      >
                        {cat.category}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Content */}
      <div className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Back Button */}
        <Link 
          href="/marketplace?view=stores"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Stores
        </Link>

        {/* Store Header - Large (not in box) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex items-start gap-6">
            {/* Large Circular Logo */}
            <div className="flex-shrink-0 h-32 w-32 rounded-full bg-gray-100 overflow-hidden border-4 border-white shadow-lg">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={storeName}
                  width={128}
                  height={128}
                  className="object-cover w-full h-full"
                  priority
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Store className="h-16 w-16 text-gray-300" />
                </div>
              )}
            </div>

            {/* Store Info */}
            <div className="flex-1 pt-4">
              <h1 className="text-4xl font-bold text-gray-900 mb-3">
                {storeName}
              </h1>
              <div className="flex items-center gap-4 text-base text-gray-600">
                <span className="inline-flex items-center px-3 py-1 rounded-md bg-gray-100 text-gray-700 font-medium">
                  {storeType}
                </span>
                <span className="flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  {productCount} products
                </span>
                <span>•</span>
                <span>Joined {joinedDateFormatted}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Category Tabs */}
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit overflow-x-auto mb-8">
          {categories.map((cat) => (
            <button
              key={cat.category}
              onClick={() => handleCategoryChange(cat.category)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                activeCategory === cat.category
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70"
              )}
            >
              {cat.category}
              <span className="text-xs text-gray-500">({cat.count})</span>
            </button>
          ))}
        </div>

        {/* Products Section */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ 
              duration: 0.3,
              ease: [0.04, 0.62, 0.23, 0.98]
            }}
          >
            <ProductGrid
              products={products}
              loading={loading && page === 1}
              hasMore={pagination.hasMore}
              onLoadMore={handleLoadMore}
            />
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {!loading && products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 px-4">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No products found
              </h3>
              <p className="text-sm text-gray-600">
                {storeName} doesn't have any {activeCategory?.toLowerCase()} products yet.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}


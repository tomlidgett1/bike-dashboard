"use client";

import * as React from "react";
import { Store, User, ChevronRight, Search, Package } from "lucide-react";
import { ProductCard, ProductCardSkeleton } from "./product-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

interface SplitSearchResultsProps {
  searchQuery: string;
  onClearSearch: () => void;
  isAdmin?: boolean;
  onNavigate?: () => void;
  onImageDiscoveryClick?: (productId: string, productName: string) => void;
}

interface SearchSectionProps {
  title: string;
  icon: React.ReactNode;
  products: MarketplaceProduct[];
  loading: boolean;
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  isAdmin?: boolean;
  onNavigate?: () => void;
  onImageDiscoveryClick?: (productId: string, productName: string) => void;
  emptyMessage: string;
  emptySubtext: string;
}

function SearchSection({
  title,
  icon,
  products,
  loading,
  totalCount,
  hasMore,
  onLoadMore,
  isAdmin,
  onNavigate,
  onImageDiscoveryClick,
  emptyMessage,
  emptySubtext,
}: SearchSectionProps) {
  if (loading && products.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!loading && products.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <span className="text-xs text-gray-500">(0 results)</span>
        </div>
        <div className="bg-gray-50 rounded-md p-6 text-center">
          <p className="text-sm text-gray-600">{emptyMessage}</p>
          <p className="text-xs text-gray-500 mt-1">{emptySubtext}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <span className="text-xs text-gray-500">
            ({totalCount} {totalCount === 1 ? 'result' : 'results'})
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            priority={index < 6}
            isAdmin={isAdmin}
            onNavigate={onNavigate}
            onImageDiscoveryClick={() => {
              const canonicalId = product.canonical_product_id || product.id;
              onImageDiscoveryClick?.(canonicalId, (product as any).display_name || product.description);
            }}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            onClick={onLoadMore}
            variant="outline"
            size="sm"
            className="rounded-md"
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}

export function SplitSearchResults({
  searchQuery,
  onClearSearch,
  isAdmin,
  onNavigate,
  onImageDiscoveryClick,
}: SplitSearchResultsProps) {
  const [storeProducts, setStoreProducts] = React.useState<MarketplaceProduct[]>([]);
  const [privateProducts, setPrivateProducts] = React.useState<MarketplaceProduct[]>([]);
  const [storeLoading, setStoreLoading] = React.useState(true);
  const [privateLoading, setPrivateLoading] = React.useState(true);
  const [storeTotalCount, setStoreTotalCount] = React.useState(0);
  const [privateTotalCount, setPrivateTotalCount] = React.useState(0);
  const [storeHasMore, setStoreHasMore] = React.useState(false);
  const [privateHasMore, setPrivateHasMore] = React.useState(false);
  const [storePage, setStorePage] = React.useState(1);
  const [privatePage, setPrivatePage] = React.useState(1);

  // Fetch store products
  const fetchStoreProducts = React.useCallback(async (page: number, append: boolean = false) => {
    if (!searchQuery) return;
    
    setStoreLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        listingType: 'store_inventory',
        pageSize: '12',
        search: searchQuery,
      });
      
      const response = await fetch(`/api/marketplace/products?${params}`);
      if (response.ok) {
        const data = await response.json();
        setStoreProducts(prev => append ? [...prev, ...data.products] : data.products);
        setStoreTotalCount(data.total);
        setStoreHasMore(data.hasMore);
      }
    } catch (error) {
      console.error('Error fetching store products:', error);
    } finally {
      setStoreLoading(false);
    }
  }, [searchQuery]);

  // Fetch private products
  const fetchPrivateProducts = React.useCallback(async (page: number, append: boolean = false) => {
    if (!searchQuery) return;
    
    setPrivateLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        listingType: 'private_listing',
        pageSize: '12',
        search: searchQuery,
      });
      
      const response = await fetch(`/api/marketplace/products?${params}`);
      if (response.ok) {
        const data = await response.json();
        setPrivateProducts(prev => append ? [...prev, ...data.products] : data.products);
        setPrivateTotalCount(data.total);
        setPrivateHasMore(data.hasMore);
      }
    } catch (error) {
      console.error('Error fetching private products:', error);
    } finally {
      setPrivateLoading(false);
    }
  }, [searchQuery]);

  // Initial fetch
  React.useEffect(() => {
    setStorePage(1);
    setPrivatePage(1);
    setStoreProducts([]);
    setPrivateProducts([]);
    fetchStoreProducts(1, false);
    fetchPrivateProducts(1, false);
  }, [searchQuery, fetchStoreProducts, fetchPrivateProducts]);

  const handleLoadMoreStore = () => {
    const nextPage = storePage + 1;
    setStorePage(nextPage);
    fetchStoreProducts(nextPage, true);
  };

  const handleLoadMorePrivate = () => {
    const nextPage = privatePage + 1;
    setPrivatePage(nextPage);
    fetchPrivateProducts(nextPage, true);
  };

  const totalResults = storeTotalCount + privateTotalCount;
  const isLoading = storeLoading && privateLoading && storeProducts.length === 0 && privateProducts.length === 0;

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="bg-white rounded-md border border-gray-200 p-3 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-600">
            Search results for:
          </span>
          <span className="text-sm font-semibold text-gray-900 truncate">
            "{searchQuery}"
          </span>
          {!isLoading && (
            <span className="text-xs text-gray-500 hidden sm:inline">
              ({totalResults} total results)
            </span>
          )}
        </div>
        <button
          onClick={onClearSearch}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
          aria-label="Clear search"
        >
          Clear
        </button>
      </div>

      {/* No Results */}
      {!isLoading && storeProducts.length === 0 && privateProducts.length === 0 && (
        <div className="bg-white rounded-md border border-gray-200 p-12 text-center">
          <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No results found for "{searchQuery}"
          </h3>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            We couldn't find any products matching your search. Try different keywords or browse all products.
          </p>
          <Button
            onClick={onClearSearch}
            className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium"
          >
            Clear Search
          </Button>
        </div>
      )}

      {/* Store Products Section */}
      {(storeLoading || storeProducts.length > 0 || (!storeLoading && privateProducts.length > 0)) && (
        <SearchSection
          title="From Stores"
          icon={<Store className="h-4 w-4 text-gray-600" />}
          products={storeProducts}
          loading={storeLoading}
          totalCount={storeTotalCount}
          hasMore={storeHasMore}
          onLoadMore={handleLoadMoreStore}
          isAdmin={isAdmin}
          onNavigate={onNavigate}
          onImageDiscoveryClick={onImageDiscoveryClick}
          emptyMessage="No store products found"
          emptySubtext="Try searching for something else"
        />
      )}

      {/* Private Listings Section */}
      {(privateLoading || privateProducts.length > 0 || (!privateLoading && storeProducts.length > 0)) && (
        <SearchSection
          title="From Sellers"
          icon={<User className="h-4 w-4 text-gray-600" />}
          products={privateProducts}
          loading={privateLoading}
          totalCount={privateTotalCount}
          hasMore={privateHasMore}
          onLoadMore={handleLoadMorePrivate}
          isAdmin={isAdmin}
          onNavigate={onNavigate}
          onImageDiscoveryClick={onImageDiscoveryClick}
          emptyMessage="No listings from private sellers"
          emptySubtext="Individual sellers haven't listed this item yet"
        />
      )}
    </div>
  );
}


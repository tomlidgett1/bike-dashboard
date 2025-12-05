"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles, TrendingUp, RefreshCw, Loader2 } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { ProductCard, ProductCardSkeleton } from "@/components/marketplace/product-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useInteractionTracker } from "@/lib/tracking/interaction-tracker";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// For You Page - Personalized Recommendations
// ============================================================

export default function ForYouPage() {
  const { user } = useAuth();
  const tracker = useInteractionTracker(user?.id);

  const [products, setProducts] = React.useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [isPersonalized, setIsPersonalized] = React.useState(false);

  // Initial load
  React.useEffect(() => {
    fetchRecommendations(false);
  }, []);

  const fetchRecommendations = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const endpoint = '/api/recommendations/for-you';
      const params = new URLSearchParams({
        limit: '50',
        enrich: 'true',
      });

      if (isRefresh) {
        params.set('refresh', 'true');
      }

      console.log('[For You] Fetching recommendations from:', `${endpoint}?${params}`);
      const response = await fetch(`${endpoint}?${params}`);
      
      console.log('[For You] Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[For You] API error:', errorData);
        throw new Error('Failed to fetch recommendations');
      }

      const data = await response.json();
      console.log('[For You] Received data:', {
        success: data.success,
        count: data.recommendations?.length || 0,
        personalized: data.meta?.personalized,
        cache_hit: data.meta?.cache_hit,
      });

      if (data.success) {
        setProducts(data.recommendations || []);
        setIsPersonalized(data.meta?.personalized || false);
        setHasMore(false); // For now, single page of recommendations
      } else {
        console.error('[For You] API returned success=false:', data);
      }
    } catch (error) {
      console.error('[For You] Error fetching recommendations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchRecommendations(true);
  };

  return (
    <>
      {/* Header */}
      <MarketplaceHeader />

      <MarketplaceLayout showFooter={false}>
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-4 sm:py-8 pt-16 sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Header Section */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-br from-purple-500 to-pink-500">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                    For You
                  </h1>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {isPersonalized
                      ? 'Personalised recommendations based on your activity'
                      : 'Trending products you might like'}
                  </p>
                </div>
              </div>

              {/* Refresh Button */}
              <Button
                onClick={handleRefresh}
                disabled={refreshing}
                variant="outline"
                className="rounded-md flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>

            {/* Personalization Notice */}
            {!user && (
              <div className="bg-white rounded-md border border-gray-200 p-4 flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Sign in for personalised recommendations
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    We'll learn your preferences and show you products you'll love. For now, here are some trending items.
                  </p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Products Grid */}
            {!loading && products.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
                {products.map((product, index) => (
                  <div
                    key={product.id}
                    onClick={() => {
                      tracker.trackClick(product.id, {
                        source: 'for_you_page',
                        position: index,
                        is_personalized: isPersonalized,
                      });
                    }}
                  >
                    <ProductCard product={product} priority={index < 6} />
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && products.length === 0 && (
              <div className="bg-white rounded-md border border-gray-200 p-12 text-center">
                <Sparkles className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No recommendations yet
                </h3>
                <p className="text-gray-600 max-w-md mx-auto mb-6">
                  Start browsing products to help us learn your preferences and show you personalised recommendations.
                </p>
                <Button
                  onClick={() => window.location.href = '/marketplace'}
                  className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium"
                >
                  Browse Marketplace
                </Button>
              </div>
            )}

            {/* Load More Button */}
            {!loading && products.length > 0 && hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={() => {
                    // For future pagination implementation
                    setPage(page + 1);
                  }}
                  variant="outline"
                  className="rounded-md"
                  disabled
                >
                  Load More
                </Button>
              </div>
            )}

            {/* Info Section */}
            {!loading && products.length > 0 && (
              <div className="bg-white rounded-md border border-gray-200 p-6 mt-8">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  How we personalise your recommendations
                </h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="text-[#FFC72C] mt-1">•</span>
                    <span>Products from categories you browse most often</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FFC72C] mt-1">•</span>
                    <span>Items similar to products you've viewed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FFC72C] mt-1">•</span>
                    <span>Trending products in your price range</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FFC72C] mt-1">•</span>
                    <span>Products from stores you've shown interest in</span>
                  </li>
                </ul>
              </div>
            )}
          </motion.div>
        </div>
      </MarketplaceLayout>
    </>
  );
}


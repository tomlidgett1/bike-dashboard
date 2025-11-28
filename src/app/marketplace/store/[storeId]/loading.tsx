import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { Card, CardContent } from "@/components/ui/card";

// ============================================================
// Store Profile Loading State
// Optimised skeleton for instant feedback
// ============================================================

export default function StoreProfileLoading() {
  return (
    <MarketplaceLayout>
      <div className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Back Button Skeleton */}
        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-8" />

        {/* Store Header Skeleton - No Box */}
        <div className="mb-12 animate-pulse">
          <div className="flex items-start gap-6">
            {/* Large Circular Logo Skeleton */}
            <div className="flex-shrink-0 h-32 w-32 rounded-full bg-gray-200 border-4 border-white shadow-lg" />

            {/* Info Skeleton */}
            <div className="flex-1 pt-4 space-y-3">
              <div className="h-10 bg-gray-200 rounded w-1/3" />
              <div className="flex items-center gap-4">
                <div className="h-6 w-20 bg-gray-200 rounded-md" />
                <div className="h-5 w-28 bg-gray-200 rounded" />
                <div className="h-4 w-4 bg-gray-200 rounded-full" />
                <div className="h-5 w-32 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Skeleton */}
        <div className="bg-gray-100 p-0.5 rounded-md w-fit mb-8 animate-pulse">
          <div className="flex gap-1">
            <div className="h-9 w-32 bg-gray-200 rounded-md" />
            <div className="h-9 w-28 bg-gray-200 rounded-md" />
            <div className="h-9 w-36 bg-gray-200 rounded-md" />
          </div>
        </div>

        {/* Products Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i} className="overflow-hidden rounded-md border-gray-200 animate-pulse">
              <CardContent className="p-0">
                {/* Image */}
                <div className="aspect-square bg-gray-200" />
                {/* Content */}
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="flex items-center justify-between">
                    <div className="h-6 bg-gray-200 rounded w-20" />
                    <div className="h-4 bg-gray-200 rounded w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </MarketplaceLayout>
  );
}


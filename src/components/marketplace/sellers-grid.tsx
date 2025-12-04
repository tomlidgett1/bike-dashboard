"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { User, Package, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { IndividualSeller } from "@/app/api/marketplace/sellers/route";

// ============================================================
// Seller Card
// World-class minimalist design with circular avatar
// ============================================================

interface SellerCardProps {
  seller: IndividualSeller;
  priority?: boolean;
}

export function SellerCard({ seller, priority = false }: SellerCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/marketplace/store/${seller.id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
      whileHover={{ y: -2 }}
      className="group cursor-pointer"
      onClick={handleClick}
    >
      <Card className="overflow-hidden rounded-md border-gray-200 bg-white hover:border-gray-300 hover:shadow-md transition-all duration-200">
        <CardContent className="p-6">
          {/* Centered Circular Avatar */}
          <div className="flex flex-col items-center mb-4">
            <div className="relative h-20 w-20 rounded-full bg-gray-50 overflow-hidden border border-gray-200 mb-3 group-hover:border-gray-300 transition-colors">
              {seller.logo_url ? (
                <Image
                  src={seller.logo_url}
                  alt={seller.display_name}
                  fill
                  className="object-cover"
                  priority={priority}
                  sizes="80px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                  <span className="text-2xl font-bold text-gray-400">
                    {seller.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Seller Name */}
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1.5 line-clamp-2">
              {seller.display_name}
            </h3>

            {/* Location */}
            {seller.location && (
              <div className="flex items-center gap-1 text-xs text-gray-500 text-center">
                <MapPin className="h-3 w-3" />
                <span className="line-clamp-1">{seller.location}</span>
              </div>
            )}
          </div>

          {/* Product Count */}
          <div className="flex items-center justify-center gap-1.5 pt-3 border-t border-gray-100">
            <Package className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-sm text-gray-600">
              {seller.product_count} {seller.product_count === 1 ? 'item' : 'items'}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================================
// Seller Card Skeleton
// Loading state
// ============================================================

export function SellerCardSkeleton() {
  return (
    <Card className="overflow-hidden rounded-md border-gray-200 bg-white">
      <CardContent className="p-6">
        <div className="flex flex-col items-center">
          {/* Circular Avatar Skeleton */}
          <div className="h-20 w-20 rounded-full bg-gray-200 animate-pulse mb-3" />
          
          {/* Seller Name Skeleton */}
          <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4 mb-1.5" />
          
          {/* Location Skeleton */}
          <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2 mb-4" />
          
          {/* Product Count Skeleton */}
          <div className="flex items-center justify-center gap-1.5 pt-3 border-t border-gray-100 w-full">
            <div className="h-3.5 w-3.5 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Sellers Grid
// Displays grid of individual sellers
// ============================================================

interface SellersGridProps {
  sellers: IndividualSeller[];
  loading?: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export function SellersGrid({ sellers, loading = false }: SellersGridProps) {
  // Empty state
  if (!loading && sellers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4">
        <div className="rounded-full bg-gray-100 p-6 mb-4">
          <User className="h-12 w-12 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          No individual sellers found
        </h3>
        <p className="text-sm text-gray-600 text-center max-w-md">
          There are currently no individual sellers with active listings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Sellers Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
      >
        {sellers.map((seller, index) => (
          <SellerCard key={seller.id} seller={seller} priority={index < 12} />
        ))}

        {/* Loading Skeletons */}
        {loading &&
          Array.from({ length: 12 }).map((_, i) => (
            <SellerCardSkeleton key={`skeleton-${i}`} />
          ))}
      </motion.div>
    </div>
  );
}


"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { Store, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ============================================================
// Store Card
// World-class minimalist design with circular logo
// ============================================================

interface StoreCardProps {
  store: {
    id: string;
    store_name: string;
    store_type: string;
    logo_url: string | null;
    product_count: number;
    joined_date: string;
  };
  priority?: boolean;
}

export function StoreCard({ store, priority = false }: StoreCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/marketplace/store/${store.id}`);
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
          {/* Centered Circular Logo */}
          <div className="flex flex-col items-center mb-4">
            <div className="relative h-20 w-20 rounded-full bg-gray-50 overflow-hidden border border-gray-200 mb-3 group-hover:border-gray-300 transition-colors">
              {store.logo_url ? (
                <Image
                  src={store.logo_url}
                  alt={store.store_name}
                  fill
                  className="object-cover"
                  priority={priority}
                  sizes="80px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Store className="h-10 w-10 text-gray-300" />
                </div>
              )}
            </div>

            {/* Store Name */}
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1.5 line-clamp-2">
              {store.store_name}
            </h3>

            {/* Store Type */}
            <p className="text-xs text-gray-500 text-center">
              {store.store_type}
            </p>
          </div>

          {/* Simple Product Count */}
          <div className="flex items-center justify-center gap-1.5 pt-3 border-t border-gray-100">
            <Package className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-sm text-gray-600">
              {store.product_count} {store.product_count === 1 ? 'product' : 'products'}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================================
// Store Card Skeleton
// Loading state
// ============================================================

export function StoreCardSkeleton() {
  return (
    <Card className="overflow-hidden rounded-md border-gray-200 bg-white">
      <CardContent className="p-6">
        <div className="flex flex-col items-center">
          {/* Circular Logo Skeleton */}
          <div className="h-20 w-20 rounded-full bg-gray-200 animate-pulse mb-3" />
          
          {/* Store Name Skeleton */}
          <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4 mb-1.5" />
          
          {/* Store Type Skeleton */}
          <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2 mb-4" />
          
          {/* Product Count Skeleton */}
          <div className="flex items-center justify-center gap-1.5 pt-3 border-t border-gray-100 w-full">
            <div className="h-3.5 w-3.5 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


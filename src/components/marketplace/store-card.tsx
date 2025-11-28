"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Store, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ============================================================
// Store Card
// Displays bike store information with navigation
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
  const joinedDate = new Date(store.joined_date).toLocaleDateString('en-AU', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <Link href={`/marketplace/store/${store.id}`} prefetch={true}>
        <Card className="overflow-hidden rounded-md border-gray-200 bg-white hover:shadow-lg transition-shadow duration-200 cursor-pointer">
          <CardContent className="p-6">
          {/* Store Logo */}
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0 h-16 w-16 rounded-md bg-gray-100 overflow-hidden border border-gray-200">
              {store.logo_url ? (
                <Image
                  src={store.logo_url}
                  alt={store.store_name}
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                  priority={priority}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Store className="h-8 w-8 text-gray-300" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* Store Name */}
              <h3 className="text-lg font-semibold text-gray-900 truncate mb-1">
                {store.store_name}
              </h3>

              {/* Store Type */}
              <Badge
                variant="secondary"
                className="rounded-md bg-gray-100 text-gray-600 text-xs font-medium border-0"
              >
                {store.store_type}
              </Badge>
            </div>
          </div>

          {/* Store Stats */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 flex items-center gap-1.5">
                <Package className="h-4 w-4" />
                Products
              </span>
              <span className="font-semibold text-gray-900">
                {store.product_count}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Joined</span>
              <span className="text-gray-600">{joinedDate}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      </Link>
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
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 h-16 w-16 rounded-md bg-gray-200 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-6 bg-gray-200 rounded animate-pulse w-3/4" />
            <div className="h-5 w-20 bg-gray-200 rounded-md animate-pulse" />
          </div>
        </div>
        <div className="space-y-2 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-8 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


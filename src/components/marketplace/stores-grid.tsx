"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Loader2, Store } from "lucide-react";
import { StoreCard, StoreCardSkeleton } from "./store-card";

// ============================================================
// Stores Grid
// Displays grid of bike stores
// ============================================================

interface Store {
  id: string;
  store_name: string;
  store_type: string;
  logo_url: string | null;
  product_count: number;
  joined_date: string;
}

interface StoresGridProps {
  stores: Store[];
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

export function StoresGrid({ stores, loading = false }: StoresGridProps) {
  // Empty state
  if (!loading && stores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4">
        <div className="rounded-full bg-gray-100 p-6 mb-4">
          <Store className="h-12 w-12 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          No stores found
        </h3>
        <p className="text-sm text-gray-600 text-center max-w-md">
          There are currently no stores on the platform with active listings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stores Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-4"
      >
        {stores.map((store, index) => (
          <StoreCard key={store.id} store={store} priority={index < 12} />
        ))}

        {/* Loading Skeletons */}
        {loading &&
          Array.from({ length: 12 }).map((_, i) => (
            <StoreCardSkeleton key={`skeleton-${i}`} />
          ))}
      </motion.div>
    </div>
  );
}








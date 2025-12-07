"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Store, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { StoreCategoryWithProducts } from "@/lib/types/store";

// ============================================================
// Store Profile Header
// Logo, name, categories, and contact button
// ============================================================

interface StoreHeaderProps {
  storeName: string;
  storeType: string;
  logoUrl: string | null;
  categories: StoreCategoryWithProducts[];
  selectedCategory: string | null;
  onCategorySelect: (categoryId: string | null) => void;
  onContactClick: () => void;
}

export function StoreHeader({
  storeName,
  storeType,
  logoUrl,
  categories,
  selectedCategory,
  onCategorySelect,
  onContactClick,
}: StoreHeaderProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="bg-white border-b border-gray-200 sticky top-16 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Top Section: Logo, Name, and Contact Button */}
        <div className="flex items-start gap-4 mb-6">
          {/* Circular Logo */}
          <div className="relative h-20 w-20 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 flex-shrink-0">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={storeName}
                fill
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Store className="h-10 w-10 text-gray-400" />
              </div>
            )}
          </div>

          {/* Store Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{storeName}</h1>
            <p className="text-sm text-gray-600">{storeType}</p>
          </div>

          {/* Contact Button */}
          <Button
            onClick={onContactClick}
            variant="outline"
            className="flex-shrink-0 rounded-md border-gray-300 hover:bg-gray-50"
          >
            <Phone className="h-4 w-4 mr-2" />
            Contact
          </Button>
        </div>

        {/* Categories Pills */}
        {categories.length > 0 && (
          <div className="relative">
            <div
              ref={scrollContainerRef}
              className="overflow-x-auto scrollbar-hide -mx-2 px-2"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              <div className="flex gap-2 pb-1" style={{ minWidth: 'min-content' }}>
                {/* All Products */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onCategorySelect(null)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === null
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Products
                </motion.button>

                {/* Category Pills */}
                {categories.map((category) => (
                  <motion.button
                    key={category.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onCategorySelect(category.id)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedCategory === category.id
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category.name}
                    <span className="ml-1.5 opacity-70">({category.product_count})</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}





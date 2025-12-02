"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SellerProduct, SellerCategory } from "@/app/api/marketplace/seller/[sellerId]/route";

// ============================================================
// Seller Product Grid (Depop-style)
// Responsive grid with square product cards
// ============================================================

interface ProductCardProps {
  product: SellerProduct;
  index: number;
}

function ProductCard({ product, index }: ProductCardProps) {
  // Format price
  const formattedPrice = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(product.price);

  // Get display name
  const displayName = product.display_name || product.description;
  const truncatedName = displayName.length > 40 
    ? displayName.substring(0, 40) + '...' 
    : displayName;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.3, 
        delay: index * 0.05,
        ease: [0.04, 0.62, 0.23, 0.98]
      }}
    >
      <Link
        href={`/marketplace/product/${product.id}`}
        className="group block"
      >
        {/* Square Image Container */}
        <div className="relative aspect-square overflow-hidden rounded-md bg-gray-100 mb-2">
          {product.primary_image_url ? (
            <Image
              src={product.primary_image_url}
              alt={displayName}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-gray-300" />
            </div>
          )}
          
          {/* Condition Badge */}
          {product.condition_rating && (
            <div className="absolute top-2 left-2">
              <span className="px-2 py-1 bg-white/90 backdrop-blur-sm rounded-md text-xs font-medium text-gray-700 shadow-sm">
                {product.condition_rating}
              </span>
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-200" />
        </div>

        {/* Product Info */}
        <div className="px-0.5">
          <p className="text-sm font-semibold text-gray-900 mb-0.5">
            {formattedPrice}
          </p>
          <p className="text-sm text-gray-600 line-clamp-2 leading-snug">
            {truncatedName}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

interface SellerProductGridProps {
  categories: SellerCategory[];
  selectedCategory: string | null;
  className?: string;
}

export function SellerProductGrid({
  categories,
  selectedCategory,
  className,
}: SellerProductGridProps) {
  // Get products to display based on selected category
  const products = React.useMemo(() => {
    if (selectedCategory === null) {
      // Show all products from all categories
      return categories.flatMap(cat => cat.products);
    }
    
    // Find the selected category and return its products
    const category = categories.find(cat => cat.id === selectedCategory);
    return category?.products || [];
  }, [categories, selectedCategory]);

  // Empty state
  if (products.length === 0) {
    return (
      <div className={cn("py-20", className)}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 mb-4">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No items yet
            </h3>
            <p className="text-sm text-gray-600">
              This seller hasn't listed any items in this category.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("py-6", className)}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Responsive Grid: 2 cols mobile, 3 cols tablet, 4 cols desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}


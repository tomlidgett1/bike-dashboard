"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Package, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SellerProduct, SellerCategory } from "@/app/api/marketplace/seller/[sellerId]/route";

// ============================================================
// Seller Product Grid
// Responsive 5-column grid with product cards
// ============================================================

interface ProductCardProps {
  product: SellerProduct;
  index: number;
  isSold?: boolean;
}

function ProductCard({ product, index, isSold }: ProductCardProps) {
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
        delay: Math.min(index * 0.03, 0.3),
        ease: [0.04, 0.62, 0.23, 0.98]
      }}
    >
      <Link
        href={`/marketplace/product/${product.id}`}
        className="group block"
      >
        {/* Square Image Container */}
        <div className={cn(
          "relative aspect-square overflow-hidden rounded-md bg-gray-100 mb-2",
          isSold && "opacity-75"
        )}>
          {product.primary_image_url ? (
            <Image
              src={product.primary_image_url}
              alt={displayName}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-gray-300" />
            </div>
          )}
          
          {/* Condition Badge */}
          {product.condition_rating && !isSold && (
            <div className="absolute top-2 left-2">
              <span className="px-2 py-1 bg-white/90 backdrop-blur-sm rounded-md text-xs font-medium text-gray-700 shadow-sm">
                {product.condition_rating}
              </span>
            </div>
          )}

          {/* Sold Badge */}
          {isSold && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="px-3 py-1.5 bg-white rounded-md text-sm font-semibold text-gray-900 shadow-md flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" />
                SOLD
              </span>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="px-0.5">
          <p className={cn(
            "text-sm font-semibold mb-0.5",
            isSold ? "text-gray-500 line-through" : "text-gray-900"
          )}>
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
  isSoldTab?: boolean;
  className?: string;
}

export function SellerProductGrid({
  categories,
  selectedCategory,
  isSoldTab = false,
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 mb-4">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isSoldTab ? 'No sold items yet' : 'No items for sale'}
            </h3>
            <p className="text-sm text-gray-600">
              {isSoldTab 
                ? "This seller hasn't sold any items yet."
                : "This seller hasn't listed any items in this category."
              }
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("py-6", className)}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Responsive Grid: 2 cols mobile, 3 cols tablet, 5 cols desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map((product, index) => (
            <ProductCard 
              key={product.id} 
              product={product} 
              index={index} 
              isSold={isSoldTab}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

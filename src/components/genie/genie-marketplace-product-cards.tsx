"use client";

import Image from "next/image";
import Link from "next/link";
import { Bike } from "@/components/layout/app-sidebar/dashboard-icons";
import { motion } from "framer-motion";
import type { GenieMarketplaceProduct } from "@/lib/genie/marketplace-search";
import { cn } from "@/lib/utils";

function formatPrice(price: number | string | null | undefined): string {
  if (price == null || Number(price) <= 0) return "";
  return `$${Number(price).toFixed(2)}`;
}

function MarketplaceProductCard({ product }: { product: GenieMarketplaceProduct }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-none w-[140px] min-h-0 snap-start overflow-hidden"
    >
      <Link href={product.product_url} className="group block">
        <div className="relative aspect-square overflow-hidden rounded-md border border-gray-200/80 bg-gray-100">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name ?? "Product"}
              fill
              className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
              sizes="140px"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Bike className="h-7 w-7 text-gray-300" />
            </div>
          )}
          {product.in_stock ? (
            <div className="absolute top-1.5 right-1.5">
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-700 shadow-sm ring-1 ring-gray-200">
                Available
              </span>
            </div>
          ) : null}
        </div>
        <div className="space-y-0.5 px-0.5 pt-1.5">
          <p className="line-clamp-2 text-xs font-medium leading-tight text-gray-900">{product.name}</p>
          {product.store_name ? (
            <p className="truncate text-[10px] font-medium text-gray-700">{product.store_name}</p>
          ) : null}
          {product.category ? (
            <p className="truncate text-[10px] text-gray-500">{product.category}</p>
          ) : null}
          <div className="pt-0.5">
            {product.price ? (
              <span className="text-xs font-semibold text-gray-900">{formatPrice(product.price)}</span>
            ) : (
              <span className="text-[10px] text-gray-500">Price on request</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

interface GenieMarketplaceProductCardsProps {
  products: GenieMarketplaceProduct[];
  label?: string;
  className?: string;
}

export function GenieMarketplaceProductCards({
  products,
  label = "On Yellow Jersey now",
  className,
}: GenieMarketplaceProductCardsProps) {
  if (!products.length) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="px-0.5 text-[11px] font-medium text-gray-500">{label}</p>
      <div
        className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-hide"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="flex items-start gap-2.5" style={{ minWidth: "min-content" }}>
          {products.map((product) => (
            <MarketplaceProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
}

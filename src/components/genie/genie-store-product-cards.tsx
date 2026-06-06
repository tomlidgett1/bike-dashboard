"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Bike, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GenieStoreProductPreview } from "@/lib/genie/store-product-previews";

function formatPrice(price: number | null): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(price);
}

function StoreProductCard({ product }: { product: GenieStoreProductPreview }) {
  const priceLabel = formatPrice(product.price);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-[168px] shrink-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm"
    >
      <div className="relative flex h-[104px] items-center justify-center overflow-hidden bg-gray-50">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover"
            sizes="168px"
            unoptimized={product.image.startsWith("http") && !product.image.includes("cloudinary")}
          />
        ) : (
          <Bike className="h-7 w-7 text-gray-300" />
        )}
        {product.in_stock === true ? (
          <span className="absolute right-2 top-2 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-700 shadow-sm ring-1 ring-gray-200">
            In stock
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="space-y-0.5">
          <p className="line-clamp-2 text-xs font-medium leading-snug text-gray-800">{product.name}</p>
          {product.category ? (
            <p className="truncate text-[10px] text-gray-500">{product.category}</p>
          ) : null}
          {priceLabel ? (
            <p className="pt-0.5 text-xs font-semibold text-gray-800">{priceLabel}</p>
          ) : null}
        </div>

        {product.product_url ? (
          <Button asChild variant="outline" size="sm" className="mt-auto h-8 w-full rounded-md text-xs">
            <Link href={product.product_url} target="_blank" rel="noopener noreferrer">
              View product
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Button>
        ) : (
          <div className="mt-auto rounded-md bg-gray-50 px-2 py-1.5 text-center text-[10px] text-gray-500 ring-1 ring-gray-200">
            No live listing yet
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function GenieStoreProductCards({
  products,
  title = "Your products",
  className,
}: {
  products: GenieStoreProductPreview[];
  title?: string;
  className?: string;
}) {
  if (!products.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5 px-0.5">
        <Package className="h-3.5 w-3.5 text-gray-500" />
        <p className="text-[11px] font-medium text-gray-600">{title}</p>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {products.map((product) => (
          <StoreProductCard key={`${product.id}-${product.name}`} product={product} />
        ))}
      </div>
    </div>
  );
}

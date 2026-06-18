"use client";

import { Sparkles } from '@/components/layout/app-sidebar/dashboard-icons';
import { useGenie } from "@/components/providers/genie-provider";
import { buildProductGenieContext } from "@/lib/genie/product-context";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
import { useProductAskGeniePillVisible } from "@/lib/hooks/use-product-ask-genie-pill-visible";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

interface ProductAskGenieImageBadgeProps {
  product: MarketplaceProduct;
  className?: string;
}

export function ProductAskGenieImageBadge({ product, className }: ProductAskGenieImageBadgeProps) {
  const { openForProduct } = useGenie();
  const { pillVisible } = useProductAskGeniePillVisible(product.id);

  if (pillVisible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openForProduct(buildProductGenieContext(product));
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98]",
        className,
      )}
      aria-label="Ask anything about this product"
    >
      <Sparkles className="h-3 w-3 flex-shrink-0 text-gray-500" />
      <span
        className={cn("tracking-tight", genieProgressShimmerClassName)}
        style={genieProgressShimmerStyle}
      >
        Ask anything
      </span>
    </button>
  );
}

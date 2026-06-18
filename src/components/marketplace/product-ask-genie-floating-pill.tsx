"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "@/components/layout/app-sidebar/dashboard-icons";
import { useGenie } from "@/components/providers/genie-provider";
import { buildProductGenieContext } from "@/lib/genie/product-context";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerDarkStyle,
} from "@/lib/genie/shimmer";
import { useProductAskGeniePillVisible } from "@/lib/hooks/use-product-ask-genie-pill-visible";
import { cn } from "@/lib/utils";

const PILL_ENTER_TRANSITION = {
  type: "spring" as const,
  bounce: 0.32,
  duration: 0.58,
};

interface ProductAskGenieFloatingPillProps {
  product: MarketplaceProduct;
  className?: string;
}

export function ProductAskGenieFloatingPill({ product, className }: ProductAskGenieFloatingPillProps) {
  const { openForProduct } = useGenie();
  const { pillVisible: visible } = useProductAskGeniePillVisible(product.id);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="product-ask-genie-pill"
          initial={{ opacity: 0, y: 40, scale: 0.78 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.9 }}
          transition={PILL_ENTER_TRANSITION}
          className={cn(
            "sm:hidden fixed right-4 bottom-0 z-40 w-fit pointer-events-none",
            className,
          )}
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => openForProduct(buildProductGenieContext(product))}
            className="pointer-events-auto flex w-fit items-center gap-2 rounded-full bg-[#ffde59] px-4 py-3 shadow-[0_4px_24px_rgba(255,222,89,0.4),0_2px_8px_rgba(17,17,17,0.08)] transition-transform hover:bg-[#f0cf45] active:scale-[0.97]"
            aria-label="Ask anything about this product"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-gray-600" />
            <span
              className={cn(
                "whitespace-nowrap text-[15px] font-semibold tracking-tight text-gray-500",
                genieProgressShimmerClassName,
              )}
              style={genieProgressShimmerDarkStyle}
            >
              Ask anything
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

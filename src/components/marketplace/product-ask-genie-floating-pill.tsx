"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGenie } from "@/components/providers/genie-provider";
import { buildProductGenieContext } from "@/lib/genie/product-context";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerDarkStyle,
} from "@/lib/genie/shimmer";
import { cn } from "@/lib/utils";

const SCROLL_SHOW_THRESHOLD_PX = 96;

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
  const { openForProduct, isOpen, productContext } = useGenie();
  const panelOpen = isOpen && productContext?.id === product.id;
  const [hasScrolled, setHasScrolled] = React.useState(false);

  React.useEffect(() => {
    const updateScroll = () => {
      setHasScrolled(window.scrollY > SCROLL_SHOW_THRESHOLD_PX);
    };

    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateScroll);
  }, []);

  const visible = hasScrolled && !panelOpen;

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
            "sm:hidden fixed inset-x-0 bottom-0 z-40 pointer-events-none",
            className,
          )}
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[340px] px-4">
            <button
              type="button"
              onClick={() => openForProduct(buildProductGenieContext(product))}
              className="flex w-full items-center justify-center rounded-full bg-[#ffde59] px-5 py-3 shadow-[0_4px_24px_rgba(255,222,89,0.4),0_2px_8px_rgba(17,17,17,0.08)] transition-transform hover:bg-[#f0cf45] active:scale-[0.97]"
              aria-label="Ask anything about this product"
            >
              <span
                className={cn(
                  "text-[15px] font-semibold tracking-tight text-gray-500",
                  genieProgressShimmerClassName,
                )}
                style={genieProgressShimmerDarkStyle}
              >
                Ask anything about this
              </span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSellModal } from "@/components/providers/sell-modal-provider";
import { shouldRenderListItemBanner } from "@/lib/marketplace/list-item-banner-placement";

// ============================================================
// List Item Banner — Dark premium mobile CTA
// Shown after the 6th row of products (mobile only, 2-col grid)
// ============================================================

const BRAND_YELLOW = "#ffde59";
const FILTER_INK = "#1c1c1e";

interface ListItemBannerProps {
  className?: string;
}

export function ListItemBanner({ className }: ListItemBannerProps) {
  const { openSellModal } = useSellModal();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn("col-span-2 my-2 sm:hidden", className)}
    >
      <button
        type="button"
        onClick={openSellModal}
        className="group relative w-full overflow-hidden rounded-md px-4 py-3.5 text-left shadow-sm transition-all active:scale-[0.99]"
        style={{ backgroundColor: FILTER_INK }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full opacity-25 blur-2xl"
          style={{
            background: "radial-gradient(circle, #ffde59 0%, rgba(255,222,89,0) 70%)",
          }}
        />
        <div className="relative flex items-center gap-3.5">
          <span
            className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full"
            style={{ backgroundColor: BRAND_YELLOW }}
          >
            <Tag className="h-5 w-5" style={{ color: FILTER_INK }} strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-tight text-white">
              Got gear to sell?
            </p>
            <p className="mt-0.5 text-[13px] text-gray-400">Turn it into cash today</p>
          </div>
          <span
            className="flex h-9 items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-transform group-hover:translate-x-0.5"
            style={{ backgroundColor: BRAND_YELLOW, color: FILTER_INK }}
          >
            List now
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
          </span>
        </div>
      </button>
    </motion.div>
  );
}

interface ListItemBannerSlotProps {
  productIndex: number;
  productCount: number;
  className?: string;
}

/** Renders `ListItemBanner` after the 6th product row on mobile when eligible. */
export function ListItemBannerSlot({
  productIndex,
  productCount,
  className,
}: ListItemBannerSlotProps) {
  if (!shouldRenderListItemBanner(productIndex, productCount)) {
    return null;
  }

  return <ListItemBanner className={className} />;
}

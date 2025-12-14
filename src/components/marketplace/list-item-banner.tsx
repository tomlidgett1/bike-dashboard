"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSellModal } from "@/components/providers/sell-modal-provider";

// ============================================================
// List Item Banner - Mobile promotional banner
// Shows after 6 rows of products to encourage listings
// Compact horizontal design
// ============================================================

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
      className={cn(
        "col-span-2 my-2",
        className
      )}
    >
      <button
        onClick={openSellModal}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-md px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              Got gear to sell?
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              It only takes a few minutes.
            </p>
          </div>
          <div className="flex items-center gap-1 bg-[#FFC72C] text-gray-900 text-xs font-medium px-3 py-1.5 rounded-md whitespace-nowrap">
            <span>List now</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </button>
    </motion.div>
  );
}

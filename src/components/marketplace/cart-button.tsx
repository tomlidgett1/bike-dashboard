"use client";

// ============================================================
// Header Cart Button
// ============================================================
// Icon button with an item-count badge that opens the cart drawer.
// Used in both the mobile and desktop header clusters.

import * as React from "react";
import { ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/providers/cart-provider";

export function CartButton({ className }: { className?: string }) {
  // Badge reflects total units (sum of quantities), not distinct lines.
  const { totalQuantity, openCart, hydrated } = useCart();
  const showBadge = hydrated && totalQuantity > 0;

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={
        totalQuantity > 0
          ? `Cart, ${totalQuantity} item${totalQuantity === 1 ? "" : "s"}`
          : "Cart"
      }
      className={cn(
        "relative h-9 w-9 rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center overflow-visible cursor-pointer",
        className
      )}
    >
      <ShoppingCart className="h-[22px] w-[22px] text-gray-700 stroke-[2]" />
      {showBadge && (
        <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center font-bold shadow-sm z-10">
          {totalQuantity > 99 ? "99+" : totalQuantity}
        </span>
      )}
    </button>
  );
}

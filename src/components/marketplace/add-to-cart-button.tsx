"use client";

// ============================================================
// Add to Cart Button
// ============================================================
// Adds a product to the marketplace cart. Cross-seller conflicts and the
// max-item limit are handled by the CartProvider (a global replace dialog
// renders from the CartDrawer). Auth is NOT required to build a cart — it is
// enforced at checkout.

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Check } from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";
import { useCart, MAX_CART_ITEMS } from "@/components/providers/cart-provider";

interface AddToCartButtonProps {
  productId: string;
  productName: string;
  productPrice: number;
  sellerId: string;
  sellerName: string;
  uberDeliveryEligible?: boolean;
  productImage?: string | null;
  shippingAvailable?: boolean;
  shippingCost?: number;
  pickupLocation?: string | null;
  pickupOnly?: boolean;
  /** Max purchasable units (stock on hand). 1 for unique listings; qoh for shop inventory. */
  maxQuantity?: number;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  fullWidth?: boolean;
  className?: string;
}

export function AddToCartButton({
  productId,
  productName,
  productPrice,
  sellerId,
  sellerName,
  uberDeliveryEligible = false,
  productImage,
  shippingAvailable = false,
  shippingCost = 0,
  pickupLocation = null,
  pickupOnly = false,
  maxQuantity = 1,
  variant = "outline",
  size = "lg",
  fullWidth = false,
  className,
}: AddToCartButtonProps) {
  const { addItem, openCart, has } = useCart();
  const [error, setError] = React.useState<string | null>(null);
  const inCart = has(productId);

  const handleClick = () => {
    setError(null);

    if (inCart) {
      openCart();
      return;
    }

    const result = addItem({
      productId,
      name: productName,
      image: productImage ?? null,
      price: productPrice,
      sellerId,
      sellerName,
      uberDeliveryEligible,
      shippingAvailable,
      shippingCost,
      pickupLocation,
      pickupOnly,
      quantity: 1,
      maxQuantity,
    });

    if (result === "added" || result === "exists") {
      openCart();
    } else if (result === "full") {
      setError(`Cart is full (max ${MAX_CART_ITEMS} items)`);
    }
    // "needs_replace" → the global replace dialog (CartDrawer) takes over.
  };

  return (
    <div className={cn("flex flex-col", fullWidth && "w-full")}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        className={cn("rounded-md font-medium", fullWidth && "w-full", className)}
        aria-label={inCart ? "View cart" : "Add to cart"}
      >
        {inCart ? (
          <>
            <Check className="h-4 w-4" />
            In Cart
          </>
        ) : (
          <>
            <ShoppingCart className="h-4 w-4" />
            Add to Cart
          </>
        )}
      </Button>
      {error && <p className="text-xs text-red-500 mt-2 text-center">{error}</p>}
    </div>
  );
}

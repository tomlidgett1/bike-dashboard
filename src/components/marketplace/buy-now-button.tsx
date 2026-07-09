// ============================================================
// BUY NOW BUTTON COMPONENT
// ============================================================
// Starts a single-item checkout intent using the shared cart drawer flow.
// The drawer posts to /api/stripe/create-cart-checkout, so Buy Now and cart
// purchases share the same server validation, Stripe metadata, and webhook path.

'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { useAuthModal } from '@/components/providers/auth-modal-provider';
import { useCart } from '@/components/providers/cart-provider';
import { Button } from '@/components/ui/button';
import { ShoppingBag } from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface BuyNowButtonProps {
  productId: string;
  productName: string;
  productPrice: number;
  sellerId: string;
  sellerName?: string;
  uberDeliveryEligible?: boolean;
  productImage?: string | null;
  /** Max purchasable units (stock on hand). 1 for unique listings; qoh for shop inventory. */
  maxQuantity?: number;
  shippingAvailable?: boolean;
  shippingCost?: number;
  pickupLocation?: string | null;
  pickupOnly?: boolean;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm' | 'lg';
  fullWidth?: boolean;
  className?: string;
  showStripeBranding?: boolean;
}

// ============================================================
// Component
// ============================================================

export function BuyNowButton({
  productId,
  productName,
  productPrice,
  sellerId,
  sellerName,
  uberDeliveryEligible = false,
  productImage,
  maxQuantity = 1,
  shippingAvailable = false,
  shippingCost = 0,
  pickupLocation = null,
  pickupOnly = false,
  variant = 'default',
  size = 'default',
  fullWidth = false,
  className,
  showStripeBranding = true,
}: BuyNowButtonProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { startBuyNow } = useCart();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);

    // Check authentication
    if (!user) {
      openAuthModal();
      return;
    }

    // Prevent buying your own product
    if (user.id === sellerId) {
      setError('You cannot purchase your own product');
      return;
    }

    startBuyNow({
      productId,
      name: productName,
      image: productImage ?? null,
      price: productPrice,
      sellerId,
      sellerName: sellerName ?? 'Seller',
      uberDeliveryEligible,
      shippingAvailable,
      shippingCost,
      pickupLocation,
      pickupOnly,
      quantity: 1,
      maxQuantity,
    });
  };

  return (
    <div className={cn('flex flex-col', fullWidth && 'w-full')}>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={cn(
          'rounded-md font-medium transition-all',
          variant === 'default' && 'bg-gray-900 hover:bg-gray-800 text-white',
          fullWidth && 'w-full',
          className
        )}
      >
        <div className="flex items-center justify-center w-full">
          <ShoppingBag className="h-4 w-4 mr-2" />
          <span>{`Buy Now · $${productPrice.toLocaleString('en-AU')}`}</span>
          {showStripeBranding && (
            <>
              <div className="w-px h-4 bg-white/20 mx-2.5" />
              <span className="text-[10px] text-white/50 mr-1">Powered by</span>
              <Image
                src="/stripe.svg"
                alt="Stripe"
                width={32}
                height={13}
                style={{ filter: 'brightness(0) invert(1)' }}
                className="opacity-70"
              />
            </>
          )}
        </div>
      </Button>

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-500 mt-2 text-center">
          {error}
        </p>
      )}
    </div>
  );
}

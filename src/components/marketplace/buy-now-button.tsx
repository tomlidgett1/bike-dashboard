// ============================================================
// BUY NOW BUTTON COMPONENT
// ============================================================
// Opens embedded Stripe checkout sheet for product purchase
// Displays loading state and handles authentication

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/components/providers/auth-provider';
import { useAuthModal } from '@/components/providers/auth-modal-provider';
import { Button } from '@/components/ui/button';
import { ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { CheckoutSheet } from './checkout-sheet';

// ============================================================
// Types
// ============================================================

interface BuyNowButtonProps {
  productId: string;
  productName: string;
  productPrice: number;
  sellerId: string;
  productImage?: string | null;
  shippingCost?: number;
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
  productImage,
  shippingCost = 0,
  variant = 'default',
  size = 'default',
  fullWidth = false,
  className,
  showStripeBranding = true,
}: BuyNowButtonProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
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

    // Open checkout sheet
    setIsCheckoutOpen(true);
  };

  const handleSuccess = () => {
    // The checkout sheet handles navigation to success page
    console.log('[BuyNow] Payment successful');
  };

  return (
    <>
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
          <ShoppingBag className="h-4 w-4 mr-2" />
          Buy Now · ${productPrice.toLocaleString('en-AU')}
        </Button>

        {/* Stripe Branding */}
        {showStripeBranding && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="text-[10px] text-gray-400">Secured by</span>
            <Image
              src="/stripe.svg"
              alt="Stripe"
              width={36}
              height={15}
              className="opacity-50"
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-500 mt-2 text-center"
          >
            {error}
          </motion.p>
        )}
      </div>

      {/* Checkout Sheet */}
      <CheckoutSheet
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        productId={productId}
        productName={productName}
        productPrice={productPrice}
        productImage={productImage}
        sellerId={sellerId}
        onSuccess={handleSuccess}
      />
    </>
  );
}

// ============================================================
// BUY NOW BUTTON COMPONENT
// ============================================================
// Opens embedded Stripe checkout sheet for product purchase (desktop)
// Shows delivery selection then redirects to Stripe checkout page on mobile
// Displays loading state and handles authentication

'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/components/providers/auth-provider';
import { useAuthModal } from '@/components/providers/auth-modal-provider';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { CheckoutSheet } from './checkout-sheet';
import { MobileDeliverySheet, type DeliveryMethod } from './mobile-delivery-sheet';

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
  pickupLocation?: string | null;
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
  pickupLocation,
  variant = 'default',
  size = 'default',
  fullWidth = false,
  className,
  showStripeBranding = true,
}: BuyNowButtonProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isMobileDeliveryOpen, setIsMobileDeliveryOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleClick = async () => {
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

    // On mobile, open delivery selection sheet first
    if (isMobile) {
      setIsMobileDeliveryOpen(true);
      return;
    }

    // On desktop, open checkout sheet
    setIsCheckoutOpen(true);
  };

  // Handle mobile checkout after delivery selection
  const handleMobileCheckout = async (deliveryMethod: DeliveryMethod) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId,
          deliveryMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('[BuyNow] Error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsLoading(false);
      setIsMobileDeliveryOpen(false);
    }
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
          disabled={isLoading}
          className={cn(
            'rounded-md font-medium transition-all',
            variant === 'default' && 'bg-gray-900 hover:bg-gray-800 text-white',
            fullWidth && 'w-full',
            className
          )}
        >
          <div className="flex items-center justify-center w-full">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span>Redirecting...</span>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </Button>

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

      {/* Desktop: Checkout Sheet */}
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

      {/* Mobile: Delivery Selection Sheet */}
      <MobileDeliverySheet
        isOpen={isMobileDeliveryOpen}
        onClose={() => {
          setIsMobileDeliveryOpen(false);
          setIsLoading(false);
        }}
        productId={productId}
        productName={productName}
        productPrice={productPrice}
        productImage={productImage}
        pickupLocation={pickupLocation}
        onCheckout={handleMobileCheckout}
        isLoading={isLoading}
      />
    </>
  );
}

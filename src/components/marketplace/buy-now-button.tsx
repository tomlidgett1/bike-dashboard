// ============================================================
// BUY NOW BUTTON COMPONENT
// ============================================================
// Initiates Stripe Checkout for product purchase
// Displays loading state and handles authentication

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/components/providers/auth-provider';
import { useAuthModal } from '@/components/providers/auth-modal-provider';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// ============================================================
// Types
// ============================================================

interface BuyNowButtonProps {
  productId: string;
  productName: string;
  productPrice: number;
  sellerId: string;
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
  shippingCost = 0,
  variant = 'default',
  size = 'default',
  fullWidth = false,
  className,
  showStripeBranding = true,
}: BuyNowButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPrice = productPrice + shippingCost;

  const handleClick = async () => {
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
    }
  };

  return (
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
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <ShoppingBag className="h-4 w-4 mr-2" />
            Buy Now · ${totalPrice.toLocaleString('en-AU')}
          </>
        )}
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
  );
}


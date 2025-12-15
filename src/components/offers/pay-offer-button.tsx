// ============================================================
// PAY OFFER BUTTON COMPONENT
// ============================================================
// Initiates Stripe Checkout for paying an accepted offer
// Mobile-first design with savings display

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/components/providers/auth-provider';
import { useAuthModal } from '@/components/providers/auth-modal-provider';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, Clock, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import type { PayOfferButtonProps } from '@/lib/types/offer';
import { formatPaymentTimeRemaining, isPaymentDeadlineExpired, calculateSavings } from '@/lib/types/offer';

// ============================================================
// Component
// ============================================================

export function PayOfferButton({
  offerId,
  offerAmount,
  originalPrice,
  productName,
  productId,
  shippingCost = 0,
  variant = 'default',
  size = 'default',
  fullWidth = false,
  className,
  showStripeBranding = true,
  paymentDeadline,
}: PayOfferButtonProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPrice = offerAmount + shippingCost;
  const savings = calculateSavings(originalPrice, offerAmount);
  const savingsPercentage = ((savings / originalPrice) * 100).toFixed(0);
  
  // Check if deadline has passed
  const deadlineExpired = paymentDeadline ? isPaymentDeadlineExpired(paymentDeadline) : false;
  const timeRemaining = paymentDeadline ? formatPaymentTimeRemaining(paymentDeadline) : null;

  const handleClick = async () => {
    // Check authentication
    if (!user) {
      openAuthModal();
      return;
    }

    // Check deadline
    if (deadlineExpired) {
      setError('Payment deadline has passed. Please contact the seller.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stripe/create-checkout-offer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          offerId,
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
      console.error('[PayOffer] Error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsLoading(false);
    }
  };

  // Disabled state
  if (deadlineExpired) {
    return (
      <div className={cn('flex flex-col', fullWidth && 'w-full')}>
        <Button
          variant="outline"
          size={size}
          disabled
          className={cn(
            'rounded-md font-medium',
            fullWidth && 'w-full',
            className
          )}
        >
          <Clock className="h-4 w-4 mr-2 text-gray-400" />
          Payment Deadline Passed
        </Button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Contact the seller to arrange payment
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', fullWidth && 'w-full')}>
      {/* Savings Banner */}
      {savings > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 mb-2 py-2 px-3 bg-green-50 border border-green-200 rounded-md"
        >
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">
            You save ${savings.toLocaleString('en-AU')} ({savingsPercentage}% off)
          </span>
        </motion.div>
      )}

      {/* Pay Now Button */}
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
            <CreditCard className="h-4 w-4 mr-2" />
            Pay Now · ${totalPrice.toLocaleString('en-AU')}
          </>
        )}
      </Button>

      {/* Payment Deadline Warning */}
      {timeRemaining && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          <Clock className="h-3 w-3 text-amber-600" />
          <span className="text-xs text-amber-600 font-medium">{timeRemaining}</span>
        </div>
      )}

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

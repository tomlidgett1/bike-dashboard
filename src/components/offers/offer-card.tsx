'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OfferCardProps } from '@/lib/types/offer';
import { calculateSavings } from '@/lib/types/offer';

function getStatusDisplay(
  status: string,
  role: 'buyer' | 'seller',
  paymentStatus?: string,
): { text: string; highlight: boolean } {
  if (status === 'accepted' && paymentStatus === 'pending' && role === 'buyer') {
    return { text: 'Pay now', highlight: true };
  }
  switch (status) {
    case 'pending':
      return role === 'seller'
        ? { text: 'Respond', highlight: true }
        : { text: 'Awaiting response', highlight: false };
    case 'countered':
      return role === 'buyer'
        ? { text: 'Counter received', highlight: true }
        : { text: 'Countered', highlight: false };
    case 'accepted':
      return { text: 'Accepted', highlight: false };
    case 'rejected':
      return { text: 'Declined', highlight: false };
    case 'expired':
      return { text: 'Expired', highlight: false };
    case 'cancelled':
      return { text: 'Cancelled', highlight: false };
    default:
      return { text: status, highlight: false };
  }
}

export function OfferCard({ offer, role, onViewDetails }: OfferCardProps) {
  const [imageError, setImageError] = useState(false);

  const savings = calculateSavings(offer.original_price, offer.offer_amount);
  const savingsPercentage =
    offer.offer_percentage || (savings / offer.original_price) * 100;

  const productName =
    offer.product?.display_name || offer.product?.description || 'Product';
  const productImage = offer.product?.primary_image_url;
  const otherParty = role === 'buyer' ? offer.seller : offer.buyer;
  const otherPartyName =
    otherParty?.business_name || otherParty?.name || 'User';
  const status = getStatusDisplay(offer.status, role, offer.payment_status);

  return (
    <button
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 rounded-lg transition-colors text-left"
      onClick={() => onViewDetails?.(offer.id)}
    >
      <div className="relative h-9 w-9 rounded-md overflow-hidden bg-muted flex-shrink-0">
        {productImage && !imageError ? (
          <Image
            src={productImage}
            alt={productName}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium text-foreground truncate">
            {productName}
          </p>
          <p className="text-[13px] font-semibold text-foreground flex-shrink-0">
            ${offer.offer_amount.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            <span className="text-xs text-muted-foreground truncate">
              {otherPartyName}
            </span>
            <span className="text-muted-foreground/40 flex-shrink-0 text-xs">·</span>
            <span
              className={cn(
                'text-xs flex-shrink-0',
                status.highlight
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              {status.text}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">
            {savingsPercentage.toFixed(0)}% off
          </span>
        </div>
      </div>
    </button>
  );
}

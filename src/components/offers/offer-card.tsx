// ============================================================
// OFFER CARD COMPONENT
// ============================================================
// Clean, Apple-inspired design for offer cards
// Mobile-first: minimal, elegant, tap for details

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChevronRight, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OfferCardProps } from '@/lib/types/offer';
import { calculateSavings } from '@/lib/types/offer';

// Simple status text without badges
function getStatusDisplay(status: string, role: 'buyer' | 'seller'): { text: string; color: string } {
  switch (status) {
    case 'pending':
      return { 
        text: role === 'buyer' ? 'Awaiting response' : 'New offer', 
        color: 'text-gray-500' 
      };
    case 'countered':
      return { 
        text: role === 'buyer' ? 'Counter-offer received' : 'You countered', 
        color: 'text-blue-600' 
      };
    case 'accepted':
      return { text: 'Accepted', color: 'text-green-600' };
    case 'rejected':
      return { text: 'Declined', color: 'text-gray-400' };
    case 'expired':
      return { text: 'Expired', color: 'text-gray-400' };
    case 'cancelled':
      return { text: 'Cancelled', color: 'text-gray-400' };
    default:
      return { text: status, color: 'text-gray-500' };
  }
}

export function OfferCard({
  offer,
  role,
  onViewDetails,
  compact = false,
}: OfferCardProps) {
  const [imageError, setImageError] = useState(false);

  const savings = calculateSavings(offer.original_price, offer.offer_amount);
  const savingsPercentage = offer.offer_percentage || ((savings / offer.original_price) * 100);

  const productName = offer.product?.display_name || offer.product?.description || 'Product';
  const productImage = offer.product?.primary_image_url;

  const otherParty = role === 'buyer' ? offer.seller : offer.buyer;
  const otherPartyName = otherParty?.business_name || otherParty?.name || 'User';

  const statusDisplay = getStatusDisplay(offer.status, role);
  
  // Check if action needed
  const needsAction = (role === 'buyer' && offer.status === 'countered') || 
                      (role === 'seller' && offer.status === 'pending') ||
                      (role === 'buyer' && offer.status === 'accepted' && offer.payment_status === 'pending');

  return (
    <button
      className={cn(
        'w-full text-left bg-white rounded-xl transition-all',
        'active:scale-[0.98] active:bg-gray-50',
        'border border-gray-100',
        compact ? 'p-3' : 'p-4'
      )}
      onClick={() => onViewDetails?.(offer.id)}
    >
      <div className="flex gap-3">
        {/* Product Image */}
        <div className={cn(
          'relative rounded-lg overflow-hidden bg-gray-50 flex-shrink-0',
          compact ? 'h-14 w-14' : 'h-16 w-16'
        )}>
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
              <Package className="h-6 w-6 text-gray-300" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {/* Product Name */}
          <h3 className={cn(
            'font-semibold text-gray-900 truncate',
            compact ? 'text-sm' : 'text-[15px]'
          )}>
            {productName}
          </h3>

          {/* Seller/Buyer */}
          <p className="text-[13px] text-gray-500 mt-0.5">
            {otherPartyName}
          </p>

          {/* Status */}
          <p className={cn('text-[13px] font-medium mt-1', statusDisplay.color)}>
            {statusDisplay.text}
            {needsAction && offer.status !== 'accepted' && (
              <span className="ml-1">·</span>
            )}
            {needsAction && offer.status !== 'accepted' && (
              <span className="text-gray-900"> Respond</span>
            )}
            {offer.status === 'accepted' && offer.payment_status === 'pending' && role === 'buyer' && (
              <>
                <span className="ml-1">·</span>
                <span className="text-gray-900"> Pay now</span>
              </>
            )}
          </p>
        </div>

        {/* Right side: Price + Chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <p className="text-[15px] font-semibold text-gray-900">
              ${offer.offer_amount.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
            </p>
            <p className="text-[12px] text-gray-400">
              {savingsPercentage.toFixed(0)}% off
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300" />
        </div>
      </div>
    </button>
  );
}

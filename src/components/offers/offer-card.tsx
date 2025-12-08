// ============================================================
// OFFER CARD COMPONENT
// ============================================================
// Individual offer card for list view

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { OfferStatusBadge } from './offer-status-badge';
import { Button } from '@/components/ui/button';
import { Check, X, Reply, Ban, MessageCircle, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OfferCardProps } from '@/lib/types/offer';
import { canAcceptOffer, canRejectOffer, canCounterOffer, canCancelOffer, calculateSavings } from '@/lib/types/offer';
import { useAuth } from '@/components/providers/auth-provider';

export function OfferCard({
  offer,
  role,
  onAccept,
  onReject,
  onCounter,
  onCancel,
  onViewDetails,
  compact = false,
  loadingOfferId,
  loadingAction,
}: OfferCardProps) {
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  
  const isLoading = loadingOfferId === offer.id;
  const isAccepting = isLoading && loadingAction === 'accept';
  const isRejecting = isLoading && loadingAction === 'reject';
  const isCountering = isLoading && loadingAction === 'counter';
  const isCancelling = isLoading && loadingAction === 'cancel';

  const savings = calculateSavings(offer.original_price, offer.offer_amount);
  const savingsPercentage = offer.offer_percentage || ((savings / offer.original_price) * 100);

  const productName = offer.product?.display_name || offer.product?.description || 'Product';
  const productImage = offer.product?.primary_image_url;

  const otherParty = role === 'buyer' ? offer.seller : offer.buyer;
  const otherPartyName = otherParty?.business_name || otherParty?.name || 'User';

  const showAccept = user && canAcceptOffer(offer, user.id);
  const showReject = user && canRejectOffer(offer, user.id);
  const showCounter = user && canCounterOffer(offer, user.id);
  const showCancel = user && canCancelOffer(offer, user.id);

  return (
    <div
      className={cn(
        'bg-white border border-gray-200 rounded-md hover:shadow-md transition-all cursor-pointer',
        compact ? 'p-3' : 'p-4'
      )}
      onClick={() => onViewDetails?.(offer.id)}
    >
      <div className="flex gap-3">
        {/* Product Image */}
        {productImage && !imageError ? (
          <div className={cn(
            'relative rounded-md overflow-hidden bg-gray-100 flex-shrink-0',
            compact ? 'h-16 w-16' : 'h-20 w-20'
          )}>
            <Image
              src={productImage}
              alt={productName}
              fill
              className="object-cover"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div className={cn(
            'relative rounded-md overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center',
            compact ? 'h-16 w-16' : 'h-20 w-20'
          )}>
            <span className="text-gray-400 text-xs">No Image</span>
          </div>
        )}

        {/* Offer Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className={cn(
              'font-semibold text-gray-900 truncate',
              compact ? 'text-sm' : 'text-base'
            )}>
              {productName}
            </h3>
            <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
          </div>

          <p className="text-xs text-gray-600 mb-2">
            {role === 'buyer' ? 'To:' : 'From:'} {otherPartyName}
          </p>

          <OfferStatusBadge status={offer.status} expiresAt={offer.expires_at} />

          <div className={cn('mt-3 space-y-1', compact ? 'text-xs' : 'text-sm')}>
            <div className="flex justify-between">
              <span className="text-gray-600">Original:</span>
              <span className="text-gray-900 line-through">
                ${offer.original_price.toLocaleString('en-AU')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Offer:</span>
              <span className="font-bold text-gray-900">
                ${offer.offer_amount.toLocaleString('en-AU')}
              </span>
            </div>
            <div className="flex justify-between text-green-700">
              <span className="font-medium">Savings:</span>
              <span className="font-bold">
                ${savings.toLocaleString('en-AU')} ({savingsPercentage.toFixed(0)}% off)
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          {!compact && (showAccept || showReject || showCounter || showCancel) && (
            <div className="flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
              {showAccept && (
                <Button
                  size="sm"
                  onClick={() => onAccept?.(offer.id)}
                  disabled={isLoading}
                  className="rounded-md text-xs flex-1 min-w-[90px]"
                >
                  {isAccepting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Accept
                    </>
                  )}
                </Button>
              )}
              {showReject && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReject?.(offer.id)}
                  disabled={isLoading}
                  className="rounded-md text-xs flex-1 min-w-[90px]"
                >
                  {isRejecting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <X className="h-3.5 w-3.5 mr-1" />
                      Reject
                    </>
                  )}
                </Button>
              )}
              {showCounter && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCounter?.(offer.id)}
                  disabled={isLoading}
                  className="rounded-md text-xs flex-1 min-w-[90px]"
                >
                  {isCountering ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Countering...
                    </>
                  ) : (
                    <>
                      <Reply className="h-3.5 w-3.5 mr-1" />
                      Counter
                    </>
                  )}
                </Button>
              )}
              {showCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCancel?.(offer.id)}
                  disabled={isLoading}
                  className="rounded-md text-xs flex-1 min-w-[90px]"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <Ban className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {offer.message && !compact && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-600 italic line-clamp-2">
            "{offer.message}"
          </p>
        </div>
      )}
    </div>
  );
}


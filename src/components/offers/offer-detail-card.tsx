// ============================================================
// OFFER DETAIL CARD COMPONENT
// ============================================================
// Detailed view of a single offer with history

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useOffer } from '@/lib/hooks/use-offers';
import { OfferStatusBadge } from './offer-status-badge';
import { Button } from '@/components/ui/button';
import { 
  Check, 
  X, 
  Reply, 
  Ban, 
  MessageCircle, 
  ArrowLeft, 
  Clock,
  User,
  Package,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OfferDetailCardProps } from '@/lib/types/offer';
import { 
  canAcceptOffer, 
  canRejectOffer, 
  canCounterOffer, 
  canCancelOffer,
  calculateSavings 
} from '@/lib/types/offer';
import { useAuth } from '@/components/providers/auth-provider';

export function OfferDetailCard({
  offer,
  role,
  onAccept,
  onReject,
  onCounter,
  onCancel,
  onMessage,
  accepting,
  rejecting,
  countering,
  cancelling,
}: OfferDetailCardProps) {
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);

  const savings = calculateSavings(offer.original_price, offer.offer_amount);
  const savingsPercentage = offer.offer_percentage || ((savings / offer.original_price) * 100);

  const productName = offer.product?.display_name || offer.product?.description || 'Product';
  const productImage = offer.product?.primary_image_url;

  const otherParty = role === 'buyer' ? offer.seller : offer.buyer;
  const otherPartyName = otherParty?.business_name || otherParty?.name || 'User';
  const otherPartyLogo = otherParty?.logo_url;

  const showAccept = user && canAcceptOffer(offer, user.id);
  const showReject = user && canRejectOffer(offer, user.id);
  const showCounter = user && canCounterOffer(offer, user.id);
  const showCancel = user && canCancelOffer(offer, user.id);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-4">
        {/* Product Info */}
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <div className="flex gap-3">
            {productImage && !imageError ? (
              <div className="relative h-24 w-24 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                <Image
                  src={productImage}
                  alt={productName}
                  fill
                  className="object-cover"
                  onError={() => setImageError(true)}
                />
              </div>
            ) : (
              <div className="relative h-24 w-24 rounded-md overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                {productName}
              </h3>
              <OfferStatusBadge status={offer.status} expiresAt={offer.expires_at} />
            </div>
          </div>
        </div>

        {/* Pricing Details */}
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Pricing</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Original Price:</span>
              <span className="font-medium text-gray-900 line-through">
                ${offer.original_price.toLocaleString('en-AU')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Offer Amount:</span>
              <span className="text-lg font-bold text-gray-900">
                ${offer.offer_amount.toLocaleString('en-AU')}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="text-green-700 font-medium">Total Savings:</span>
              <span className="font-bold text-green-700">
                ${savings.toLocaleString('en-AU')} ({savingsPercentage.toFixed(1)}% off)
              </span>
            </div>
          </div>
        </div>

        {/* Other Party Info */}
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">
            {role === 'buyer' ? 'Seller' : 'Buyer'}
          </h4>
          <div className="flex items-center gap-3">
            {otherPartyLogo ? (
              <div className="relative h-10 w-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                <Image
                  src={otherPartyLogo}
                  alt={otherPartyName}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-gray-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{otherPartyName}</p>
              {onMessage && (
                <button
                  onClick={onMessage}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mt-1"
                >
                  <MessageCircle className="h-3 w-3" />
                  Send message
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Message */}
        {offer.message && (
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Message</h4>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{offer.message}</p>
          </div>
        )}

        {/* Offer History */}
        {offer.history && offer.history.length > 1 && (
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">History</h4>
            <div className="space-y-3">
              {offer.history.map((event, index) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'h-2 w-2 rounded-full',
                      index === offer.history!.length - 1 ? 'bg-blue-500' : 'bg-gray-300'
                    )} />
                    {index < offer.history!.length - 1 && (
                      <div className="w-px h-full bg-gray-200 my-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="text-xs font-medium text-gray-900 capitalize">
                      {event.action_type.replace('_', ' ')}
                    </p>
                    {event.new_amount && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        ${event.new_amount.toLocaleString('en-AU')}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(event.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <div className="space-y-2 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>Created:</span>
              <span>{formatDate(offer.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span>Expires:</span>
              <span>{formatDate(offer.expires_at)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {(showAccept || showReject || showCounter || showCancel) && (
          <div className="sticky bottom-0 bg-white border border-gray-200 rounded-md p-4 space-y-2">
            {showAccept && (
              <Button
                onClick={onAccept}
                className="w-full rounded-md"
                size="lg"
                disabled={accepting || rejecting || countering || cancelling}
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Accept Offer
                  </>
                )}
              </Button>
            )}
            <div className="flex gap-2">
              {showReject && (
                <Button
                  onClick={onReject}
                  variant="outline"
                  className="flex-1 rounded-md"
                  disabled={accepting || rejecting || countering || cancelling}
                >
                  {rejecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <X className="h-4 w-4 mr-2" />
                      Reject
                    </>
                  )}
                </Button>
              )}
              {showCounter && (
                <Button
                  onClick={onCounter}
                  variant="outline"
                  className="flex-1 rounded-md"
                  disabled={accepting || rejecting || countering || cancelling}
                >
                  <Reply className="h-4 w-4 mr-2" />
                  Counter
                </Button>
              )}
              {showCancel && (
                <Button
                  onClick={onCancel}
                  variant="outline"
                  className="w-full rounded-md"
                  disabled={accepting || rejecting || countering || cancelling}
                >
                  {cancelling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4 mr-2" />
                      Cancel Offer
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


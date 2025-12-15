// ============================================================
// OFFER DETAIL CARD COMPONENT
// ============================================================
// Detailed view of a single offer with history
// Mobile-optimised with larger touch targets and sticky actions

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { OfferStatusBadge } from './offer-status-badge';
import { PayOfferButton } from './pay-offer-button';
import { Button } from '@/components/ui/button';
import { 
  Check, 
  X, 
  Reply, 
  Ban, 
  MessageCircle, 
  User,
  Package,
  Loader2,
  Clock,
  CheckCircle,
  CreditCard
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OfferDetailCardProps } from '@/lib/types/offer';
import { 
  canAcceptOffer, 
  canRejectOffer, 
  canCounterOffer, 
  canCancelOffer,
  canPayOffer,
  isOfferPaid,
  isOfferAwaitingPayment,
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
  
  // Payment actions (for buyer when offer is accepted)
  const showPayNow = user && canPayOffer(offer, user.id);
  const isPaid = isOfferPaid(offer);
  const isAwaitingPayment = isOfferAwaitingPayment(offer);
  
  const hasActions = showAccept || showReject || showCounter || showCancel || showPayNow;

  // Determine if this is a counter-offer the buyer needs to respond to
  const isCounterOfferForBuyer = offer.status === 'countered' && role === 'buyer';
  // Determine if buyer is waiting for seller response
  const isWaitingForSeller = offer.status === 'pending' && role === 'buyer';

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isAnyLoading = accepting || rejecting || countering || cancelling;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-0">
      {/* Scrollable Content */}
      <div className={cn(
        "flex-1 overflow-y-auto",
        hasActions ? "pb-4" : "pb-[calc(1rem+env(safe-area-inset-bottom))]"
      )}>
        {/* Hero Section: Product + Price */}
        <div className="bg-white border-b border-gray-200">
          <div className="p-4">
            <div className="flex gap-4">
              {/* Product Image - Larger on mobile */}
              {productImage && !imageError ? (
                <div className="relative h-20 w-20 md:h-24 md:w-24 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                  <Image
                    src={productImage}
                    alt={productName}
                    fill
                    className="object-cover"
                    onError={() => setImageError(true)}
                  />
                </div>
              ) : (
                <div className="relative h-20 w-20 md:h-24 md:w-24 rounded-md overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  <Package className="h-8 w-8 text-gray-400" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 mb-2 leading-tight">
                  {productName}
                </h3>
                <OfferStatusBadge 
                  status={offer.status} 
                  paymentStatus={offer.payment_status}
                  expiresAt={offer.expires_at} 
                  paymentDeadline={offer.payment_deadline}
                />
              </div>
            </div>

            {/* Counter-Offer Alert Banner (for buyers) */}
            {isCounterOfferForBuyer && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Reply className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-800">Seller Counter-Offer</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      The seller has proposed a new price. You can accept, decline, or counter.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Waiting for Seller Banner (for buyers) */}
            {isWaitingForSeller && (
              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    Waiting for seller to respond to your offer
                  </p>
                </div>
              </div>
            )}

            {/* Prominent Price Display */}
            <div className="mt-4 p-4 bg-gray-50 rounded-md">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Your Offer</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${offer.offer_amount.toLocaleString('en-AU')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">Original</p>
                  <p className="text-base text-gray-500 line-through">
                    ${offer.original_price.toLocaleString('en-AU')}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <span className="text-sm text-green-700 font-medium">Total Savings</span>
                <span className="text-sm font-bold text-green-700">
                  ${savings.toLocaleString('en-AU')} ({savingsPercentage.toFixed(0)}% off)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="p-4 space-y-4">
          {/* Other Party Info */}
          <div className="bg-white rounded-md p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              {role === 'buyer' ? 'Seller' : 'Buyer'}
            </h4>
            <div className="flex items-center gap-3">
              {otherPartyLogo ? (
                <div className="relative h-12 w-12 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                  <Image
                    src={otherPartyLogo}
                    alt={otherPartyName}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <User className="h-6 w-6 text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate text-base">{otherPartyName}</p>
                {onMessage && (
                  <button
                    onClick={onMessage}
                    className="text-sm text-blue-600 hover:text-blue-700 active:text-blue-800 font-medium flex items-center gap-1.5 mt-1"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Send message
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Message */}
          {offer.message && (
            <div className="bg-white rounded-md p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Message</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{offer.message}</p>
            </div>
          )}

          {/* Offer History */}
          {offer.history && offer.history.length > 1 && (
            <div className="bg-white rounded-md p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">History</h4>
              <div className="space-y-0">
                {offer.history.map((event, index) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        'h-2.5 w-2.5 rounded-full mt-1',
                        index === offer.history!.length - 1 ? 'bg-blue-500' : 'bg-gray-300'
                      )} />
                      {index < offer.history!.length - 1 && (
                        <div className="w-px flex-1 bg-gray-200 my-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {event.action_type.replace('_', ' ')}
                      </p>
                      {event.new_amount && (
                        <p className="text-sm text-gray-600 mt-0.5">
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
          <div className="bg-white rounded-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-900">Timeline</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Created</span>
                <span className="text-gray-900">{formatDate(offer.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Expires</span>
                <span className="text-gray-900">{formatDate(offer.expires_at)}</span>
              </div>
              {offer.payment_deadline && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Deadline</span>
                  <span className={cn(
                    "text-gray-900",
                    new Date(offer.payment_deadline) < new Date() && "text-red-600"
                  )}>
                    {formatDate(offer.payment_deadline)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Complete Message (for buyers) */}
          {isPaid && role === 'buyer' && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">Payment Complete</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    The seller has been notified. Check your purchases for delivery updates.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Payment Awaiting Message (for sellers) */}
          {isAwaitingPayment && role === 'seller' && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Awaiting Payment</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    The buyer has been notified to complete payment.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Action Buttons - Fixed at bottom with safe area */}
      {hasActions && (
        <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="space-y-3">
            {/* Primary Action: Pay Now (for buyers with accepted offers) */}
            {showPayNow && (
              <PayOfferButton
                offerId={offer.id}
                offerAmount={offer.offer_amount}
                originalPrice={offer.original_price}
                productName={productName}
                productId={offer.product_id}
                paymentDeadline={offer.payment_deadline}
                fullWidth
                size="lg"
                className="h-12 text-base"
                showStripeBranding={true}
              />
            )}

            {/* Primary Action: Accept (for sellers OR buyers accepting counter-offer) */}
            {showAccept && (
              <Button
                onClick={onAccept}
                className="w-full rounded-md h-12 text-base font-medium"
                disabled={isAnyLoading}
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    {isCounterOfferForBuyer ? 'Accept Counter-Offer' : 'Accept Offer'}
                  </>
                )}
              </Button>
            )}
            
            {/* Secondary Actions Row */}
            {(showReject || showCounter || showCancel) && (
              <div className="flex gap-3">
                {showReject && (
                  <Button
                    onClick={onReject}
                    variant="outline"
                    className="flex-1 rounded-md h-12 text-base font-medium"
                    disabled={isAnyLoading}
                  >
                    {rejecting ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        <span className="hidden xs:inline">
                          {isCounterOfferForBuyer ? 'Declining...' : 'Rejecting...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <X className="h-5 w-5 mr-2" />
                        {isCounterOfferForBuyer ? 'Decline' : 'Reject'}
                      </>
                    )}
                  </Button>
                )}
                {showCounter && (
                  <Button
                    onClick={onCounter}
                    variant="outline"
                    className="flex-1 rounded-md h-12 text-base font-medium"
                    disabled={isAnyLoading}
                  >
                    {countering ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Reply className="h-5 w-5 mr-2" />
                        Counter
                      </>
                    )}
                  </Button>
                )}
                {showCancel && (
                  <Button
                    onClick={onCancel}
                    variant="outline"
                    className={cn(
                      "rounded-md h-12 text-base font-medium",
                      !showReject && !showCounter ? "w-full" : "flex-1"
                    )}
                    disabled={isAnyLoading}
                  >
                    {cancelling ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        <span className="hidden xs:inline">Cancelling...</span>
                      </>
                    ) : (
                      <>
                        <Ban className="h-5 w-5 mr-2" />
                        Cancel
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

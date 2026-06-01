'use client';

import { useState } from 'react';
import Image from 'next/image';
import { PayOfferButton } from './pay-offer-button';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Check,
  X as XIcon,
  Reply,
  Ban,
  Package,
  Loader2,
  CheckCircle2,
  CreditCard,
  User,
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
  calculateSavings,
} from '@/lib/types/offer';
import { useAuth } from '@/components/providers/auth-provider';

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function StatusPill({
  status,
  paymentStatus,
}: {
  status: string;
  paymentStatus?: string;
}) {
  type PillConfig = { label: string; className: string };
  const configs: Record<string, PillConfig> = {
    pending: { label: 'Pending', className: 'bg-muted text-muted-foreground' },
    countered: {
      label: 'Counter offer',
      className:
        'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    },
    accepted: {
      label: 'Accepted',
      className:
        'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
    },
    rejected: { label: 'Declined', className: 'bg-muted text-muted-foreground' },
    expired: { label: 'Expired', className: 'bg-muted text-muted-foreground' },
    cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  };

  let config: PillConfig = configs[status] ?? {
    label: status,
    className: 'bg-muted text-muted-foreground',
  };

  if (status === 'accepted' && paymentStatus === 'paid') {
    config = {
      label: 'Paid',
      className:
        'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
    };
  } else if (status === 'accepted' && paymentStatus === 'pending') {
    config = {
      label: 'Awaiting payment',
      className:
        'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    };
  } else if (status === 'accepted' && paymentStatus === 'failed') {
    config = {
      label: 'Payment failed',
      className: 'bg-destructive/10 text-destructive',
    };
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium',
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}

export function OfferDetailCard({
  offer,
  role,
  onAccept,
  onReject,
  onCounter,
  onCancel,
  accepting,
  rejecting,
  countering,
  cancelling,
}: OfferDetailCardProps) {
  const { user } = useAuth();
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
  const otherPartyLogo = otherParty?.logo_url;

  const showAccept = user && canAcceptOffer(offer, user.id);
  const showReject = user && canRejectOffer(offer, user.id);
  const showCounter = user && canCounterOffer(offer, user.id);
  const showCancel = user && canCancelOffer(offer, user.id);
  const showPayNow = user && canPayOffer(offer, user.id);
  const isPaid = isOfferPaid(offer);
  const isAwaitingPayment = isOfferAwaitingPayment(offer);
  const hasActions =
    showAccept || showReject || showCounter || showCancel || showPayNow;

  const isCounterForBuyer = offer.status === 'countered' && role === 'buyer';
  const isAnyLoading = accepting || rejecting || countering || cancelling;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className={cn('flex-1 overflow-y-auto', hasActions ? 'pb-2' : 'pb-4')}>

        {/* Product */}
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
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
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm font-medium text-foreground leading-snug">
              {productName}
            </p>
            <div className="mt-1.5">
              <StatusPill
                status={offer.status}
                paymentStatus={offer.payment_status}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Pricing */}
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
            Pricing
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Offer amount</span>
              <span className="text-sm font-semibold text-foreground">
                ${offer.offer_amount.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Listed price</span>
              <span className="text-xs text-muted-foreground line-through">
                ${offer.original_price.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Saving</span>
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                ${savings.toLocaleString('en-AU', { minimumFractionDigits: 0 })} · {savingsPercentage.toFixed(0)}% off
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Counterparty */}
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
            {role === 'buyer' ? 'Seller' : 'Buyer'}
          </p>
          <div className="flex items-center gap-2.5">
            {otherPartyLogo ? (
              <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                <Image
                  src={otherPartyLogo}
                  alt={otherPartyName}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
            <span className="text-sm text-foreground">{otherPartyName}</span>
          </div>
        </div>

        {/* Counter note for buyers */}
        {isCounterForBuyer && (
          <>
            <Separator />
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                The seller has proposed{' '}
                <span className="font-semibold text-foreground">
                  ${offer.offer_amount.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                </span>
                . Accept, decline, or send a counter.
              </p>
            </div>
          </>
        )}

        {/* Message */}
        {offer.message && (
          <>
            <Separator />
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Message
              </p>
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {offer.message}
              </p>
            </div>
          </>
        )}

        {/* History */}
        {offer.history && offer.history.length > 1 && (
          <>
            <Separator />
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
                History
              </p>
              <div className="space-y-2">
                {offer.history.map((event, index) => (
                  <div key={event.id} className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        'h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0',
                        index === offer.history!.length - 1
                          ? 'bg-foreground'
                          : 'bg-muted-foreground/30',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground capitalize">
                          {event.action_type.replace('_', ' ')}
                        </span>
                        {event.new_amount && (
                          <span className="text-xs font-medium text-foreground">
                            ${event.new_amount.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDate(event.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Timeline */}
        <Separator />
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
            Timeline
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Submitted</span>
              <span className="text-xs text-foreground">
                {formatDate(offer.created_at)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Expires</span>
              <span className="text-xs text-foreground">
                {formatDate(offer.expires_at)}
              </span>
            </div>
            {offer.payment_deadline && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Payment by</span>
                <span
                  className={cn(
                    'text-xs',
                    new Date(offer.payment_deadline) < new Date()
                      ? 'text-destructive'
                      : 'text-foreground',
                  )}
                >
                  {formatDate(offer.payment_deadline)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Payment complete */}
        {isPaid && role === 'buyer' && (
          <>
            <Separator />
            <div className="px-4 py-3 flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
              <p className="text-xs text-foreground">
                Payment complete. Check your purchases for updates.
              </p>
            </div>
          </>
        )}

        {/* Awaiting payment (seller) */}
        {isAwaitingPayment && role === 'seller' && (
          <>
            <Separator />
            <div className="px-4 py-3 flex items-center gap-2.5">
              <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Awaiting payment from the buyer.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      {hasActions && (
        <div className="flex-shrink-0 border-t border-border/50 px-4 py-3 bg-background space-y-2">
          {showPayNow && (
            <PayOfferButton
              offerId={offer.id}
              offerAmount={offer.offer_amount}
              originalPrice={offer.original_price}
              productName={productName}
              productId={offer.product_id}
              paymentDeadline={offer.payment_deadline}
              fullWidth
              size="sm"
              className="h-9 text-sm"
              showStripeBranding={false}
            />
          )}

          {showAccept && (
            <Button
              onClick={onAccept}
              size="sm"
              className="w-full h-9"
              disabled={isAnyLoading}
            >
              {accepting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  {isCounterForBuyer ? 'Accept counter offer' : 'Accept offer'}
                </>
              )}
            </Button>
          )}

          {(showReject || showCounter || showCancel) && (
            <div className="flex gap-2">
              {showReject && (
                <Button
                  onClick={onReject}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9"
                  disabled={isAnyLoading}
                >
                  {rejecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <XIcon className="h-3.5 w-3.5 mr-1.5" />
                      Decline
                    </>
                  )}
                </Button>
              )}
              {showCounter && (
                <Button
                  onClick={onCounter}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9"
                  disabled={isAnyLoading}
                >
                  {countering ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Reply className="h-3.5 w-3.5 mr-1.5" />
                      Counter
                    </>
                  )}
                </Button>
              )}
              {showCancel && (
                <Button
                  onClick={onCancel}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9',
                    !showReject && !showCounter ? 'w-full' : 'flex-1',
                  )}
                  disabled={isAnyLoading}
                >
                  {cancelling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Ban className="h-3.5 w-3.5 mr-1.5" />
                      Cancel
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

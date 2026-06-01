'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import type { EnrichedOffer } from '@/lib/types/offer';
import { calculateSavings } from '@/lib/types/offer';

interface OfferConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  offer: EnrichedOffer;
  action: 'accept' | 'reject' | 'cancel';
  loading?: boolean;
  role?: 'buyer' | 'seller';
}

function getConfig(
  action: 'accept' | 'reject' | 'cancel',
  role: 'buyer' | 'seller',
  isBuyerCountered: boolean,
) {
  if (action === 'accept') {
    if (isBuyerCountered) {
      return {
        title: 'Accept counter offer',
        description: "You agree to purchase at the seller's proposed price.",
        confirmText: 'Accept',
        confirmVariant: 'default' as const,
        details: ['You will be redirected to complete payment', 'The item will be reserved for you'],
      };
    }
    return {
      title: role === 'seller' ? 'Accept offer' : 'Accept offer',
      description:
        role === 'seller'
          ? 'All other offers on this listing will be declined.'
          : 'You agree to purchase at this price.',
      confirmText: 'Accept',
      confirmVariant: 'default' as const,
      details:
        role === 'seller'
          ? ['This listing will be marked as pending', 'The buyer will be notified to pay']
          : ['You will be redirected to complete payment'],
    };
  }
  if (action === 'reject') {
    if (isBuyerCountered) {
      return {
        title: 'Decline counter offer',
        description: 'This negotiation will end.',
        confirmText: 'Decline',
        confirmVariant: 'destructive' as const,
        details: ['The seller will be notified', 'You can make a new offer anytime'],
      };
    }
    return {
      title: 'Decline offer',
      description: 'The buyer will be notified.',
      confirmText: 'Decline',
      confirmVariant: 'destructive' as const,
      details: ['This offer will be permanently declined', 'This action cannot be undone'],
    };
  }
  return {
    title: 'Cancel offer',
    description: 'Your offer will be withdrawn.',
    confirmText: 'Cancel offer',
    confirmVariant: 'destructive' as const,
    details: ['The seller will be notified', 'This action cannot be undone'],
  };
}

export function OfferConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  offer,
  action,
  loading = false,
  role = 'seller',
}: OfferConfirmationDialogProps) {
  const savings = calculateSavings(offer.original_price, offer.offer_amount);
  const savingsPercentage =
    offer.offer_percentage || (savings / offer.original_price) * 100;
  const productName =
    offer.product?.display_name || offer.product?.description || 'Product';
  const isBuyerCountered = role === 'buyer' && offer.status === 'countered';
  const config = getConfig(action, role, isBuyerCountered);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-sm font-semibold">{config.title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Offer summary */}
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
            Offer summary
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Product</span>
              <span className="text-xs font-medium text-foreground max-w-[180px] truncate text-right">
                {productName}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Listed price</span>
              <span className="text-xs text-muted-foreground line-through">
                ${offer.original_price.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Offer amount</span>
              <span className="text-xs font-semibold text-foreground">
                ${offer.offer_amount.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Saving</span>
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                ${savings.toLocaleString('en-AU', { minimumFractionDigits: 0 })} · {savingsPercentage.toFixed(0)}% off
              </span>
            </div>
            {offer.message && (
              <div className="flex items-start justify-between gap-4 pt-1.5">
                <span className="text-xs text-muted-foreground flex-shrink-0">Message</span>
                <span className="text-xs text-foreground text-right italic max-w-[180px] line-clamp-2">
                  "{offer.message}"
                </span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* What happens */}
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            What happens next
          </p>
          <ul className="space-y-1">
            {config.details.map((detail, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                {detail}
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        <div className="px-4 py-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
            className="h-8 text-xs"
          >
            Go back
          </Button>
          <Button
            variant={config.confirmVariant}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            className="h-8 text-xs"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              config.confirmText
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

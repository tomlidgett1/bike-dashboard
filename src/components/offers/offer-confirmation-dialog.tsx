// ============================================================
// OFFER CONFIRMATION DIALOG
// ============================================================
// Professional confirmation dialog for offer actions

'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, XCircle, Ban } from 'lucide-react';
import type { EnrichedOffer } from '@/lib/types/offer';
import { calculateSavings } from '@/lib/types/offer';

interface OfferConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  offer: EnrichedOffer;
  action: 'accept' | 'reject' | 'cancel';
  loading?: boolean;
}

export function OfferConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  offer,
  action,
  loading = false,
}: OfferConfirmationDialogProps) {
  const savings = calculateSavings(offer.original_price, offer.offer_amount);
  const savingsPercentage = offer.offer_percentage || ((savings / offer.original_price) * 100);
  const productName = offer.product?.display_name || offer.product?.description || 'Product';

  const getActionConfig = () => {
    switch (action) {
      case 'accept':
        return {
          title: 'Accept Offer',
          icon: <CheckCircle className="h-12 w-12 text-green-600" />,
          description: 'Are you sure you want to accept this offer?',
          confirmText: 'Accept Offer',
          confirmVariant: 'default' as const,
          details: [
            'This product will be marked as pending',
            'All other offers on this product will be rejected',
            'The buyer will be notified of your acceptance',
            'You will need to coordinate delivery with the buyer',
          ],
        };
      case 'reject':
        return {
          title: 'Reject Offer',
          icon: <XCircle className="h-12 w-12 text-red-600" />,
          description: 'Are you sure you want to reject this offer?',
          confirmText: 'Reject Offer',
          confirmVariant: 'destructive' as const,
          details: [
            'This offer will be permanently rejected',
            'The buyer will be notified of your rejection',
            'This action cannot be undone',
          ],
        };
      case 'cancel':
        return {
          title: 'Cancel Offer',
          icon: <Ban className="h-12 w-12 text-gray-600" />,
          description: 'Are you sure you want to cancel this offer?',
          confirmText: 'Cancel Offer',
          confirmVariant: 'destructive' as const,
          details: [
            'This offer will be cancelled',
            'The seller will be notified',
            'This action cannot be undone',
          ],
        };
    }
  };

  const config = getActionConfig();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-md">
        <DialogHeader>
          <div className="flex flex-col items-center text-center mb-4">
            <div className="mb-4">{config.icon}</div>
            <DialogTitle className="text-xl">{config.title}</DialogTitle>
            <DialogDescription className="text-sm mt-2">
              {config.description}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Offer Summary */}
        <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-600 mb-1">Product</p>
            <p className="text-sm font-semibold text-gray-900">{productName}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
            <div>
              <p className="text-xs text-gray-600 mb-1">Original Price</p>
              <p className="text-sm text-gray-900 line-through">
                ${offer.original_price.toLocaleString('en-AU')}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Offer Amount</p>
              <p className="text-sm font-bold text-gray-900">
                ${offer.offer_amount.toLocaleString('en-AU')}
              </p>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-md p-2.5">
            <p className="text-xs text-green-700 font-medium">
              {action === 'accept' ? 'You will receive' : 'Discount'}
            </p>
            <p className="text-lg font-bold text-green-700">
              {action === 'accept' ? (
                `$${offer.offer_amount.toLocaleString('en-AU')}`
              ) : (
                `$${savings.toLocaleString('en-AU')} (${savingsPercentage.toFixed(0)}% off)`
              )}
            </p>
          </div>

          {offer.message && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-600 mb-1">Message</p>
              <p className="text-xs text-gray-900 italic">"{offer.message}"</p>
            </div>
          )}
        </div>

        {/* Action Details */}
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">What happens next:</p>
          <ul className="space-y-1.5">
            {config.details.map((detail, index) => (
              <li key={index} className="text-xs text-gray-600 flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">•</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="rounded-md"
          >
            Cancel
          </Button>
          <Button
            variant={config.confirmVariant}
            onClick={onConfirm}
            disabled={loading}
            className="rounded-md"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Processing...
              </>
            ) : (
              config.confirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


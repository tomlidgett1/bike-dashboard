// ============================================================
// COUNTER OFFER MODAL COMPONENT
// ============================================================
// Modal for sellers to counter an offer with a new price

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Reply, Send } from 'lucide-react';
import type { CounterOfferModalProps } from '@/lib/types/offer';
import { calculateOfferPercentage } from '@/lib/types/offer';

export function CounterOfferModal({
  offer,
  isOpen,
  onClose,
  onSubmit,
}: CounterOfferModalProps) {
  const [counterAmount, setCounterAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const counterAmountNum = counterAmount ? parseFloat(counterAmount) : null;
  const counterPercentage = counterAmountNum
    ? calculateOfferPercentage(offer.original_price, counterAmountNum)
    : null;
  const counterSavings = counterAmountNum ? offer.original_price - counterAmountNum : null;

  const validateCounter = (): string | null => {
    if (!counterAmountNum) {
      return 'Please enter a counter amount';
    }
    if (counterAmountNum <= 0) {
      return 'Counter amount must be greater than $0';
    }
    if (counterAmountNum >= offer.original_price) {
      return 'Counter amount must be less than the original price';
    }
    if (counterAmountNum <= offer.offer_amount) {
      return 'Counter amount should be higher than the current offer';
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateCounter();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError(null);
      setSubmitting(true);
      await onSubmit(counterAmountNum!, message || undefined);
      handleClose();
    } catch (err) {
      console.error('Error submitting counter offer:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit counter offer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setCounterAmount('');
    setMessage('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] rounded-md">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
            <Reply className="h-5 w-5" />
            Counter Offer
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Propose a different price to the buyer
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Current Offer Summary */}
          <div className="bg-white border border-gray-200 rounded-md p-3">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Current Offer</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Original Price:</span>
                <span className="font-medium text-gray-900">
                  ${offer.original_price.toLocaleString('en-AU')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Buyer's Offer:</span>
                <span className="font-bold text-gray-900">
                  ${offer.offer_amount.toLocaleString('en-AU')}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Discount:</span>
                <span>{offer.offer_percentage?.toFixed(1)}% off</span>
              </div>
            </div>
          </div>

          {/* Counter Amount Input */}
          <div>
            <label htmlFor="counterAmount" className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">
              Your Counter Offer
            </label>
            <Input
              id="counterAmount"
              type="number"
              step="0.01"
              min={offer.offer_amount}
              max={offer.original_price}
              value={counterAmount}
              onChange={(e) => {
                setCounterAmount(e.target.value);
                setError(null);
              }}
              placeholder={`$${offer.offer_amount.toFixed(2)} - $${offer.original_price.toFixed(2)}`}
              className="rounded-md text-sm"
              disabled={submitting}
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              Must be between ${offer.offer_amount.toLocaleString('en-AU')} and ${offer.original_price.toLocaleString('en-AU')}
            </p>
          </div>

          {/* Counter Offer Summary */}
          {counterAmountNum && counterSavings !== null && counterPercentage && (
            <div className="bg-white border border-blue-200 rounded-md p-3">
              <h4 className="text-xs font-semibold text-blue-900 mb-2">Your Counter Offer</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Original Price:</span>
                  <span className="font-medium text-gray-900 line-through">
                    ${offer.original_price.toLocaleString('en-AU')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Your Counter:</span>
                  <span className="text-lg font-bold text-blue-900">
                    ${counterAmountNum.toLocaleString('en-AU')}
                  </span>
                </div>
                <div className="flex justify-between text-xs pt-1.5 border-t border-blue-100">
                  <span className="text-blue-700">Buyer Saves:</span>
                  <span className="font-semibold text-blue-700">
                    ${counterSavings.toLocaleString('en-AU')} ({counterPercentage.toFixed(1)}% off)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Optional Message */}
          <div>
            <label htmlFor="message" className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">
              Message (Optional)
            </label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Explain why you're countering with this price..."
              rows={3}
              className="rounded-md text-sm"
              disabled={submitting}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-2.5 sm:p-3 bg-white border border-red-200 rounded-md text-xs sm:text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
              className="rounded-md text-xs sm:text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !counterAmountNum}
              className="rounded-md text-xs sm:text-sm"
            >
              {submitting ? (
                <>
                  <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="hidden xs:inline">Sending...</span>
                  <span className="xs:hidden">...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  <span>Send Counter</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


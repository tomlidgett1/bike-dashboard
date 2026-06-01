'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Send } from 'lucide-react';
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
  const counterPercentage =
    counterAmountNum
      ? calculateOfferPercentage(offer.original_price, counterAmountNum)
      : null;
  const counterSavings =
    counterAmountNum ? offer.original_price - counterAmountNum : null;

  const validate = (): string | null => {
    if (!counterAmountNum) return 'Enter a counter amount';
    if (counterAmountNum <= 0) return 'Amount must be greater than $0';
    if (counterAmountNum >= offer.original_price)
      return 'Must be less than the listed price';
    if (counterAmountNum <= offer.offer_amount)
      return "Must be higher than the buyer's offer";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    try {
      setError(null);
      setSubmitting(true);
      await onSubmit(counterAmountNum!, message || undefined);
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
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
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-sm font-semibold">Counter offer</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Propose a different price to the buyer
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Current offer summary */}
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
            Current offer
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Listed price</span>
              <span className="text-xs text-muted-foreground line-through">
                ${offer.original_price.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Buyer's offer</span>
              <span className="text-xs font-semibold text-foreground">
                ${offer.offer_amount.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                {offer.offer_percentage && (
                  <span className="font-normal text-muted-foreground ml-1.5">
                    {offer.offer_percentage.toFixed(0)}% off
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Counter amount input */}
        <div className="px-4 py-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="counterAmount" className="text-xs font-medium text-foreground">
              Your counter
            </Label>
            <Input
              id="counterAmount"
              type="number"
              step="1"
              min={offer.offer_amount}
              max={offer.original_price}
              value={counterAmount}
              onChange={(e) => { setCounterAmount(e.target.value); setError(null); }}
              placeholder={`${offer.offer_amount.toFixed(0)}–${offer.original_price.toFixed(0)}`}
              className="h-9 text-sm"
              disabled={submitting}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Between ${offer.offer_amount.toLocaleString('en-AU', { minimumFractionDigits: 0 })} and ${offer.original_price.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
            </p>
          </div>

          {/* Live preview */}
          {counterAmountNum && counterSavings !== null && counterPercentage !== null && (
            <div className="space-y-1.5 pt-1">
              <Separator />
              <div className="pt-1.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">You counter with</span>
                  <span className="text-xs font-semibold text-foreground">
                    ${counterAmountNum.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Buyer saves</span>
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    ${counterSavings.toLocaleString('en-AU', { minimumFractionDigits: 0 })} · {counterPercentage.toFixed(0)}% off
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Optional message */}
          <div className="space-y-1.5">
            <Label htmlFor="message" className="text-xs font-medium text-foreground">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Explain your counter..."
              rows={2}
              className="text-sm resize-none"
              disabled={submitting}
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <Separator />

        <div className="px-4 py-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={submitting}
            className="h-8 text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !counterAmountNum}
            className="h-8 text-xs"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send counter
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

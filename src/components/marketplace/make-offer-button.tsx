'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useAuthModal } from '@/components/providers/auth-modal-provider';
import { useCreateOffer } from '@/lib/hooks/use-offers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import { Tag, Send, Check, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OFFER_PRESETS, calculateOfferPercentage } from '@/lib/types/offer';
import type { MakeOfferButtonProps } from '@/lib/types/offer';
import Image from 'next/image';

// ============================================================
// MOBILE BOTTOM SHEET COMPONENT
// ============================================================

interface MobileOfferSheetProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  productPrice: number;
  productImage?: string | null;
  selectedPreset: number | null;
  customAmount: string;
  message: string;
  error: string | null;
  success: boolean;
  creating: boolean;
  offerAmount: number | null;
  offerPercentage: number | null;
  savings: number | null;
  onPresetClick: (index: number) => void;
  onCustomAmountChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
}

function MobileOfferSheet({
  isOpen,
  onClose,
  productName,
  productPrice,
  productImage,
  selectedPreset,
  customAmount,
  message,
  error,
  success,
  creating,
  offerAmount,
  offerPercentage,
  savings,
  onPresetClick,
  onCustomAmountChange,
  onMessageChange,
  onSubmit,
}: MobileOfferSheetProps) {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setShowMessage(false);
  }, [isOpen]);

  return (
    <Sheet open={isOpen} onOpenChange={!creating && !success ? onClose : undefined}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 max-h-[90vh] overflow-hidden flex flex-col gap-0"
        showCloseButton={false}
      >
        {!success ? (
          <>
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-8 h-1 bg-muted-foreground/20 rounded-full" />
            </div>

            <div className="px-4 pb-3 pt-1 flex-shrink-0">
              <p className="text-sm font-semibold text-foreground">Make an offer</p>
              <p className="text-xs text-muted-foreground mt-0.5">Negotiate a price with the seller</p>
            </div>

            <Separator className="flex-shrink-0" />

            <div className="flex-1 overflow-y-auto">
              {/* Product row */}
              <div className="px-4 py-3 flex items-center gap-3">
                {productImage && (
                  <div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                    <Image src={productImage} alt={productName} fill className="object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{productName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">${productPrice.toLocaleString('en-AU')} listed</p>
                </div>
              </div>

              <Separator />

              {/* Preset offers */}
              <div className="px-4 py-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">Quick offers</p>
                <div className="grid grid-cols-2 gap-2">
                  {OFFER_PRESETS.map((preset, index) => {
                    const amount = preset.calculateAmount(productPrice);
                    const isSelected = selectedPreset === index;
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => onPresetClick(index)}
                        disabled={creating}
                        className={cn(
                          "relative py-3 px-3 rounded-md border transition-all text-left active:scale-[0.97]",
                          isSelected
                            ? "border-foreground bg-foreground"
                            : "border-border bg-background hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "text-lg font-semibold",
                          isSelected ? "text-background" : "text-foreground"
                        )}>
                          ${amount.toLocaleString('en-AU')}
                        </div>
                        <div className={cn(
                          "text-xs mt-0.5",
                          isSelected ? "text-background/70" : "text-muted-foreground"
                        )}>
                          {preset.percentage}% off
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 h-4 w-4 bg-background rounded-full flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-foreground" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Custom amount */}
              <div className="px-4 py-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Custom amount</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max={productPrice}
                    value={customAmount}
                    onChange={(e) => onCustomAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="h-9 pl-7 text-sm"
                    disabled={creating}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Minimum ${(productPrice * 0.5).toLocaleString('en-AU')} (50% of listing)
                </p>
              </div>

              {/* Savings row — only shown when there are savings */}
              {offerAmount && savings !== null && savings > 0 && (
                <>
                  <Separator />
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Your savings</span>
                    <span className="text-xs font-medium text-green-600">
                      ${savings.toLocaleString('en-AU')} ({offerPercentage?.toFixed(0)}% off)
                    </span>
                  </div>
                </>
              )}

              <Separator />

              {/* Optional message */}
              <div className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setShowMessage(!showMessage)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span>Add a message (optional)</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", showMessage && "rotate-180")} />
                </button>
                {showMessage && (
                  <Textarea
                    value={message}
                    onChange={(e) => onMessageChange(e.target.value)}
                    placeholder="Write a message to the seller..."
                    rows={3}
                    className="mt-2 text-sm"
                    disabled={creating}
                  />
                )}
              </div>

              {error && (
                <>
                  <Separator />
                  <div className="px-4 py-3">
                    <p className="text-xs text-destructive">{error}</p>
                  </div>
                </>
              )}

              <Separator />

              {/* Submit */}
              <div className="px-4 py-3 pb-8">
                <Button
                  type="button"
                  onClick={onSubmit}
                  disabled={creating || !offerAmount}
                  className="w-full h-10"
                  size="sm"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="ml-1.5 text-xs">Sending offer...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span className="ml-1.5 text-xs">
                        {offerAmount
                          ? `Send offer · $${offerAmount.toLocaleString('en-AU')}`
                          : 'Select an amount'}
                      </span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="h-safe-area-inset-bottom" />
          </>
        ) : (
          /* Success State */
          <div className="py-10 px-6 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Offer sent</p>
              <p className="text-xs text-muted-foreground mt-1">
                ${offerAmount?.toLocaleString('en-AU')} offer sent to the seller
              </p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// DESKTOP DIALOG COMPONENT
// ============================================================

interface DesktopOfferDialogProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  productPrice: number;
  productImage?: string | null;
  selectedPreset: number | null;
  customAmount: string;
  message: string;
  error: string | null;
  success: boolean;
  creating: boolean;
  offerAmount: number | null;
  offerPercentage: number | null;
  savings: number | null;
  onPresetClick: (index: number) => void;
  onCustomAmountChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
}

function DesktopOfferDialog({
  isOpen,
  onClose,
  productName,
  productPrice,
  productImage,
  selectedPreset,
  customAmount,
  message,
  error,
  success,
  creating,
  offerAmount,
  offerPercentage,
  savings,
  onPresetClick,
  onCustomAmountChange,
  onMessageChange,
  onSubmit,
}: DesktopOfferDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        {!success ? (
          <>
            <DialogHeader className="px-4 pt-4 pb-3">
              <DialogTitle className="text-sm font-semibold">Make an offer</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Negotiate a price with the seller
              </DialogDescription>
            </DialogHeader>

            <Separator />

            {/* Product row */}
            <div className="px-4 py-3 flex items-center gap-3">
              {productImage && (
                <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                  <Image src={productImage} alt={productName} fill className="object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground line-clamp-1">{productName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">${productPrice.toLocaleString('en-AU')} listed</p>
              </div>
            </div>

            <Separator />

            {/* Preset offers */}
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">Quick offers</p>
              <div className="grid grid-cols-2 gap-2">
                {OFFER_PRESETS.map((preset, index) => {
                  const amount = preset.calculateAmount(productPrice);
                  const isSelected = selectedPreset === index;
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => onPresetClick(index)}
                      disabled={creating}
                      className={cn(
                        "relative py-2.5 px-3 rounded-md border transition-all text-left",
                        isSelected
                          ? "border-foreground bg-foreground"
                          : "border-border bg-background hover:bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "text-sm font-semibold",
                        isSelected ? "text-background" : "text-foreground"
                      )}>
                        ${amount.toLocaleString('en-AU')}
                      </div>
                      <div className={cn(
                        "text-xs mt-0.5",
                        isSelected ? "text-background/70" : "text-muted-foreground"
                      )}>
                        {preset.percentage}% off
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 h-4 w-4 bg-background rounded-full flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Custom amount */}
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Custom amount</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="customAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  max={productPrice}
                  value={customAmount}
                  onChange={(e) => onCustomAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="h-8 pl-7 text-xs"
                  disabled={creating}
                />
              </div>
            </div>

            {/* Savings row */}
            {offerAmount && savings !== null && savings > 0 && (
              <>
                <Separator />
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Your savings</span>
                  <span className="text-xs font-medium text-green-600">
                    ${savings.toLocaleString('en-AU')} ({offerPercentage?.toFixed(0)}% off)
                  </span>
                </div>
              </>
            )}

            <Separator />

            {/* Message */}
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Message (optional)</p>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Add a message to your offer..."
                rows={2}
                className="text-xs"
                disabled={creating}
              />
            </div>

            {error && (
              <>
                <Separator />
                <div className="px-4 py-2">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              </>
            )}

            <Separator />

            <div className="px-4 py-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={creating}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={onSubmit}
                disabled={creating || !offerAmount}
                className="h-8 text-xs gap-1.5"
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send offer
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          /* Success State */
          <div className="px-4 py-8 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Offer sent</p>
              <p className="text-xs text-muted-foreground mt-1">
                ${offerAmount?.toLocaleString('en-AU')} offer sent to the seller
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function MakeOfferButton({
  productId,
  productName,
  productPrice,
  sellerId,
  productImage,
  variant = 'outline',
  size = 'default',
  fullWidth = false,
  className,
}: MakeOfferButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { createOffer, creating } = useCreateOffer();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const getOfferAmount = (): number | null => {
    if (selectedPreset !== null) {
      const preset = OFFER_PRESETS[selectedPreset];
      return preset.calculateAmount(productPrice);
    }
    if (customAmount) {
      const amount = parseFloat(customAmount);
      return isNaN(amount) ? null : amount;
    }
    return null;
  };

  const offerAmount = getOfferAmount();
  const offerPercentage = offerAmount ? calculateOfferPercentage(productPrice, offerAmount) : null;
  const savings = offerAmount ? productPrice - offerAmount : null;

  const handleClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (user.id === sellerId) {
      alert('You cannot make an offer on your own product');
      return;
    }
    setIsDialogOpen(true);
    setMessage(`Hi, I'd like to make an offer on ${productName}.`);
  };

  const handlePresetClick = (index: number) => {
    setSelectedPreset(index);
    setCustomAmount('');
    setError(null);
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    setSelectedPreset(null);
    setError(null);
  };

  const validateOffer = (): string | null => {
    if (!offerAmount) return 'Please select a preset or enter a custom amount';
    if (offerAmount <= 0) return 'Offer amount must be greater than $0';
    if (offerAmount >= productPrice) return 'Offer amount must be less than the listing price';
    if (offerAmount < productPrice * 0.5) return 'Offer amount is too low (minimum 50% of listing price)';
    return null;
  };

  const handleSubmitOffer = async () => {
    const validationError = validateOffer();
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setError(null);
      await createOffer({
        productId,
        offerAmount: offerAmount!,
        offerPercentage: offerPercentage || undefined,
        message: message || undefined,
      });
      setSuccess(true);
      setTimeout(() => {
        setIsDialogOpen(false);
        router.push('/messages?tab=offers');
      }, 1500);
    } catch (err) {
      console.error('Error submitting offer:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit offer');
    }
  };

  const handleCloseDialog = () => {
    if (creating || success) return;
    setIsDialogOpen(false);
    setSelectedPreset(null);
    setCustomAmount('');
    setMessage(`Hi, I'd like to make an offer on ${productName}.`);
    setError(null);
    setSuccess(false);
  };

  const sharedProps = {
    isOpen: isDialogOpen,
    onClose: handleCloseDialog,
    productId,
    productName,
    productPrice,
    productImage,
    selectedPreset,
    customAmount,
    message,
    error,
    success,
    creating,
    offerAmount,
    offerPercentage,
    savings,
    onPresetClick: handlePresetClick,
    onCustomAmountChange: handleCustomAmountChange,
    onMessageChange: setMessage,
    onSubmit: handleSubmitOffer,
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={className}
        style={fullWidth ? { width: '100%' } : undefined}
      >
        <Tag className="h-4 w-4 mr-2" />
        Make an Offer
      </Button>

      {isMobile ? (
        <MobileOfferSheet {...sharedProps} />
      ) : (
        <DesktopOfferDialog {...sharedProps} />
      )}
    </>
  );
}

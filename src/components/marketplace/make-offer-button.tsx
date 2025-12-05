// ============================================================
// MAKE OFFER BUTTON COMPONENT
// ============================================================
// Button and modal for making offers on products

'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useAuthModal } from '@/components/providers/auth-modal-provider';
import { useCreateOffer } from '@/lib/hooks/use-offers';
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
import { Tag, Send, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OFFER_PRESETS, calculateOfferPercentage } from '@/lib/types/offer';
import type { MakeOfferButtonProps } from '@/lib/types/offer';
import Image from 'next/image';

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

  // Debug logging - check what we're receiving
  React.useEffect(() => {
    console.log('[MAKE OFFER] Component mounted with props:', {
      productId,
      productIdType: typeof productId,
      productIdLength: productId?.length,
      productIdValid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId || ''),
      sellerId,
      sellerIdType: typeof sellerId,
      sellerIdLength: sellerId?.length,
      sellerIdValid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sellerId || ''),
      productName: productName?.substring(0, 50),
      productPrice,
      currentUserId: user?.id,
      currentUserIdValid: user?.id ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) : false,
      isMobile: window.innerWidth < 768,
    });
  }, [productId, sellerId, productName, productPrice, user]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Calculate offer amount based on selection
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
  const offerPercentage = offerAmount 
    ? calculateOfferPercentage(productPrice, offerAmount) 
    : null;
  const savings = offerAmount ? productPrice - offerAmount : null;

  const handleClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }

    // Check if user has completed profile setup
    if (!user.user_metadata?.name && !user.user_metadata?.business_name) {
      alert('Please complete your profile before making offers. Go to Settings to add your name.');
      router.push('/onboarding');
      return;
    }

    // Validate sellerId
    if (!sellerId || typeof sellerId !== 'string' || sellerId.trim() === '') {
      alert('Unable to make offer: Seller information is missing. Please try refreshing the page.');
      console.error('[MAKE OFFER] Invalid sellerId:', sellerId);
      return;
    }

    // Validate productId
    if (!productId || typeof productId !== 'string' || productId.trim() === '') {
      alert('Unable to make offer: Product information is missing. Please try refreshing the page.');
      console.error('[MAKE OFFER] Invalid productId:', productId);
      return;
    }

    // Check if user is trying to offer on their own product
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
    if (!offerAmount) {
      return 'Please select a preset or enter a custom amount';
    }
    if (offerAmount <= 0) {
      return 'Offer amount must be greater than $0';
    }
    if (offerAmount >= productPrice) {
      return 'Offer amount must be less than the listing price';
    }
    if (offerAmount < productPrice * 0.5) {
      return 'Offer amount is too low (minimum 50% of listing price)';
    }
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
      
      // Close modal and redirect to offers page after 1.5 seconds
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
    if (creating || success) return; // Prevent closing during submission
    setIsDialogOpen(false);
    setSelectedPreset(null);
    setCustomAmount('');
    setMessage(`Hi, I'd like to make an offer on ${productName}.`);
    setError(null);
    setSuccess(false);
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

      {/* Offer Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] rounded-md">
          {!success ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-base sm:text-lg">Make an Offer</DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Negotiate a price with the seller for {productName}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Product Summary */}
                <div className="bg-white border border-gray-200 rounded-md p-3">
                  <div className="flex gap-3">
                    {productImage && (
                      <div className="relative h-16 w-16 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                        <Image
                          src={productImage}
                          alt={productName}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {productName}
                      </p>
                      <p className="text-lg font-bold text-gray-900 mt-1">
                        ${productPrice.toLocaleString('en-AU')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preset Offers */}
                <div>
                  <label className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">
                    Quick Offers
                  </label>
                  <div className="flex gap-2">
                    {OFFER_PRESETS.map((preset, index) => {
                      const amount = preset.calculateAmount(productPrice);
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handlePresetClick(index)}
                          disabled={creating}
                          className={cn(
                            "flex-1 px-3 py-2.5 rounded-md border-2 transition-all text-xs sm:text-sm font-medium",
                            selectedPreset === index
                              ? "border-gray-900 bg-gray-900 text-white"
                              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                          )}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <Percent className="h-3.5 w-3.5" />
                            <span>{preset.percentage}% off</span>
                          </div>
                          <div className="text-xs mt-1 font-bold">
                            ${amount.toLocaleString('en-AU')}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Amount */}
                <div>
                  <label htmlFor="customAmount" className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">
                    Or Enter Custom Amount
                  </label>
                  <Input
                    id="customAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    max={productPrice}
                    value={customAmount}
                    onChange={(e) => handleCustomAmountChange(e.target.value)}
                    placeholder={`$0.00 - $${productPrice.toLocaleString('en-AU')}`}
                    className="rounded-md text-sm"
                    disabled={creating}
                  />
                </div>

                {/* Offer Summary */}
                {offerAmount && savings !== null && (
                  <div className="bg-white border border-gray-200 rounded-md p-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Original Price:</span>
                        <span className="font-medium text-gray-900">
                          ${productPrice.toLocaleString('en-AU')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Your Offer:</span>
                        <span className="font-bold text-gray-900">
                          ${offerAmount.toLocaleString('en-AU')}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-100">
                        <span className="text-green-700 font-medium">You Save:</span>
                        <span className="font-bold text-green-700">
                          ${savings.toLocaleString('en-AU')} ({offerPercentage?.toFixed(1)}% off)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Optional Message */}
                <div>
                  <label htmlFor="message" className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">
                    Message to Seller (Optional)
                  </label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Add a message to your offer..."
                    rows={3}
                    className="rounded-md text-sm"
                    disabled={creating}
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
                    onClick={handleCloseDialog}
                    disabled={creating}
                    className="rounded-md text-xs sm:text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitOffer}
                    disabled={creating || !offerAmount}
                    className="rounded-md text-xs sm:text-sm"
                  >
                    {creating ? (
                      <>
                        <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span className="hidden xs:inline">Submitting...</span>
                        <span className="xs:hidden">...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                        <span>Submit Offer</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* Success State */
            <div className="py-8 text-center">
              <div className="mb-4">
                <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Offer Submitted!
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Your offer of ${offerAmount?.toLocaleString('en-AU')} has been sent to the seller.
              </p>
              <p className="text-xs text-gray-500">
                Redirecting to your offers...
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


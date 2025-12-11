// ============================================================
// MAKE OFFER BUTTON COMPONENT
// ============================================================
// Button and modal for making offers on products
// Mobile: Native bottom sheet with spring animations
// Desktop: Centered dialog modal

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Tag, Send, Check, ChevronDown } from 'lucide-react';
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

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Reset message visibility when closing
  useEffect(() => {
    if (!isOpen) {
      setShowMessage(false);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[100]"
            onClick={!creating && !success ? onClose : undefined}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 400,
            }}
            className="fixed bottom-0 left-0 right-0 z-[101] bg-white rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            {!success ? (
              <>
                {/* Handle Bar */}
                <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                  <div className="w-10 h-1 bg-gray-300 rounded-full" />
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-5 pb-safe">
                  {/* Header */}
                  <div className="pb-4">
                    <h2 className="text-xl font-bold text-gray-900">
                      Make an Offer
                    </h2>
                  </div>

                  {/* Product Card */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-5">
                    <div className="flex gap-4">
                      {productImage && (
                        <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0">
                          <Image
                            src={productImage}
                            alt={productName}
                            fill
                            className="object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
                          {productName}
                        </p>
                        <div className="mt-2">
                          <span className="text-xs text-gray-500">Listed at</span>
                          <p className="text-xl font-bold text-gray-900">
                            ${productPrice.toLocaleString('en-AU')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Offer Section */}
                  <div className="mb-5">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                      Choose your offer
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {OFFER_PRESETS.map((preset, index) => {
                        const amount = preset.calculateAmount(productPrice);
                        const isSelected = selectedPreset === index;
                        return (
                          <motion.button
                            key={index}
                            type="button"
                            onClick={() => onPresetClick(index)}
                            disabled={creating}
                            whileTap={{ scale: 0.97 }}
                            className={cn(
                              "relative py-4 px-4 rounded-xl border-2 transition-all text-left",
                              isSelected
                                ? "border-gray-900 bg-gray-900"
                                : "border-gray-200 bg-white active:bg-gray-50"
                            )}
                          >
                            <div className={cn(
                              "text-2xl font-bold",
                              isSelected ? "text-white" : "text-gray-900"
                            )}>
                              ${amount.toLocaleString('en-AU')}
                            </div>
                            <div className={cn(
                              "text-sm mt-0.5",
                              isSelected ? "text-gray-300" : "text-gray-500"
                            )}>
                              {preset.percentage}% off
                            </div>
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute top-3 right-3 h-5 w-5 bg-white rounded-full flex items-center justify-center"
                              >
                                <Check className="h-3 w-3 text-gray-900" />
                              </motion.div>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Amount */}
                  <div className="mb-5">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Or enter a custom amount
                    </p>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-medium">
                        $
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        max={productPrice}
                        value={customAmount}
                        onChange={(e) => onCustomAmountChange(e.target.value)}
                        placeholder="0.00"
                        className="h-14 pl-8 text-lg font-medium rounded-xl border-gray-200 focus:border-gray-900 focus:ring-gray-900"
                        disabled={creating}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      Minimum offer: ${(productPrice * 0.5).toLocaleString('en-AU')} (50% of listing)
                    </p>
                  </div>

                  {/* Offer Summary */}
                  <AnimatePresence>
                    {offerAmount && savings !== null && savings > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                        className="overflow-hidden mb-5"
                      >
                        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-green-800 font-medium">Your savings</p>
                              <p className="text-2xl font-bold text-green-700">
                                ${savings.toLocaleString('en-AU')}
                              </p>
                            </div>
                            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                              <span className="text-lg font-bold text-green-700">
                                {offerPercentage?.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Optional Message Toggle */}
                  <div className="mb-5">
                    <button
                      type="button"
                      onClick={() => setShowMessage(!showMessage)}
                      className="flex items-center gap-2 text-sm text-gray-600 font-medium"
                    >
                      <span>Add a message (optional)</span>
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        showMessage && "rotate-180"
                      )} />
                    </button>
                    <AnimatePresence>
                      {showMessage && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                          className="overflow-hidden"
                        >
                          <Textarea
                            value={message}
                            onChange={(e) => onMessageChange(e.target.value)}
                            placeholder="Write a message to the seller..."
                            rows={3}
                            className="mt-3 rounded-xl border-gray-200 text-sm"
                            disabled={creating}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Error Message */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mb-5"
                      >
                        <div className="p-4 bg-white border border-red-200 rounded-xl text-sm text-red-600">
                          {error}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit Button */}
                  <div className="pb-8">
                    <motion.button
                      type="button"
                      onClick={onSubmit}
                      disabled={creating || !offerAmount}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "w-full h-14 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2",
                        offerAmount
                          ? "bg-gray-900 text-white active:bg-gray-800"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      )}
                    >
                      {creating ? (
                        <>
                          <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Sending offer...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5" />
                          <span>
                            {offerAmount 
                              ? `Send Offer · $${offerAmount.toLocaleString('en-AU')}`
                              : 'Select an amount'
                            }
                          </span>
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Safe area padding for iOS */}
                <div className="h-safe-area-inset-bottom" />
              </>
            ) : (
              /* Success State */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="py-12 px-6 text-center"
              >
                {/* Animated Checkmark */}
                <div className="mb-6 flex justify-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: "spring",
                      damping: 15,
                      stiffness: 300,
                      delay: 0.1
                    }}
                    className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center"
                  >
                    <motion.div
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        type: "spring",
                        damping: 12,
                        stiffness: 200,
                        delay: 0.3
                      }}
                    >
                      <Check className="h-10 w-10 text-green-600" strokeWidth={3} />
                    </motion.div>
                  </motion.div>
                </div>

                <motion.h3
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-xl font-bold text-gray-900 mb-2"
                >
                  Offer Sent!
                </motion.h3>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-gray-600 mb-2"
                >
                  Your offer of <span className="font-semibold">${offerAmount?.toLocaleString('en-AU')}</span> has been sent.
                </motion.p>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-sm text-gray-400"
                >
                  The seller will respond soon...
                </motion.p>

                {/* Progress indicator */}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1.5, delay: 0.2 }}
                  className="h-1 bg-green-500 rounded-full mt-8 mx-auto max-w-[200px]"
                />
              </motion.div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
      <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] rounded-md">
        {!success ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">Make an Offer</DialogTitle>
              <DialogDescription className="text-sm">
                Negotiate a price with the seller
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              {/* Product Summary */}
              <div className="bg-gray-50 rounded-md p-4">
                <div className="flex gap-4">
                  {productImage && (
                    <div className="relative h-20 w-20 rounded-md overflow-hidden bg-gray-200 flex-shrink-0">
                      <Image
                        src={productImage}
                        alt={productName}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">
                      {productName}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      ${productPrice.toLocaleString('en-AU')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Preset Offers */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Quick Offers
                </label>
                <div className="grid grid-cols-2 gap-3">
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
                          "relative py-3 px-4 rounded-md border-2 transition-all text-left",
                          isSelected
                            ? "border-gray-900 bg-gray-900"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        )}
                      >
                        <div className={cn(
                          "text-xl font-bold",
                          isSelected ? "text-white" : "text-gray-900"
                        )}>
                          ${amount.toLocaleString('en-AU')}
                        </div>
                        <div className={cn(
                          "text-sm",
                          isSelected ? "text-gray-300" : "text-gray-500"
                        )}>
                          {preset.percentage}% off
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 h-5 w-5 bg-white rounded-full flex items-center justify-center">
                            <Check className="h-3 w-3 text-gray-900" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Amount */}
              <div>
                <label htmlFor="customAmount" className="text-sm font-medium text-gray-700 mb-1 block">
                  Or Enter Custom Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <Input
                    id="customAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    max={productPrice}
                    value={customAmount}
                    onChange={(e) => onCustomAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="pl-7 rounded-md text-sm"
                    disabled={creating}
                  />
                </div>
              </div>

              {/* Offer Summary */}
              {offerAmount && savings !== null && savings > 0 && (
                <div className="bg-green-50 border border-green-100 rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-800 font-medium">Your savings</p>
                      <p className="text-xl font-bold text-green-700">
                        ${savings.toLocaleString('en-AU')}
                      </p>
                    </div>
                    <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-green-700">
                        {offerPercentage?.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Optional Message */}
              <div>
                <label htmlFor="message" className="text-sm font-medium text-gray-700 mb-1 block">
                  Message to Seller (Optional)
                </label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => onMessageChange(e.target.value)}
                  placeholder="Add a message to your offer..."
                  rows={2}
                  className="rounded-md text-sm"
                  disabled={creating}
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-white border border-red-200 rounded-md text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={creating}
                  className="rounded-md"
                >
                  Cancel
                </Button>
                <Button
                  onClick={onSubmit}
                  disabled={creating || !offerAmount}
                  className="rounded-md"
                >
                  {creating ? (
                    <>
                      <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Offer
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Success State */
          <div className="py-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 15, stiffness: 300 }}
              className="mb-4"
            >
              <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", damping: 12 }}
                >
                  <Check className="h-8 w-8 text-green-600" strokeWidth={3} />
                </motion.div>
              </div>
            </motion.div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Offer Sent!
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

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  // Shared props for both mobile and desktop
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

      {/* Render mobile or desktop based on screen size */}
      {isMobile ? (
        <MobileOfferSheet {...sharedProps} />
      ) : (
        <DesktopOfferDialog {...sharedProps} />
      )}
    </>
  );
}

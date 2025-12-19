"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, MapPin, Truck, Loader2, Check, Shield } from "lucide-react";
import { PaymentElement, AddressElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { StripeElementsProvider } from "@/components/providers/stripe-elements-provider";
import { cn } from "@/lib/utils";
import type { DeliveryMethod } from "@/app/api/stripe/create-payment-intent/route";

// ============================================================
// Types
// ============================================================

interface DeliveryOption {
  id: DeliveryMethod;
  label: string;
  description: string;
  cost: number;
  available: boolean;
}

interface PriceBreakdown {
  itemPrice: number;
  deliveryCost: number;
  buyerFee: number;
  totalAmount: number;
}

interface CheckoutSheetProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  productPrice: number;
  productImage?: string | null;
  sellerId: string;
  onSuccess?: () => void;
}

// ============================================================
// Main Checkout Sheet Component
// ============================================================

export function CheckoutSheet({
  isOpen,
  onClose,
  productId,
  productName,
  productPrice,
  productImage,
  sellerId,
  onSuccess,
}: CheckoutSheetProps) {
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = React.useState<string | null>(null);
  const [deliveryOptions, setDeliveryOptions] = React.useState<DeliveryOption[]>([]);
  const [selectedDelivery, setSelectedDelivery] = React.useState<DeliveryMethod>("uber_express");
  const [breakdown, setBreakdown] = React.useState<PriceBreakdown | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Create PaymentIntent when sheet opens
  React.useEffect(() => {
    if (isOpen && !clientSecret) {
      createPaymentIntent();
    }
  }, [isOpen]);

  // Reset state when sheet closes
  React.useEffect(() => {
    if (!isOpen) {
      setClientSecret(null);
      setPaymentIntentId(null);
      setError(null);
    }
  }, [isOpen]);

  // Prevent body scroll when sheet is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const createPaymentIntent = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          deliveryMethod: selectedDelivery,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to initialise checkout");
      }

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setDeliveryOptions(data.deliveryOptions);
      setBreakdown(data.breakdown);
    } catch (err) {
      console.error("[CheckoutSheet] Error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeliveryChange = async (method: DeliveryMethod) => {
    if (method === selectedDelivery || !paymentIntentId) return;

    setSelectedDelivery(method);
    setIsLoading(true);

    try {
      const response = await fetch("/api/stripe/create-payment-intent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIntentId,
          productId,
          deliveryMethod: method,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update delivery");
      }

      setBreakdown(data.breakdown);
    } catch (err) {
      console.error("[CheckoutSheet] Delivery update error:", err);
      setError(err instanceof Error ? err.message : "Failed to update delivery");
    } finally {
      setIsLoading(false);
    }
  };

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
            className="fixed inset-0 bg-black/60 z-[100]"
            onClick={onClose}
          />

          {/* Sheet - Bottom on mobile, centered modal on desktop */}
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className={cn(
              "fixed z-[101] bg-white shadow-2xl flex flex-col overflow-hidden",
              // Mobile: bottom sheet
              "bottom-0 left-0 right-0 rounded-t-2xl max-h-[92vh]",
              // Desktop: centered modal
              "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
              "sm:rounded-xl sm:w-full sm:max-w-md sm:max-h-[85vh]"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle (mobile only) */}
            <div className="flex justify-center pt-3 pb-2 sm:hidden flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 pb-3 sm:pt-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Checkout</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
              {error ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md text-center">
                  <p className="text-sm text-red-600">{error}</p>
                  <Button
                    onClick={createPaymentIntent}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                  >
                    Try Again
                  </Button>
                </div>
              ) : !clientSecret ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <StripeElementsProvider clientSecret={clientSecret}>
                  <CheckoutForm
                    productName={productName}
                    productPrice={productPrice}
                    productImage={productImage}
                    deliveryOptions={deliveryOptions}
                    selectedDelivery={selectedDelivery}
                    onDeliveryChange={handleDeliveryChange}
                    breakdown={breakdown}
                    isUpdating={isLoading}
                    onSuccess={onSuccess}
                    onClose={onClose}
                  />
                </StripeElementsProvider>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// Checkout Form (inside Elements context)
// ============================================================

interface CheckoutFormProps {
  productName: string;
  productPrice: number;
  productImage?: string | null;
  deliveryOptions: DeliveryOption[];
  selectedDelivery: DeliveryMethod;
  onDeliveryChange: (method: DeliveryMethod) => void;
  breakdown: PriceBreakdown | null;
  isUpdating: boolean;
  onSuccess?: () => void;
  onClose: () => void;
}

function CheckoutForm({
  productName,
  productPrice,
  productImage,
  deliveryOptions,
  selectedDelivery,
  onDeliveryChange,
  breakdown,
  isUpdating,
  onSuccess,
  onClose,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [isComplete, setIsComplete] = React.useState(false);
  const [addressComplete, setAddressComplete] = React.useState(false);

  // Check if address is required (delivery methods other than pickup)
  const requiresAddress = selectedDelivery !== "pickup";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);
    setPaymentError(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/marketplace/checkout/success`,
        },
        redirect: "if_required",
      });

      if (error) {
        setPaymentError(error.message || "Payment failed");
        setIsProcessing(false);
      } else if (paymentIntent?.status === "succeeded") {
        setIsComplete(true);
        onSuccess?.();
        // Small delay before closing to show success state
        setTimeout(() => {
          window.location.href = `/marketplace/checkout/success?payment_intent=${paymentIntent.id}`;
        }, 1500);
      }
    } catch (err) {
      console.error("[CheckoutForm] Error:", err);
      setPaymentError("An unexpected error occurred");
      setIsProcessing(false);
    }
  };

  if (isComplete) {
    return (
      <div className="py-12 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4"
        >
          <Check className="h-8 w-8 text-green-600" />
        </motion.div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Successful!</h3>
        <p className="text-sm text-gray-500">Redirecting...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Product Summary */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
        {productImage && (
          <div className="relative h-14 w-14 rounded-md overflow-hidden bg-gray-200 flex-shrink-0">
            <Image
              src={productImage}
              alt={productName}
              fill
              className="object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{productName}</p>
          <p className="text-lg font-bold text-gray-900">
            ${productPrice.toLocaleString("en-AU")}
          </p>
        </div>
      </div>

      {/* Delivery Options */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Delivery</h3>
        <div className="space-y-2">
          {deliveryOptions
            .filter((opt) => opt.available)
            .map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onDeliveryChange(option.id)}
                disabled={isUpdating}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-md border-2 transition-all text-left",
                  selectedDelivery === option.id
                    ? option.id === "uber_express"
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-900 bg-gray-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md flex-shrink-0",
                    selectedDelivery === option.id && option.id === "uber_express"
                      ? "bg-white/20"
                      : "bg-gray-100"
                  )}
                >
                  {option.id === "uber_express" && (
                    <Zap
                      className={cn(
                        "h-4 w-4",
                        selectedDelivery === option.id ? "text-green-400" : "text-gray-600"
                      )}
                    />
                  )}
                  {option.id === "pickup" && <MapPin className="h-4 w-4 text-gray-600" />}
                  {option.id === "shipping" && <Truck className="h-4 w-4 text-gray-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        selectedDelivery === option.id && option.id === "uber_express"
                          ? "text-white"
                          : "text-gray-900"
                      )}
                    >
                      {option.label}
                    </span>
                    {option.id === "uber_express" && (
                      <Image
                        src="/uber.svg"
                        alt="Uber"
                        width={28}
                        height={10}
                        className={cn(
                          selectedDelivery === option.id
                            ? "brightness-0 invert opacity-80"
                            : "opacity-60"
                        )}
                      />
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-xs",
                      selectedDelivery === option.id && option.id === "uber_express"
                        ? "text-white/70"
                        : "text-gray-500"
                    )}
                  >
                    {option.description}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold flex-shrink-0",
                    selectedDelivery === option.id && option.id === "uber_express"
                      ? "text-white"
                      : "text-gray-900"
                  )}
                >
                  {option.cost === 0 ? "Free" : `+$${option.cost}`}
                </span>
              </button>
            ))}
        </div>
      </div>

      {/* Delivery Address (only for Uber Express and Shipping) */}
      {requiresAddress && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            {selectedDelivery === "uber_express" ? "Delivery Address" : "Shipping Address"}
          </h3>
          {selectedDelivery === "uber_express" && (
            <p className="text-xs text-gray-500 mb-3">
              Your mobile number will be used for Uber delivery updates and driver contact.
            </p>
          )}
          <AddressElement
            options={{
              mode: "shipping",
              autocomplete: {
                mode: "google_maps_api",
                apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
              },
              defaultValues: {
                address: {
                  country: "AU",
                },
              },
              fields: {
                phone: "always",
              },
              validation: {
                phone: {
                  required: "always",
                },
              },
            }}
            onChange={(event) => {
              setAddressComplete(event.complete);
            }}
          />
        </div>
      )}

      {/* Price Breakdown */}
      {breakdown && (
        <div className="p-3 bg-gray-50 rounded-md space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Item</span>
            <span className="text-gray-900">${breakdown.itemPrice.toLocaleString("en-AU")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Delivery</span>
            <span className="text-gray-900">
              {breakdown.deliveryCost === 0 ? "Free" : `$${breakdown.deliveryCost.toLocaleString("en-AU")}`}
            </span>
          </div>
          {breakdown.buyerFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Service fee</span>
              <span className="text-gray-900">${breakdown.buyerFee.toFixed(2)}</span>
            </div>
          )}
          <div className="pt-2 border-t border-gray-200 flex justify-between">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-lg font-bold text-gray-900">
              ${breakdown.totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Payment Element */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment</h3>
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {/* Error Message */}
      {paymentError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{paymentError}</p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={!stripe || isProcessing || isUpdating || (requiresAddress && !addressComplete)}
        className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium text-base"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : breakdown ? (
          `Pay $${breakdown.totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
        ) : (
          "Pay"
        )}
      </Button>

      {/* Security Note */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
        <Shield className="h-3 w-3" />
        <span>Secured by Stripe</span>
        <Image src="/stripe.svg" alt="Stripe" width={32} height={13} className="opacity-40" />
      </div>
    </form>
  );
}


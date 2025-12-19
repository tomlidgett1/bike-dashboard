"use client";

import * as React from "react";
import Image from "next/image";
import { X, MapPin, Truck, Loader2, Check, Shield, ChevronLeft, ChevronRight, Package } from "lucide-react";
import { PaymentElement, AddressElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
  eta?: string;
  icon: "uber" | "auspost" | "pickup";
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

type CheckoutStep = "delivery" | "address" | "payment";

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
  const [currentStep, setCurrentStep] = React.useState<CheckoutStep>("delivery");

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
      setCurrentStep("delivery");
    }
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

  const requiresAddress = selectedDelivery !== "pickup";

  const handleContinue = () => {
    if (currentStep === "delivery") {
      if (requiresAddress) {
        setCurrentStep("address");
      } else {
        setCurrentStep("payment");
      }
    } else if (currentStep === "address") {
      setCurrentStep("payment");
    }
  };

  const handleBack = () => {
    if (currentStep === "payment") {
      if (requiresAddress) {
        setCurrentStep("address");
      } else {
        setCurrentStep("delivery");
      }
    } else if (currentStep === "address") {
      setCurrentStep("delivery");
    }
  };

  const getStepNumber = () => {
    if (currentStep === "delivery") return 1;
    if (currentStep === "address") return 2;
    return requiresAddress ? 3 : 2;
  };

  const getTotalSteps = () => requiresAddress ? 3 : 2;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        showCloseButton={false}
        className="rounded-t-2xl max-h-[92vh] flex flex-col p-0"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-100">
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-3">
              {currentStep !== "delivery" && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5 text-gray-600" />
                </button>
              )}
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {currentStep === "delivery" && "Delivery"}
                  {currentStep === "address" && "Address"}
                  {currentStep === "payment" && "Payment"}
                </h2>
                <p className="text-xs text-gray-500">
                  Step {getStepNumber()} of {getTotalSteps()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="p-4">
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
            </div>
          ) : !clientSecret ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <StripeElementsProvider clientSecret={clientSecret}>
              <CheckoutSteps
                currentStep={currentStep}
                productName={productName}
                productPrice={productPrice}
                productImage={productImage}
                deliveryOptions={deliveryOptions}
                selectedDelivery={selectedDelivery}
                onDeliveryChange={handleDeliveryChange}
                breakdown={breakdown}
                isUpdating={isLoading}
                requiresAddress={requiresAddress}
                onContinue={handleContinue}
                onSuccess={onSuccess}
                onClose={onClose}
              />
            </StripeElementsProvider>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// Checkout Steps Component
// ============================================================

interface CheckoutStepsProps {
  currentStep: CheckoutStep;
  productName: string;
  productPrice: number;
  productImage?: string | null;
  deliveryOptions: DeliveryOption[];
  selectedDelivery: DeliveryMethod;
  onDeliveryChange: (method: DeliveryMethod) => void;
  breakdown: PriceBreakdown | null;
  isUpdating: boolean;
  requiresAddress: boolean;
  onContinue: () => void;
  onSuccess?: () => void;
  onClose: () => void;
}

function CheckoutSteps({
  currentStep,
  productName,
  productPrice,
  productImage,
  deliveryOptions,
  selectedDelivery,
  onDeliveryChange,
  breakdown,
  isUpdating,
  requiresAddress,
  onContinue,
  onSuccess,
  onClose,
}: CheckoutStepsProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [isComplete, setIsComplete] = React.useState(false);
  const [addressComplete, setAddressComplete] = React.useState(false);
  const [shippingDetails, setShippingDetails] = React.useState<{
    name: string;
    phone: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);
    setPaymentError(null);

    try {
      // Build confirm params with shipping if we have it
      const confirmParams: {
        return_url: string;
        shipping?: {
          name: string;
          phone: string;
          address: {
            line1: string;
            line2?: string;
            city: string;
            state: string;
            postal_code: string;
            country: string;
          };
        };
      } = {
        return_url: `${window.location.origin}/marketplace/checkout/success`,
      };

      // Add shipping details if we have them
      if (shippingDetails) {
        confirmParams.shipping = shippingDetails;
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams,
        redirect: "if_required",
      });

      if (error) {
        setPaymentError(error.message || "Payment failed");
        setIsProcessing(false);
      } else if (paymentIntent?.status === "succeeded") {
        setIsComplete(true);
        onSuccess?.();
        // Pass phone in URL as backup for SMS
        console.log('[Checkout] Payment succeeded, shippingDetails:', shippingDetails);
        const phone = shippingDetails?.phone ? encodeURIComponent(shippingDetails.phone) : "";
        console.log('[Checkout] Phone for redirect:', phone);
        const redirectUrl = `/marketplace/checkout/success?payment_intent=${paymentIntent.id}&phone=${phone}`;
        console.log('[Checkout] Redirect URL:', redirectUrl);
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 1500);
      }
    } catch (err) {
      console.error("[CheckoutSteps] Error:", err);
      setPaymentError("An unexpected error occurred");
      setIsProcessing(false);
    }
  };

  if (isComplete) {
    return (
      <div className="py-16 text-center px-4">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-in zoom-in-50 duration-300">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Successful!</h3>
        <p className="text-sm text-gray-500">Redirecting...</p>
      </div>
    );
  }

  // ============================================================
  // Step 1: Delivery Selection
  // ============================================================
  if (currentStep === "delivery") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 px-4 py-4 space-y-3">
          {/* Product Summary - Compact */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
            {productImage && (
              <div className="relative h-12 w-12 rounded-md overflow-hidden bg-gray-200 flex-shrink-0">
                <Image src={productImage} alt={productName} fill className="object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{productName}</p>
              <p className="text-base font-bold text-gray-900">${productPrice.toLocaleString("en-AU")}</p>
            </div>
          </div>

          {/* Delivery Options */}
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
                    "w-full flex items-center gap-3 p-4 rounded-md border-2 transition-all text-left",
                    selectedDelivery === option.id
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-md flex-shrink-0",
                    selectedDelivery === option.id ? "bg-gray-900" : "bg-gray-100"
                  )}>
                    {option.id === "uber_express" && (
                      <Image
                        src="/delivery.png"
                        alt="Delivery"
                        width={20}
                        height={20}
                        className={selectedDelivery === option.id ? "brightness-0 saturate-100" : "opacity-60"}
                        style={selectedDelivery === option.id ? { filter: "brightness(0) saturate(100%) invert(67%) sepia(93%) saturate(1352%) hue-rotate(87deg) brightness(95%) contrast(85%)" } : {}}
                      />
                    )}
                    {option.id === "auspost" && (
                      <Package className={cn("h-5 w-5", selectedDelivery === option.id ? "text-white" : "text-gray-600")} />
                    )}
                    {option.id === "shipping" && (
                      <Truck className={cn("h-5 w-5", selectedDelivery === option.id ? "text-white" : "text-gray-600")} />
                    )}
                    {option.id === "pickup" && (
                      <MapPin className={cn("h-5 w-5", selectedDelivery === option.id ? "text-white" : "text-gray-600")} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{option.label}</span>
                      {option.id === "uber_express" && (
                        <Image src="/uber.svg" alt="Uber" width={28} height={10} className="opacity-60" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                  </div>

                  {/* Price */}
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-bold text-gray-900">
                      {option.cost === 0 ? "Free" : `$${option.cost}`}
                    </span>
                  </div>

                  {/* Selected indicator */}
                  {selectedDelivery === option.id && (
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 p-4 bg-white">
          {breakdown && (
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-600">Total</span>
              <span className="text-lg font-bold text-gray-900">
                ${breakdown.totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <Button
            onClick={onContinue}
            disabled={isUpdating}
            className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
          >
            Continue
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Step 2: Address Entry
  // ============================================================
  if (currentStep === "address") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 px-4 py-4">
          <p className="text-sm text-gray-600 mb-4">
            {selectedDelivery === "uber_express" 
              ? "Enter your delivery address. Your mobile will be used for driver updates."
              : "Enter your shipping address for Australia Post delivery."}
          </p>
          <AddressElement
            options={{
              mode: "shipping",
              autocomplete: {
                mode: "google_maps_api",
                apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
              },
              defaultValues: {
                address: { country: "AU" },
              },
              fields: { phone: "always" },
              validation: { phone: { required: "always" } },
            }}
            onChange={(event) => {
              console.log('[AddressElement] onChange:', { complete: event.complete, value: event.value });
              setAddressComplete(event.complete);
              if (event.complete && event.value) {
                // Save the shipping details for use when confirming payment
                const details = {
                  name: event.value.name || "",
                  phone: event.value.phone || "",
                  address: {
                    line1: event.value.address.line1 || "",
                    line2: event.value.address.line2 || undefined,
                    city: event.value.address.city || "",
                    state: event.value.address.state || "",
                    postal_code: event.value.address.postal_code || "",
                    country: event.value.address.country || "AU",
                  },
                };
                console.log('[AddressElement] Saving shipping details:', details);
                setShippingDetails({
                  name: event.value.name || "",
                  phone: event.value.phone || "",
                  address: {
                    line1: event.value.address.line1 || "",
                    line2: event.value.address.line2 || undefined,
                    city: event.value.address.city || "",
                    state: event.value.address.state || "",
                    postal_code: event.value.address.postal_code || "",
                    country: event.value.address.country || "AU",
                  },
                });
              }
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 p-4 bg-white">
          <Button
            onClick={onContinue}
            disabled={!addressComplete}
            className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
          >
            Continue to Payment
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Step 3: Payment
  // ============================================================
  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Order Summary */}
        <div className="p-3 bg-gray-50 rounded-md space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Item</span>
            <span className="text-gray-900">${breakdown?.itemPrice.toLocaleString("en-AU")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Delivery</span>
            <span className="text-gray-900">
              {breakdown?.deliveryCost === 0 ? "Free" : `$${breakdown?.deliveryCost.toLocaleString("en-AU")}`}
            </span>
          </div>
          {breakdown && breakdown.buyerFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Service fee</span>
              <span className="text-gray-900">${breakdown.buyerFee.toFixed(2)}</span>
            </div>
          )}
          <div className="pt-2 border-t border-gray-200 flex justify-between">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-lg font-bold text-gray-900">
              ${breakdown?.totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Payment Element */}
        <PaymentElement options={{ layout: "tabs" }} />
        
        {/* Debug: Show captured phone */}
        <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono text-gray-600">
          <div>Debug - Captured phone: {shippingDetails?.phone || "(none)"}</div>
          <div>Debug - Has shipping: {shippingDetails ? "Yes" : "No"}</div>
        </div>

        {/* Error */}
        {paymentError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{paymentError}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-gray-100 p-4 bg-white space-y-3">
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium text-base"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            `Pay $${breakdown?.totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
          )}
        </Button>
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <Shield className="h-3 w-3" />
          <span>Secured by Stripe</span>
          <Image src="/stripe.svg" alt="Stripe" width={32} height={13} className="opacity-40" />
        </div>
      </div>
    </form>
  );
}

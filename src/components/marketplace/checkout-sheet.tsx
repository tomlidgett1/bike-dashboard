"use client";

import * as React from "react";
import Image from "next/image";
import { X, MapPin, Truck, Loader2, Check, Shield, ChevronLeft, ChevronRight, Package, AlertCircle } from "lucide-react";
import { PaymentElement, AddressElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { StripeAddressElementChangeEvent } from "@stripe/stripe-js";
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
  voucherDiscount?: number;
  totalBeforeDiscount?: number;
  totalAmount: number;
}

interface VoucherInfo {
  id: string;
  discount: number;
  description: string;
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

interface UberEligibility {
  eligible: boolean;
  distance: number | null;
  message?: string;
  checking: boolean;
}

// New step order: Address -> Delivery -> Payment
type CheckoutStep = "address" | "delivery" | "payment";

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
  const [selectedDelivery, setSelectedDelivery] = React.useState<DeliveryMethod>("auspost"); // Default to AusPost until eligibility checked
  const [breakdown, setBreakdown] = React.useState<PriceBreakdown | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [currentStep, setCurrentStep] = React.useState<CheckoutStep>("address"); // Start with address
  
  // Uber eligibility state
  const [uberEligibility, setUberEligibility] = React.useState<UberEligibility>({
    eligible: false,
    distance: null,
    message: undefined,
    checking: false,
  });
  
  // Shipping details captured from address step
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
  
  // Voucher state - captures any applicable voucher from the API
  const [appliedVoucher, setAppliedVoucher] = React.useState<VoucherInfo | null>(null);

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
      setCurrentStep("address");
      setShippingDetails(null);
      setUberEligibility({
        eligible: false,
        distance: null,
        message: undefined,
        checking: false,
      });
      setSelectedDelivery("auspost");
    }
  }, [isOpen]);

  const createPaymentIntent = async (deliveryMethod: DeliveryMethod = "auspost") => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          deliveryMethod,
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
      
      // Capture voucher info if present
      if (data.voucher) {
        setAppliedVoucher(data.voucher);
        console.log("[CheckoutSheet] Voucher applied:", data.voucher);
      }
    } catch (err) {
      console.error("[CheckoutSheet] Error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeliveryChange = async (method: DeliveryMethod) => {
    if (method === selectedDelivery || !paymentIntentId) return;

    // Don't allow selecting Uber if not eligible
    if (method === "uber_express" && !uberEligibility.eligible) {
      return;
    }

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
      
      // Update voucher info if present
      if (data.voucher) {
        setAppliedVoucher(data.voucher);
      }
    } catch (err) {
      console.error("[CheckoutSheet] Delivery update error:", err);
      setError(err instanceof Error ? err.message : "Failed to update delivery");
    } finally {
      setIsLoading(false);
    }
  };

  // Check Uber eligibility based on address
  const checkUberEligibility = async (address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  }) => {
    setUberEligibility(prev => ({ ...prev, checking: true }));

    try {
      const response = await fetch("/api/delivery/check-eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[CheckoutSheet] Eligibility check failed:", data.error);
        // Default to eligible if check fails (fail open)
        setUberEligibility({
          eligible: true,
          distance: null,
          message: "Could not verify distance",
          checking: false,
        });
        return;
      }

      setUberEligibility({
        eligible: data.eligible,
        distance: data.distance,
        message: data.message,
        checking: false,
      });

      // If eligible, auto-select Uber Express
      if (data.eligible) {
        setSelectedDelivery("uber_express");
        // Update payment intent with new delivery method
        if (paymentIntentId) {
          handleDeliveryChange("uber_express");
        }
      }
    } catch (err) {
      console.error("[CheckoutSheet] Eligibility check error:", err);
      // Default to eligible if check fails (fail open)
      setUberEligibility({
        eligible: true,
        distance: null,
        message: "Could not verify distance",
        checking: false,
      });
    }
  };

  const requiresAddress = selectedDelivery !== "pickup";

  const handleContinue = () => {
    if (currentStep === "address") {
      setCurrentStep("delivery");
    } else if (currentStep === "delivery") {
      setCurrentStep("payment");
    }
  };

  const handleBack = () => {
    if (currentStep === "payment") {
      setCurrentStep("delivery");
    } else if (currentStep === "delivery") {
      setCurrentStep("address");
    }
  };

  const getStepNumber = () => {
    if (currentStep === "address") return 1;
    if (currentStep === "delivery") return 2;
    return 3;
  };

  const getTotalSteps = () => 3;

  const getStepTitle = () => {
    if (currentStep === "address") return "Delivery Address";
    if (currentStep === "delivery") return "Delivery Method";
    return "Payment";
  };

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
              {currentStep !== "address" && (
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
                  {getStepTitle()}
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
                  onClick={() => createPaymentIntent()}
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
                voucher={appliedVoucher}
                isUpdating={isLoading}
                requiresAddress={requiresAddress}
                onContinue={handleContinue}
                onSuccess={onSuccess}
                onClose={onClose}
                uberEligibility={uberEligibility}
                onCheckEligibility={checkUberEligibility}
                shippingDetails={shippingDetails}
                onShippingDetailsChange={setShippingDetails}
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
  voucher: VoucherInfo | null;
  isUpdating: boolean;
  requiresAddress: boolean;
  onContinue: () => void;
  onSuccess?: () => void;
  onClose: () => void;
  uberEligibility: UberEligibility;
  onCheckEligibility: (address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  }) => Promise<void>;
  shippingDetails: {
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
  } | null;
  onShippingDetailsChange: (details: {
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
  } | null) => void;
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
  voucher,
  isUpdating,
  requiresAddress,
  onContinue,
  onSuccess,
  onClose,
  uberEligibility,
  onCheckEligibility,
  shippingDetails,
  onShippingDetailsChange,
}: CheckoutStepsProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [isComplete, setIsComplete] = React.useState(false);
  const [addressComplete, setAddressComplete] = React.useState(false);
  const [hasCheckedEligibility, setHasCheckedEligibility] = React.useState(false);

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

  // Handle address completion and trigger eligibility check
  const handleAddressChange = async (event: StripeAddressElementChangeEvent) => {
    console.log('[AddressElement] onChange:', { complete: event.complete, value: event.value });
    setAddressComplete(event.complete);
    
    if (event.complete && event.value) {
      // Save the shipping details
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
      onShippingDetailsChange(details);

      // Check Uber eligibility if we haven't already
      if (!hasCheckedEligibility) {
        setHasCheckedEligibility(true);
        await onCheckEligibility(details.address);
      }
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
  // Step 1: Address Entry (NEW FIRST STEP)
  // ============================================================
  if (currentStep === "address") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 px-4 py-4">
          {/* Product Summary - Compact */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md mb-4">
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

          <p className="text-sm text-gray-600 mb-4">
            Enter your delivery address to see available delivery options.
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
            onChange={handleAddressChange}
          />

          {/* Eligibility checking indicator */}
          {uberEligibility.checking && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking delivery options...</span>
            </div>
          )}

          {/* Eligibility result */}
          {addressComplete && !uberEligibility.checking && uberEligibility.distance !== null && (
            <div className={cn(
              "mt-4 p-3 rounded-md flex items-start gap-2",
              uberEligibility.eligible 
                ? "bg-green-50 border border-green-200" 
                : "bg-amber-50 border border-amber-200"
            )}>
              {uberEligibility.eligible ? (
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={cn(
                  "text-sm font-medium",
                  uberEligibility.eligible ? "text-green-800" : "text-amber-800"
                )}>
                  {uberEligibility.eligible 
                    ? "Uber Express Available!" 
                    : "Uber Express Unavailable"}
                </p>
                <p className={cn(
                  "text-xs mt-0.5",
                  uberEligibility.eligible ? "text-green-600" : "text-amber-600"
                )}>
                  {uberEligibility.message}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 p-4 bg-white">
          <Button
            onClick={onContinue}
            disabled={!addressComplete || uberEligibility.checking}
            className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
          >
            {uberEligibility.checking ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                Continue to Delivery Options
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Step 2: Delivery Selection (NOW SECOND STEP)
  // ============================================================
  if (currentStep === "delivery") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 px-4 py-4 space-y-3">
          {/* Delivery address summary */}
          {shippingDetails && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
              <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">
                  {shippingDetails.address.line1}
                  {shippingDetails.address.line2 && `, ${shippingDetails.address.line2}`}
                </p>
                <p className="text-xs text-gray-500">
                  {shippingDetails.address.city}, {shippingDetails.address.state} {shippingDetails.address.postal_code}
                </p>
              </div>
            </div>
          )}

          {/* Delivery Options */}
          <div className="space-y-2">
            {deliveryOptions.map((option) => {
              // Check if this is Uber and if it's available based on eligibility
              const isUber = option.id === "uber_express";
              const isDisabled = isUber && !uberEligibility.eligible;
              const isAvailable = option.available && !isDisabled;

              if (!option.available && !isUber) return null;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => isAvailable && onDeliveryChange(option.id)}
                  disabled={isUpdating || isDisabled}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 rounded-md border-2 transition-all text-left",
                    isDisabled
                      ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
                      : selectedDelivery === option.id
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-md flex-shrink-0",
                    isDisabled 
                      ? "bg-gray-100"
                      : selectedDelivery === option.id 
                        ? "bg-gray-900" 
                        : "bg-gray-100"
                  )}>
                    {option.id === "uber_express" && (
                      <Image
                        src="/delivery.png"
                        alt="Delivery"
                        width={20}
                        height={20}
                        className={cn(
                          isDisabled 
                            ? "opacity-30" 
                            : selectedDelivery === option.id 
                              ? "brightness-0 saturate-100" 
                              : "opacity-60"
                        )}
                        style={!isDisabled && selectedDelivery === option.id ? { filter: "brightness(0) saturate(100%) invert(67%) sepia(93%) saturate(1352%) hue-rotate(87deg) brightness(95%) contrast(85%)" } : {}}
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
                      <span className={cn(
                        "text-sm font-semibold",
                        isDisabled ? "text-gray-400" : "text-gray-900"
                      )}>
                        {option.label}
                      </span>
                      {option.id === "uber_express" && (
                        <Image 
                          src="/uber.svg" 
                          alt="Uber" 
                          width={28} 
                          height={10} 
                          className={isDisabled ? "opacity-30" : "opacity-60"} 
                        />
                      )}
                    </div>
                    <p className={cn(
                      "text-xs mt-0.5",
                      isDisabled ? "text-gray-400" : "text-gray-500"
                    )}>
                      {isDisabled 
                        ? `Only available within 10km of Ashburton Cycles` 
                        : option.description}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="text-right flex-shrink-0">
                    <span className={cn(
                      "text-sm font-bold",
                      isDisabled ? "text-gray-400" : "text-gray-900"
                    )}>
                      {option.cost === 0 ? "Free" : `$${option.cost}`}
                    </span>
                  </div>

                  {/* Selected indicator */}
                  {selectedDelivery === option.id && !isDisabled && (
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Ineligibility notice */}
          {!uberEligibility.eligible && uberEligibility.distance !== null && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    You&apos;re {uberEligibility.distance}km from Ashburton Cycles
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Uber Express is only available for addresses within 10km. 
                    Australia Post shipping is available Australia-wide.
                  </p>
                </div>
              </div>
            </div>
          )}
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
          {/* Voucher Discount */}
          {voucher && (
            <div className="flex justify-between text-sm">
              <span className="text-green-600 flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                Yellow Jersey discount
              </span>
              <span className="text-green-600 font-medium">-${voucher.discount.toFixed(2)}</span>
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

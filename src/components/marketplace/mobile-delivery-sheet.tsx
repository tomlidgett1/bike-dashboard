"use client";

import * as React from "react";
import Image from "next/image";
import { X, MapPin, Truck, Loader2, Check, Package, ChevronRight, ChevronLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

export type DeliveryMethod = 'uber_express' | 'auspost' | 'pickup' | 'shipping';

interface DeliveryOption {
  id: DeliveryMethod;
  label: string;
  description: string;
  cost: number;
  available: boolean;
}

interface MobileDeliverySheetProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  productPrice: number;
  productImage?: string | null;
  pickupLocation?: string | null;
  shippingAvailable?: boolean;
  shippingCost?: number;
  pickupOnly?: boolean;
  onCheckout: (deliveryMethod: DeliveryMethod, address?: AddressData) => void;
  isLoading?: boolean;
}

interface AddressData {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface UberEligibility {
  eligible: boolean;
  distance: number | null;
  message?: string;
  checking: boolean;
}

// Delivery fees
const UBER_EXPRESS_FEE = 15;
const AUSPOST_FEE = 12;
const BUYER_FEE_RATE = 0.005; // 0.5%

type MobileStep = "address" | "delivery";

interface VoucherInfo {
  id: string;
  amount_cents: number;
  min_purchase_cents: number;
  description: string;
}

// ============================================================
// Component
// ============================================================

export function MobileDeliverySheet({
  isOpen,
  onClose,
  productId,
  productName,
  productPrice,
  productImage,
  pickupLocation,
  shippingAvailable = false,
  shippingCost = 0,
  pickupOnly = false,
  onCheckout,
  isLoading = false,
}: MobileDeliverySheetProps) {
  const [currentStep, setCurrentStep] = React.useState<MobileStep>("address");
  const [selectedDelivery, setSelectedDelivery] = React.useState<DeliveryMethod>("auspost");
  
  // Address form state
  const [address, setAddress] = React.useState<AddressData>({
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "AU",
  });

  // Uber eligibility state
  const [uberEligibility, setUberEligibility] = React.useState<UberEligibility>({
    eligible: false,
    distance: null,
    message: undefined,
    checking: false,
  });

  // Voucher state
  const [applicableVoucher, setApplicableVoucher] = React.useState<VoucherInfo | null>(null);
  const [voucherLoading, setVoucherLoading] = React.useState(false);

  // Reset state when sheet closes
  React.useEffect(() => {
    if (!isOpen) {
      setCurrentStep("address");
      setSelectedDelivery("auspost");
      setAddress({
        line1: "",
        line2: "",
        city: "",
        state: "",
        postal_code: "",
        country: "AU",
      });
      setUberEligibility({
        eligible: false,
        distance: null,
        message: undefined,
        checking: false,
      });
      setApplicableVoucher(null);
    }
  }, [isOpen]);

  // Fetch voucher when sheet opens
  React.useEffect(() => {
    const fetchVoucher = async () => {
      if (!isOpen) return;
      
      setVoucherLoading(true);
      try {
        const response = await fetch('/api/vouchers/check');
        if (!response.ok) {
          setApplicableVoucher(null);
          return;
        }
        
        const data = await response.json();
        
        // Find an applicable voucher for this product price
        const productPriceCents = productPrice * 100;
        const applicable = data.activeVouchers?.find(
          (v: VoucherInfo) => v.min_purchase_cents <= productPriceCents
        );
        
        if (applicable) {
          setApplicableVoucher(applicable);
        } else {
          setApplicableVoucher(null);
        }
      } catch (err) {
        console.error('[MobileDeliverySheet] Error fetching voucher:', err);
        setApplicableVoucher(null);
      } finally {
        setVoucherLoading(false);
      }
    };

    fetchVoucher();
  }, [isOpen, productPrice]);

  // Build delivery options
  const deliveryOptions: DeliveryOption[] = React.useMemo(() => {
    // If pickup only, only show pickup option
    if (pickupOnly) {
      return [
        {
          id: 'pickup' as DeliveryMethod,
          label: 'Local Pickup',
          description: pickupLocation || 'Pickup from seller',
          cost: 0,
          available: !!pickupLocation,
        },
      ];
    }
    
    const options: DeliveryOption[] = [];
    
    // Seller-defined shipping (if available)
    if (shippingAvailable) {
      options.push({
        id: 'shipping' as DeliveryMethod,
        label: 'Seller Shipping',
        description: shippingCost === 0 ? 'Free shipping' : 'Shipped by seller',
        cost: shippingCost,
        available: true,
      });
    }
    
    // Uber Express
    options.push({
      id: 'uber_express' as DeliveryMethod,
      label: 'Uber Express',
      description: 'Get it in 1 hour',
      cost: UBER_EXPRESS_FEE,
      available: true,
    });
    
    // Australia Post
    options.push({
      id: 'auspost' as DeliveryMethod,
      label: 'Australia Post',
      description: '2-5 business days',
      cost: AUSPOST_FEE,
      available: true,
    });
    
    // Pickup option
    if (pickupLocation) {
      options.push({
        id: 'pickup' as DeliveryMethod,
        label: 'Local Pickup',
        description: pickupLocation,
        cost: 0,
        available: true,
      });
    }
    
    return options;
  }, [pickupLocation, shippingAvailable, shippingCost, pickupOnly]);

  // Calculate totals
  const selectedOption = deliveryOptions.find(o => o.id === selectedDelivery);
  const deliveryCost = selectedOption?.cost || 0;
  const buyerFee = productPrice * BUYER_FEE_RATE;
  
  // Calculate voucher discount
  const voucherDiscount = applicableVoucher 
    ? Math.min(applicableVoucher.amount_cents / 100, productPrice) 
    : 0;
  
  const totalAmount = productPrice + deliveryCost + buyerFee - voucherDiscount;

  // Check if address is complete enough for validation
  const isAddressComplete = address.line1.trim() !== "" && 
    address.city.trim() !== "" && 
    address.state.trim() !== "" && 
    address.postal_code.trim() !== "";

  // Check Uber eligibility
  const checkUberEligibility = async () => {
    if (!isAddressComplete) return;

    setUberEligibility(prev => ({ ...prev, checking: true }));

    try {
      const response = await fetch("/api/delivery/check-eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[MobileDeliverySheet] Eligibility check failed:", data.error);
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

      // Auto-select Uber if eligible
      if (data.eligible) {
        setSelectedDelivery("uber_express");
      }
    } catch (err) {
      console.error("[MobileDeliverySheet] Eligibility check error:", err);
      setUberEligibility({
        eligible: true,
        distance: null,
        message: "Could not verify distance",
        checking: false,
      });
    }
  };

  const handleAddressContinue = async () => {
    await checkUberEligibility();
    setCurrentStep("delivery");
  };

  const handleCheckout = () => {
    onCheckout(selectedDelivery, address);
  };

  const handleBack = () => {
    setCurrentStep("address");
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        showCloseButton={false}
        className="rounded-t-2xl max-h-[90vh] flex flex-col p-0"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-100">
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-3">
              {currentStep === "delivery" && (
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
                  {currentStep === "address" ? "Delivery Address" : "Select Delivery"}
                </h2>
                <p className="text-xs text-gray-500">
                  Step {currentStep === "address" ? "1" : "2"} of 2
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
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Product Summary - Compact (show on both steps) */}
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

          {/* Step 1: Address Entry */}
          {currentStep === "address" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter your delivery address to see available options.
              </p>

              {/* Address Form */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="line1" className="text-sm font-medium text-gray-700">
                    Street Address <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="line1"
                    value={address.line1}
                    onChange={(e) => setAddress(prev => ({ ...prev, line1: e.target.value }))}
                    placeholder="123 Example Street"
                    className="mt-1 rounded-md"
                  />
                </div>

                <div>
                  <Label htmlFor="line2" className="text-sm font-medium text-gray-700">
                    Apartment, suite, etc. (optional)
                  </Label>
                  <Input
                    id="line2"
                    value={address.line2}
                    onChange={(e) => setAddress(prev => ({ ...prev, line2: e.target.value }))}
                    placeholder="Apt 4B"
                    className="mt-1 rounded-md"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="city" className="text-sm font-medium text-gray-700">
                      City <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="city"
                      value={address.city}
                      onChange={(e) => setAddress(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="Melbourne"
                      className="mt-1 rounded-md"
                    />
                  </div>
                  <div>
                    <Label htmlFor="state" className="text-sm font-medium text-gray-700">
                      State <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="state"
                      value={address.state}
                      onChange={(e) => setAddress(prev => ({ ...prev, state: e.target.value }))}
                      placeholder="VIC"
                      className="mt-1 rounded-md"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="postal_code" className="text-sm font-medium text-gray-700">
                      Postcode <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="postal_code"
                      value={address.postal_code}
                      onChange={(e) => setAddress(prev => ({ ...prev, postal_code: e.target.value }))}
                      placeholder="3000"
                      className="mt-1 rounded-md"
                    />
                  </div>
                  <div>
                    <Label htmlFor="country" className="text-sm font-medium text-gray-700">
                      Country
                    </Label>
                    <Input
                      id="country"
                      value="Australia"
                      disabled
                      className="mt-1 rounded-md bg-gray-50"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Delivery Selection */}
          {currentStep === "delivery" && (
            <>
              {/* Address summary */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
                <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">
                    {address.line1}
                    {address.line2 && `, ${address.line2}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {address.city}, {address.state} {address.postal_code}
                  </p>
                </div>
              </div>

              {/* Eligibility checking indicator */}
              {uberEligibility.checking && (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Checking delivery options...</span>
                </div>
              )}

              {/* Delivery Options */}
              <div className="space-y-2">
                {deliveryOptions.map((option) => {
                  const isUber = option.id === "uber_express";
                  const isDisabled = isUber && !uberEligibility.eligible && !uberEligibility.checking;
                  const isAvailable = option.available && !isDisabled;

                  if (!option.available && !isUber) return null;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => isAvailable && setSelectedDelivery(option.id)}
                      disabled={isLoading || isDisabled || uberEligibility.checking}
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
                            ? "Only available within 10km of Ashburton Cycles" 
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
              {!uberEligibility.eligible && uberEligibility.distance !== null && !uberEligibility.checking && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        You&apos;re {uberEligibility.distance}km from Ashburton Cycles
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Uber Express is only available within 10km. 
                        Australia Post is available Australia-wide.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 p-4 bg-white">
          {currentStep === "address" ? (
            <Button
              onClick={handleAddressContinue}
              disabled={!isAddressComplete}
              className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
            >
              Continue to Delivery Options
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <>
              {/* Price breakdown */}
              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Item</span>
                  <span className="text-gray-900">${productPrice.toLocaleString("en-AU")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Delivery</span>
                  <span className="text-gray-900">
                    {deliveryCost === 0 ? "Free" : `$${deliveryCost}`}
                  </span>
                </div>
                {buyerFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Service fee</span>
                    <span className="text-gray-900">${buyerFee.toFixed(2)}</span>
                  </div>
                )}
                {/* Voucher Discount */}
                {voucherDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600 flex items-center gap-1 font-medium">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                      Yellow Jersey discount
                    </span>
                    <span className="text-green-600 font-semibold">-${voucherDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-200 flex justify-between">
                  <span className="text-sm font-semibold text-gray-900">Total</span>
                  <span className="text-lg font-bold text-gray-900">
                    ${totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={isLoading || uberEligibility.checking}
                className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Redirecting to checkout...
                  </>
                ) : (
                  <>
                    Continue to Payment
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>

              {/* Stripe branding */}
              <div className="flex items-center justify-center gap-1.5 mt-3">
                <span className="text-[10px] text-gray-400">Secured by</span>
                <Image
                  src="/stripe.svg"
                  alt="Stripe"
                  width={36}
                  height={15}
                  className="opacity-50"
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

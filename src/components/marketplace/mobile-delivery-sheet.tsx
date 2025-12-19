"use client";

import * as React from "react";
import Image from "next/image";
import { X, MapPin, Truck, Loader2, Check, Package, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
  onCheckout: (deliveryMethod: DeliveryMethod) => void;
  isLoading?: boolean;
}

// Delivery fees
const UBER_EXPRESS_FEE = 15;
const AUSPOST_FEE = 12;
const BUYER_FEE_RATE = 0.005; // 0.5%

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
  onCheckout,
  isLoading = false,
}: MobileDeliverySheetProps) {
  const [selectedDelivery, setSelectedDelivery] = React.useState<DeliveryMethod>("uber_express");

  // Build delivery options
  const deliveryOptions: DeliveryOption[] = React.useMemo(() => [
    {
      id: 'uber_express' as DeliveryMethod,
      label: 'Uber Express',
      description: 'Get it in 1 hour',
      cost: UBER_EXPRESS_FEE,
      available: true,
    },
    {
      id: 'auspost' as DeliveryMethod,
      label: 'Australia Post',
      description: '2-5 business days',
      cost: AUSPOST_FEE,
      available: true,
    },
    {
      id: 'pickup' as DeliveryMethod,
      label: 'Local Pickup',
      description: pickupLocation || 'Pickup from seller',
      cost: 0,
      available: !!pickupLocation,
    },
  ], [pickupLocation]);

  // Calculate totals
  const selectedOption = deliveryOptions.find(o => o.id === selectedDelivery);
  const deliveryCost = selectedOption?.cost || 0;
  const buyerFee = productPrice * BUYER_FEE_RATE;
  const totalAmount = productPrice + deliveryCost + buyerFee;

  const handleContinue = () => {
    onCheckout(selectedDelivery);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        showCloseButton={false}
        className="rounded-t-2xl max-h-[85vh] flex flex-col p-0"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-100">
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-4 pb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Select Delivery</h2>
              <p className="text-xs text-gray-500">Choose how you&apos;d like to receive your item</p>
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
                  onClick={() => setSelectedDelivery(option.id)}
                  disabled={isLoading}
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
            <div className="pt-2 border-t border-gray-200 flex justify-between">
              <span className="text-sm font-semibold text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900">
                ${totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <Button
            onClick={handleContinue}
            disabled={isLoading}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}


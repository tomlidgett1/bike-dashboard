"use client";

// ============================================================
// Cart Drawer
// ============================================================
// Right-side cart panel + checkout flow for a single-seller cart.
// Steps: cart list -> delivery address -> delivery method -> Stripe Checkout.
// Mirrors MobileDeliverySheet's address/eligibility/delivery UX, extended to
// multiple items. All pricing is re-validated server-side in
// /api/stripe/create-cart-checkout; values shown here are for display only.

import * as React from "react";
import Image from "next/image";
import { useJsApiLoader } from "@react-google-maps/api";
import {
  X,
  ShoppingCart,
  Trash2,
  MapPin,
  Package,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Store,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/providers/cart-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useUserProfile } from "@/lib/hooks/use-user-profile";

type DeliveryMethod = "uber_express" | "auspost" | "pickup";

const UBER_EXPRESS_FEE = 15;
const AUSPOST_FEE = 12;
const BUYER_FEE_RATE = 0.005;
const GOOGLE_MAPS_LIBRARIES: "places"[] = ["places"];

interface AddressData {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface SavedShippingAddress extends AddressData {
  name?: string;
  phone?: string;
}

interface UberEligibility {
  eligible: boolean;
  distance: number | null;
  message?: string;
  checking: boolean;
}

const EMPTY_ADDRESS: AddressData = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "AU",
};

const fmt = (v: number) =>
  `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function getAddressPart(
  components: google.maps.GeocoderAddressComponent[],
  type: string,
  value: "long_name" | "short_name" = "long_name"
) {
  return components.find((component) => component.types.includes(type))?.[value] || "";
}

function addressFromGooglePlace(place: google.maps.places.PlaceResult): AddressData | null {
  const components = place.address_components;
  if (!components?.length) return null;

  const streetNumber = getAddressPart(components, "street_number", "short_name");
  const route = getAddressPart(components, "route");
  const subpremise = getAddressPart(components, "subpremise", "short_name");
  const premise = getAddressPart(components, "premise");
  const line1 =
    [streetNumber, route].filter(Boolean).join(" ") ||
    premise ||
    place.name ||
    place.formatted_address?.split(",")[0]?.trim() ||
    "";
  const city =
    getAddressPart(components, "locality") ||
    getAddressPart(components, "sublocality_level_1") ||
    getAddressPart(components, "postal_town") ||
    getAddressPart(components, "administrative_area_level_2");
  const state = getAddressPart(components, "administrative_area_level_1", "short_name");
  const postalCode = getAddressPart(components, "postal_code", "short_name");
  const postalCodeSuffix = getAddressPart(components, "postal_code_suffix", "short_name");
  const country = getAddressPart(components, "country", "short_name") || "AU";

  return {
    line1,
    line2: subpremise ? `Unit ${subpremise}` : "",
    city,
    state,
    postal_code: postalCodeSuffix ? `${postalCode}-${postalCodeSuffix}` : postalCode,
    country,
  };
}

function addressFromSavedShippingAddress(saved: SavedShippingAddress | null | undefined): AddressData {
  if (!saved) return { ...EMPTY_ADDRESS };

  return {
    line1: saved.line1 || "",
    line2: saved.line2 || "",
    city: saved.city || "",
    state: saved.state || "",
    postal_code: saved.postal_code || "",
    country: saved.country || "AU",
  };
}

type CartStep = "cart" | "address" | "delivery";

// ============================================================
// Cross-seller replace confirmation (driven by CartProvider state)
// ============================================================

function CartReplaceDialog() {
  const { pendingReplacement, sellerName, confirmReplacement, cancelReplacement } = useCart();
  const open = !!pendingReplacement;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && cancelReplacement()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start a new cart?</AlertDialogTitle>
          <AlertDialogDescription>
            Your cart has items from {sellerName || "another seller"}. A cart can only contain
            items from one seller, so adding{" "}
            <span className="font-medium text-gray-900">{pendingReplacement?.name}</span> will
            replace what&apos;s currently in your cart.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" onClick={cancelReplacement}>Keep current cart</AlertDialogCancel>
          <AlertDialogAction className="cursor-pointer" onClick={confirmReplacement}>Replace cart</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// Main drawer
// ============================================================

export function CartDrawer() {
  const cart = useCart();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { profile } = useUserProfile();
  const savedAddress = React.useMemo(
    () => addressFromSavedShippingAddress(profile?.shipping_address ?? null),
    [profile?.shipping_address]
  );

  // The drawer serves two modes off the same UI: the real (persisted) cart, and
  // a transient single-item "Buy Now". `active*` is whichever set is showing.
  // The header badge stays bound to the real cart via the provider's `count`.
  const isBuyNow = cart.isBuyNow;
  const activeItems = isBuyNow && cart.buyNowItem ? [cart.buyNowItem] : cart.items;
  const activeCount = activeItems.length; // distinct lines — drives the empty-state check
  const activeUnits = activeItems.reduce((sum, i) => sum + i.quantity, 0); // total units
  const activeSubtotal = activeItems.reduce(
    (sum, i) => sum + (Number(i.price) || 0) * i.quantity,
    0
  );
  const activeSellerName = activeItems[0]?.sellerName ?? null;
  const activeSellerId = activeItems[0]?.sellerId ?? null;
  const cartUberEligible =
    activeItems.length > 0 && activeItems.every((item) => item.uberDeliveryEligible === true);

  const [step, setStep] = React.useState<CartStep>("cart");
  const [selectedDelivery, setSelectedDelivery] = React.useState<DeliveryMethod>("auspost");
  const [address, setAddress] = React.useState<AddressData>(() => savedAddress);
  const [uberEligibility, setUberEligibility] = React.useState<UberEligibility>({
    eligible: false,
    distance: null,
    message: undefined,
    checking: false,
  });
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const addressInputRef = React.useRef<HTMLInputElement | null>(null);
  const autocompleteRef = React.useRef<google.maps.places.Autocomplete | null>(null);
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded: isGoogleMapsLoaded, loadError: googleMapsLoadError } = useJsApiLoader({
    googleMapsApiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const canUseGoogleAddressAutocomplete = Boolean(googleMapsApiKey && isGoogleMapsLoaded && !googleMapsLoadError);

  // Reset the flow whenever the drawer closes.
  React.useEffect(() => {
    if (!cart.isOpen) {
      setStep("cart");
      setSelectedDelivery("auspost");
      setAddress(savedAddress);
      setUberEligibility({ eligible: false, distance: null, message: undefined, checking: false });
      setError(null);
      setIsRedirecting(false);
    }
  }, [cart.isOpen, savedAddress]);

  React.useEffect(() => {
    if (cart.isOpen && step === "cart") {
      setAddress(savedAddress);
    }
  }, [cart.isOpen, savedAddress, step]);

  React.useEffect(() => {
    if (!cart.isOpen || !isBuyNow || activeCount === 0) return;
    setAddress(savedAddress);
    setSelectedDelivery("auspost");
    setUberEligibility({ eligible: false, distance: null, message: undefined, checking: false });
    setError(null);
    setIsRedirecting(false);
    setStep("address");
  }, [cart.buyNowRequestId, cart.isOpen, isBuyNow, activeCount, savedAddress]);

  // If the active set empties mid-flow, return to the list.
  React.useEffect(() => {
    if (activeCount === 0 && step !== "cart") setStep("cart");
  }, [activeCount, step]);

  const buyerFee = activeSubtotal * BUYER_FEE_RATE;
  const deliveryCost =
    selectedDelivery === "uber_express"
      ? UBER_EXPRESS_FEE
      : selectedDelivery === "auspost"
        ? AUSPOST_FEE
        : 0;
  const total = activeSubtotal + deliveryCost + buyerFee;

  const isAddressComplete =
    address.line1.trim() !== "" &&
    address.city.trim() !== "" &&
    address.state.trim() !== "" &&
    address.postal_code.trim() !== "";

  const checkUberEligibility = async () => {
    if (!isAddressComplete) return;

    if (!cartUberEligible) {
      setUberEligibility({
        eligible: false,
        distance: null,
        message: "Every item in the cart must be enabled for Uber Express.",
        checking: false,
      });
      setSelectedDelivery("auspost");
      return;
    }

    setUberEligibility((p) => ({ ...p, checking: true }));
    try {
      const res = await fetch("/api/delivery/check-eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          sellerId: activeSellerId,
          productIds: activeItems.map((item) => item.productId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUberEligibility({ eligible: true, distance: null, message: "Could not verify distance", checking: false });
        return;
      }
      setUberEligibility({
        eligible: data.eligible,
        distance: data.distance,
        message: data.message,
        checking: false,
      });
      if (data.eligible) setSelectedDelivery("uber_express");
    } catch {
      setUberEligibility({ eligible: true, distance: null, message: "Could not verify distance", checking: false });
    }
  };

  const handleProceed = () => {
    setError(null);
    if (!user) {
      openAuthModal();
      return;
    }
    setStep("address");
  };

  const handleAddressContinue = async () => {
    await checkUberEligibility();
    setStep("delivery");
  };

  const handleGooglePlaceChanged = React.useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place) return;

    const parsedAddress = addressFromGooglePlace(place);
    if (!parsedAddress) return;

    setAddress((previous) => ({
      ...previous,
      ...parsedAddress,
      line2: parsedAddress.line2 || "",
    }));
    setUberEligibility({ eligible: false, distance: null, message: undefined, checking: false });
    setSelectedDelivery("auspost");
  }, []);

  React.useEffect(() => {
    if (step !== "address" || !canUseGoogleAddressAutocomplete || !addressInputRef.current) return;

    const autocomplete = new google.maps.places.Autocomplete(addressInputRef.current, {
      componentRestrictions: { country: "au" },
      fields: ["address_components", "formatted_address", "name"],
      types: ["address"],
    });
    autocompleteRef.current = autocomplete;

    const listener = autocomplete.addListener("place_changed", handleGooglePlaceChanged);

    return () => {
      google.maps.event.removeListener(listener);
      if (autocompleteRef.current === autocomplete) {
        autocompleteRef.current = null;
      }
    };
  }, [canUseGoogleAddressAutocomplete, handleGooglePlaceChanged, step]);

  const keepGooglePlacesDropdownInteractive = React.useCallback((event: Event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".pac-container")) {
      event.preventDefault();
    }
  }, []);

  const handleCheckout = async () => {
    setIsRedirecting(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-cart-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: activeItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          deliveryMethod: selectedDelivery,
          shippingAddress: selectedDelivery === "pickup" ? undefined : address,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Reconcile with server truth before surfacing the reason: clamp lines
        // whose stock dropped, drop ones that sold out. setQuantity also covers
        // Buy Now (the provider mirrors it onto buyNowItem).
        if (Array.isArray(data.unavailable) && data.unavailable.length > 0) {
          for (const u of data.unavailable) {
            const id = typeof u === "string" ? u : u?.id;
            if (!id) continue;
            const available = typeof u === "object" && u ? Number(u.available) : 0;
            if (Number.isFinite(available) && available >= 1) {
              cart.setQuantity(id, available);
            } else if (isBuyNow) {
              cart.exitBuyNow();
            } else {
              cart.removeItem(id);
            }
          }
        }
        throw new Error(data.error || "Failed to start checkout");
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsRedirecting(false);
    }
  };

  const deliveryOptions: { id: DeliveryMethod; label: string; description: string; cost: number }[] = [
    { id: "uber_express", label: "Uber Express", description: "Get it in 1 hour", cost: UBER_EXPRESS_FEE },
    { id: "auspost", label: "Australia Post", description: "2-5 business days", cost: AUSPOST_FEE },
    { id: "pickup", label: "Local Pickup", description: "Arrange collection with the seller", cost: 0 },
  ];

  return (
    <>
      <CartReplaceDialog />

      <Sheet open={cart.isOpen} onOpenChange={(o) => !o && cart.closeCart()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          onInteractOutside={keepGooglePlacesDropdownInteractive}
          onPointerDownOutside={keepGooglePlacesDropdownInteractive}
          className="w-full sm:max-w-md p-0 flex flex-col gap-0"
        >
          <SheetTitle className="sr-only">Shopping cart</SheetTitle>

          {/* Header */}
          <div className="flex-shrink-0 border-b border-gray-100">
            <div className="flex items-center justify-between px-4 h-14">
              <div className="flex items-center gap-2.5">
                {step !== "cart" && (
                  <button
                    type="button"
                    onClick={() => setStep(step === "delivery" ? "address" : "cart")}
                    className="p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                  </button>
                )}
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {step === "cart"
                      ? isBuyNow
                        ? "Buy Now"
                        : "Your Cart"
                      : step === "address"
                        ? "Delivery Address"
                        : "Delivery Method"}
                  </h2>
                  {activeSellerName && step === "cart" && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Store className="h-3 w-3" />
                      {activeSellerName}
                    </p>
                  )}
                  {step !== "cart" && <p className="text-xs text-gray-500">Step {step === "address" ? 1 : 2} of 2</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={cart.closeCart}
                className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                aria-label="Close cart"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Empty state */}
          {activeCount === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <ShoppingCart className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-900">Your cart is empty</p>
              <p className="text-xs text-gray-500 mt-1 max-w-[15rem]">
                Add items from a seller to check out together.
              </p>
              {error && <p className="mt-3 text-xs text-red-500 max-w-[15rem]">{error}</p>}
              <Button variant="outline" className="mt-5 rounded-md cursor-pointer" onClick={cart.closeCart}>
                Continue browsing
              </Button>
            </div>
          ) : step === "cart" ? (
            <>
              {/* Item list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {activeItems.map((item) => (
                  <div key={item.productId} className="flex items-start gap-3">
                    <div className="relative h-16 w-16 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                      {item.image ? (
                        <Image src={item.image} alt={item.name} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-5 w-5 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.name}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">
                        {fmt(item.price * item.quantity)}
                        {item.quantity > 1 && (
                          <span className="ml-1.5 text-xs font-normal text-gray-400">
                            {fmt(item.price)} each
                          </span>
                        )}
                      </p>
                      {/* Quantity stepper — only when more than one unit is purchasable.
                          Works in Buy Now mode too (provider mirrors it onto buyNowItem). */}
                      {item.maxQuantity > 1 && (
                        <div className="mt-2 inline-flex items-center rounded-md border border-gray-200">
                          <button
                            type="button"
                            onClick={() => cart.setQuantity(item.productId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="flex h-7 w-7 items-center justify-center rounded-l-md text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                            aria-label={`Decrease quantity of ${item.name}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span
                            className="min-w-[2rem] text-center text-sm font-medium text-gray-900 tabular-nums"
                            aria-live="polite"
                          >
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => cart.setQuantity(item.productId, item.quantity + 1)}
                            disabled={item.quantity >= item.maxQuantity}
                            className="flex h-7 w-7 items-center justify-center rounded-r-md text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {item.maxQuantity > 1 && item.quantity >= item.maxQuantity && (
                        <p className="mt-1 text-[11px] text-gray-400">
                          Max available: {item.maxQuantity}
                        </p>
                      )}
                    </div>
                    {!isBuyNow && (
                      <button
                        type="button"
                        onClick={() => cart.removeItem(item.productId)}
                        className="p-2 rounded-md hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 self-start cursor-pointer"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 border-t border-gray-100 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal ({activeUnits} {activeUnits === 1 ? "item" : "items"})</span>
                  <span className="font-semibold text-gray-900">{fmt(activeSubtotal)}</span>
                </div>
                <p className="text-xs text-gray-400">Delivery and fees calculated at the next step.</p>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <Button
                  onClick={handleProceed}
                  className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium cursor-pointer"
                >
                  Proceed to Checkout
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                {!isBuyNow && (
                  <button
                    type="button"
                    onClick={cart.clear}
                    className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  >
                    Clear cart
                  </button>
                )}
              </div>
            </>
          ) : step === "address" ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <p className="text-sm text-gray-600">
                  Enter your delivery address to see available options.
                </p>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="cart-line1" className="text-sm font-medium text-gray-700">
                      Street Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      ref={addressInputRef}
                      id="cart-line1"
                      value={address.line1}
                      onChange={(e) => setAddress((p) => ({ ...p, line1: e.target.value }))}
                      placeholder={canUseGoogleAddressAutocomplete ? "Start typing your address" : "123 Example Street"}
                      className="mt-1 rounded-md"
                      autoComplete="street-address"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cart-line2" className="text-sm font-medium text-gray-700">
                      Apartment, suite, etc. (optional)
                    </Label>
                    <Input
                      id="cart-line2"
                      value={address.line2}
                      onChange={(e) => setAddress((p) => ({ ...p, line2: e.target.value }))}
                      placeholder="Apt 4B"
                      className="mt-1 rounded-md"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cart-city" className="text-sm font-medium text-gray-700">
                        City <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cart-city"
                        value={address.city}
                        onChange={(e) => setAddress((p) => ({ ...p, city: e.target.value }))}
                        placeholder="Melbourne"
                        className="mt-1 rounded-md"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cart-state" className="text-sm font-medium text-gray-700">
                        State <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cart-state"
                        value={address.state}
                        onChange={(e) => setAddress((p) => ({ ...p, state: e.target.value }))}
                        placeholder="VIC"
                        className="mt-1 rounded-md"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cart-postcode" className="text-sm font-medium text-gray-700">
                        Postcode <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cart-postcode"
                        value={address.postal_code}
                        onChange={(e) => setAddress((p) => ({ ...p, postal_code: e.target.value }))}
                        placeholder="3000"
                        className="mt-1 rounded-md"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cart-country" className="text-sm font-medium text-gray-700">
                        Country
                      </Label>
                      <Input id="cart-country" value="Australia" disabled className="mt-1 rounded-md bg-gray-50" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 border-t border-gray-100 p-4">
                <Button
                  onClick={handleAddressContinue}
                  disabled={!isAddressComplete || uberEligibility.checking}
                  className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium cursor-pointer disabled:cursor-not-allowed"
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
            </>
          ) : (
            <>
              {/* Delivery method */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {deliveryOptions.map((option) => {
                  const isUber = option.id === "uber_express";
                  const isDisabled =
                    isUber &&
                    (!cartUberEligible || (!uberEligibility.eligible && !uberEligibility.checking));
                  const isAvailable = !isDisabled;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => isAvailable && setSelectedDelivery(option.id)}
                      disabled={isDisabled || uberEligibility.checking}
                      className={cn(
                        "w-full flex items-center gap-3 p-4 rounded-md border-2 transition-all text-left disabled:cursor-not-allowed",
                        isDisabled
                          ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
                        : selectedDelivery === option.id
                            ? "border-gray-900 bg-gray-50 cursor-pointer"
                            : "border-gray-200 hover:border-gray-300 bg-white cursor-pointer"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-md flex-shrink-0",
                          selectedDelivery === option.id && !isDisabled ? "bg-gray-900" : "bg-gray-100"
                        )}
                      >
                        {option.id === "pickup" ? (
                          <MapPin className={cn("h-5 w-5", selectedDelivery === option.id ? "text-white" : "text-gray-600")} />
                        ) : (
                          <Package className={cn("h-5 w-5", selectedDelivery === option.id && !isDisabled ? "text-white" : "text-gray-600")} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={cn("text-sm font-semibold", isDisabled ? "text-gray-400" : "text-gray-900")}>
                          {option.label}
                        </span>
                        <p className={cn("text-xs mt-0.5", isDisabled ? "text-gray-400" : "text-gray-500")}>
                          {isDisabled
                            ? cartUberEligible
                              ? "Only available within 10km of this store"
                              : "Every cart item must be Uber enabled"
                            : option.description}
                        </p>
                      </div>
                      <span className={cn("text-sm font-bold flex-shrink-0", isDisabled ? "text-gray-400" : "text-gray-900")}>
                        {option.cost === 0 ? "Free" : `$${option.cost}`}
                      </span>
                      {selectedDelivery === option.id && !isDisabled && (
                        <div className="w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}

                {!uberEligibility.eligible && (uberEligibility.distance !== null || uberEligibility.message) && !uberEligibility.checking && (
                  <div className="flex items-start gap-2 pt-1">
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {uberEligibility.message ||
                        `You're ${uberEligibility.distance}km from this store. Uber Express is only available within 10km.`}{" "}
                      Australia Post is available Australia-wide.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer: breakdown + pay */}
              <div className="flex-shrink-0 border-t border-gray-100 p-4 space-y-3">
                <div className="space-y-1.5 pb-3 border-b border-gray-100">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="text-gray-900">{fmt(activeSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Delivery</span>
                    <span className="text-gray-900">{deliveryCost === 0 ? "Free" : `$${deliveryCost}`}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Service fee</span>
                    <span className="text-gray-900">{fmt(buyerFee)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5">
                    <span className="text-sm font-semibold text-gray-900">Total</span>
                    <span className="text-lg font-bold text-gray-900">{fmt(total)}</span>
                  </div>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <Button
                  onClick={handleCheckout}
                  disabled={isRedirecting || uberEligibility.checking}
                  className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium cursor-pointer disabled:cursor-not-allowed"
                >
                  {isRedirecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Redirecting to checkout...
                    </>
                  ) : (
                    <>Continue to Payment</>
                  )}
                </Button>
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-[10px] text-gray-400">Secured by</span>
                  <Image src="/stripe.svg" alt="Stripe" width={36} height={15} className="opacity-50" />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

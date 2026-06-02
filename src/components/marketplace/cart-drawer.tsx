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
  CheckoutProvider,
  ExpressCheckoutElement,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";
import type {
  StripeExpressCheckoutElementConfirmEvent,
  StripeExpressCheckoutElementReadyEvent,
} from "@stripe/stripe-js";
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
import { getStripeClient } from "@/lib/stripe";

type DeliveryMethod = "uber_express" | "auspost" | "pickup";

const UBER_EXPRESS_FEE = 15;
const AUSPOST_FEE = 12;
const BUYER_FEE_RATE = 0.005;
const GOOGLE_MAPS_LIBRARIES: "places"[] = ["places"];
const stripeClientPromise = getStripeClient();
const EXPRESS_CHECKOUT_OPTIONS = {
  buttonHeight: 48,
  buttonTheme: undefined,
  buttonType: {
    applePay: "check-out",
    googlePay: "checkout",
    paypal: "buynow",
  },
  layout: {
    maxColumns: 1,
    maxRows: 1,
    overflow: "never",
  },
  paymentMethodOrder: undefined,
  paymentMethods: undefined,
} satisfies React.ComponentProps<typeof ExpressCheckoutElement>["options"];

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
  value: "long_name" | "short_name" = "long_name",
) {
  return (
    components.find((component) => component.types.includes(type))?.[value] ||
    ""
  );
}

function addressFromGooglePlace(
  place: google.maps.places.PlaceResult,
): AddressData | null {
  const components = place.address_components;
  if (!components?.length) return null;

  const streetNumber = getAddressPart(
    components,
    "street_number",
    "short_name",
  );
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
  const state = getAddressPart(
    components,
    "administrative_area_level_1",
    "short_name",
  );
  const postalCode = getAddressPart(components, "postal_code", "short_name");
  const postalCodeSuffix = getAddressPart(
    components,
    "postal_code_suffix",
    "short_name",
  );
  const country = getAddressPart(components, "country", "short_name") || "AU";

  return {
    line1,
    line2: subpremise ? `Unit ${subpremise}` : "",
    city,
    state,
    postal_code: postalCodeSuffix
      ? `${postalCode}-${postalCodeSuffix}`
      : postalCode,
    country,
  };
}

function addressFromSavedShippingAddress(
  saved: SavedShippingAddress | null | undefined,
): AddressData {
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

function isCompleteAddress(address: AddressData): boolean {
  return (
    address.line1.trim() !== "" &&
    address.city.trim() !== "" &&
    address.state.trim() !== "" &&
    address.postal_code.trim() !== ""
  );
}

type CartStep = "cart" | "address" | "delivery";

interface CartCheckoutLine {
  productId: string;
  quantity: number;
}

function hasExpressPaymentMethods(
  methods: StripeExpressCheckoutElementReadyEvent["availablePaymentMethods"],
) {
  return Boolean(methods && Object.values(methods).some(Boolean));
}

function CartExpressCheckout({
  items,
  onComplete,
  onError,
  onUnavailable,
}: {
  items: CartCheckoutLine[];
  onComplete: (sessionId: string) => void;
  onError: (message: string) => void;
  onUnavailable: (data: { unavailable?: unknown }) => void;
}) {
  const fetchClientSecret = React.useCallback(async () => {
    const res = await fetch("/api/stripe/create-cart-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutMode: "express",
        deliveryMethod: "auspost",
        items,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (Array.isArray(data.unavailable)) {
        onUnavailable(data);
      }
      throw new Error(data.error || "Express checkout is unavailable");
    }

    if (typeof data.clientSecret !== "string" || data.clientSecret === "") {
      throw new Error("Express checkout is unavailable");
    }

    return data.clientSecret;
  }, [items, onUnavailable]);

  const clientSecret = React.useMemo(
    () => fetchClientSecret(),
    [fetchClientSecret],
  );
  const checkoutOptions = React.useMemo(
    () => ({
      clientSecret,
      elementsOptions: {
        appearance: {
          variables: {
            borderRadius: "6px",
            fontFamily:
              'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          },
        },
      },
    }),
    [clientSecret],
  );

  return (
    <CheckoutProvider stripe={stripeClientPromise} options={checkoutOptions}>
      <CartExpressCheckoutButton onComplete={onComplete} onError={onError} />
    </CheckoutProvider>
  );
}

function CartExpressCheckoutButton({
  onComplete,
  onError,
}: {
  onComplete: (sessionId: string) => void;
  onError: (message: string) => void;
}) {
  const checkoutState = useCheckout();
  const [availability, setAvailability] = React.useState<
    "loading" | "available" | "unavailable"
  >("loading");
  const [isConfirming, setIsConfirming] = React.useState(false);

  React.useEffect(() => {
    if (checkoutState.type === "error") {
      onError(checkoutState.error.message || "Express checkout is unavailable");
    }
  }, [checkoutState, onError]);

  if (checkoutState.type === "error") return null;

  if (checkoutState.type === "loading") {
    return (
      <div
        className="h-12 w-full animate-pulse rounded-md bg-gray-100"
        aria-hidden="true"
      />
    );
  }

  const handleConfirm = async (
    event: StripeExpressCheckoutElementConfirmEvent,
  ) => {
    setIsConfirming(true);
    try {
      const result = await checkoutState.checkout.confirm({
        expressCheckoutConfirmEvent: event,
      });

      if (result.type === "error") {
        event.paymentFailed({
          reason: "fail",
          message: result.error.message,
        });
        onError(result.error.message || "Payment could not be confirmed");
        setIsConfirming(false);
        return;
      }

      onComplete(result.session.id);
    } catch (err) {
      event.paymentFailed({
        reason: "fail",
        message:
          err instanceof Error ? err.message : "Payment could not be confirmed",
      });
      onError(
        err instanceof Error ? err.message : "Payment could not be confirmed",
      );
      setIsConfirming(false);
    }
  };

  return (
    <div
      className={cn(
        "transition-opacity",
        availability === "unavailable" && "hidden",
        isConfirming && "pointer-events-none opacity-60",
      )}
    >
      <ExpressCheckoutElement
        options={EXPRESS_CHECKOUT_OPTIONS}
        onReady={(event) =>
          setAvailability(
            hasExpressPaymentMethods(event.availablePaymentMethods)
              ? "available"
              : "unavailable",
          )
        }
        onLoadError={(event) =>
          onError(event.error.message || "Express checkout is unavailable")
        }
        onConfirm={handleConfirm}
      />
    </div>
  );
}

// ============================================================
// Cross-seller replace confirmation (driven by CartProvider state)
// ============================================================

function CartReplaceDialog() {
  const {
    pendingReplacement,
    sellerName,
    confirmReplacement,
    cancelReplacement,
  } = useCart();
  const open = !!pendingReplacement;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && cancelReplacement()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start a new cart?</AlertDialogTitle>
          <AlertDialogDescription>
            Your cart has items from {sellerName || "another seller"}. A cart
            can only contain items from one seller, so adding{" "}
            <span className="font-medium text-gray-900">
              {pendingReplacement?.name}
            </span>{" "}
            will replace what&apos;s currently in your cart.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="cursor-pointer"
            onClick={cancelReplacement}
          >
            Keep current cart
          </AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer"
            onClick={confirmReplacement}
          >
            Replace cart
          </AlertDialogAction>
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
    [profile?.shipping_address],
  );

  // The drawer serves two modes off the same UI: the real (persisted) cart, and
  // a transient single-item "Buy Now". `active*` is whichever set is showing.
  // The header badge stays bound to the real cart via the provider's `count`.
  const isBuyNow = cart.isBuyNow;
  const activeItems =
    isBuyNow && cart.buyNowItem ? [cart.buyNowItem] : cart.items;
  const expressCheckoutItems = React.useMemo(
    () =>
      (isBuyNow && cart.buyNowItem ? [cart.buyNowItem] : cart.items).map(
        (item) => ({
          productId: item.productId,
          quantity: item.quantity,
        }),
      ),
    [cart.buyNowItem, cart.items, isBuyNow],
  );
  const expressCheckoutKey = React.useMemo(
    () =>
      expressCheckoutItems
        .map((item) => `${item.productId}:${item.quantity}`)
        .join("|"),
    [expressCheckoutItems],
  );
  const activeCount = activeItems.length; // distinct lines — drives the empty-state check
  const activeUnits = activeItems.reduce((sum, i) => sum + i.quantity, 0); // total units
  const activeSubtotal = activeItems.reduce(
    (sum, i) => sum + (Number(i.price) || 0) * i.quantity,
    0,
  );
  const activeSellerName = activeItems[0]?.sellerName ?? null;
  const activeSellerId = activeItems[0]?.sellerId ?? null;
  const cartUberEligible =
    activeItems.length > 0 &&
    activeItems.every((item) => item.uberDeliveryEligible === true);

  const [step, setStep] = React.useState<CartStep>("cart");
  const [selectedDelivery, setSelectedDelivery] =
    React.useState<DeliveryMethod>("auspost");
  const [address, setAddress] = React.useState<AddressData>(() => savedAddress);
  const [uberEligibility, setUberEligibility] = React.useState<UberEligibility>(
    {
      eligible: false,
      distance: null,
      message: undefined,
      checking: false,
    },
  );
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isMobileSheet, setIsMobileSheet] = React.useState(false);
  const addressInputRef = React.useRef<HTMLInputElement | null>(null);
  const autocompleteRef = React.useRef<google.maps.places.Autocomplete | null>(
    null,
  );
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded: isGoogleMapsLoaded, loadError: googleMapsLoadError } =
    useJsApiLoader({
      googleMapsApiKey,
      libraries: GOOGLE_MAPS_LIBRARIES,
    });
  const canUseGoogleAddressAutocomplete = Boolean(
    googleMapsApiKey && isGoogleMapsLoaded && !googleMapsLoadError,
  );

  React.useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 639px)");
    const updateMobileSheet = () => setIsMobileSheet(mobileQuery.matches);

    updateMobileSheet();
    mobileQuery.addEventListener("change", updateMobileSheet);
    return () => mobileQuery.removeEventListener("change", updateMobileSheet);
  }, []);

  // Reset the flow whenever the drawer closes.
  React.useEffect(() => {
    if (!cart.isOpen) {
      setStep("cart");
      setSelectedDelivery("auspost");
      setAddress(savedAddress);
      setUberEligibility({
        eligible: false,
        distance: null,
        message: undefined,
        checking: false,
      });
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
    setUberEligibility({
      eligible: false,
      distance: null,
      message: undefined,
      checking: false,
    });
    setError(null);
    setIsRedirecting(false);
    setStep("delivery");
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

  const isAddressComplete = isCompleteAddress(address);
  const hasUberResult =
    uberEligibility.distance !== null || Boolean(uberEligibility.message);
  const checkoutRequiresUberAddress =
    selectedDelivery === "uber_express" &&
    (!isAddressComplete || !uberEligibility.eligible);
  const isCheckoutDisabled =
    isRedirecting || uberEligibility.checking || checkoutRequiresUberAddress;

  const resetUberAvailability = React.useCallback(() => {
    setUberEligibility({
      eligible: false,
      distance: null,
      message: undefined,
      checking: false,
    });
    setSelectedDelivery((current) =>
      current === "uber_express" ? "auspost" : current,
    );
  }, []);

  const updateAddress = React.useCallback(
    (patch: Partial<AddressData>) => {
      setAddress((previous) => ({ ...previous, ...patch }));
      resetUberAvailability();
    },
    [resetUberAvailability],
  );

  const reconcileUnavailableItems = React.useCallback(
    (data: { unavailable?: unknown }) => {
      if (!Array.isArray(data.unavailable) || data.unavailable.length === 0) {
        return;
      }

      for (const unavailableItem of data.unavailable) {
        const unavailableRecord =
          typeof unavailableItem === "object" && unavailableItem !== null
            ? (unavailableItem as { id?: unknown; available?: unknown })
            : null;
        const id =
          typeof unavailableItem === "string"
            ? unavailableItem
            : unavailableRecord?.id;
        if (!id || typeof id !== "string") continue;

        const available = unavailableRecord
          ? Number(unavailableRecord.available)
          : 0;
        if (Number.isFinite(available) && available >= 1) {
          cart.setQuantity(id, available);
        } else if (isBuyNow) {
          cart.exitBuyNow();
        } else {
          cart.removeItem(id);
        }
      }
    },
    [cart, isBuyNow],
  );

  const checkUberEligibility = async (addressOverride?: AddressData) => {
    const addressToCheck = addressOverride ?? address;
    if (!isCompleteAddress(addressToCheck)) return;

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
          address: addressToCheck,
          sellerId: activeSellerId,
          productIds: activeItems.map((item) => item.productId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
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
      if (data.eligible) setSelectedDelivery("uber_express");
    } catch {
      setUberEligibility({
        eligible: true,
        distance: null,
        message: "Could not verify distance",
        checking: false,
      });
    }
  };

  const handleProceed = () => {
    setError(null);
    if (!user) {
      openAuthModal();
      return;
    }
    setStep("delivery");
    if (cartUberEligible && isCompleteAddress(savedAddress)) {
      void checkUberEligibility(savedAddress);
    }
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

    updateAddress({
      ...parsedAddress,
      line2: parsedAddress.line2 || "",
    });
  }, [updateAddress]);

  React.useEffect(() => {
    if (
      step !== "address" ||
      !canUseGoogleAddressAutocomplete ||
      !addressInputRef.current
    )
      return;

    const autocomplete = new google.maps.places.Autocomplete(
      addressInputRef.current,
      {
        componentRestrictions: { country: "au" },
        fields: ["address_components", "formatted_address", "name"],
        types: ["address"],
      },
    );
    autocompleteRef.current = autocomplete;

    const listener = autocomplete.addListener(
      "place_changed",
      handleGooglePlaceChanged,
    );

    return () => {
      google.maps.event.removeListener(listener);
      if (autocompleteRef.current === autocomplete) {
        autocompleteRef.current = null;
      }
    };
  }, [canUseGoogleAddressAutocomplete, handleGooglePlaceChanged, step]);

  const keepGooglePlacesDropdownInteractive = React.useCallback(
    (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".pac-container")) {
        event.preventDefault();
      }
    },
    [],
  );

  const handleCheckout = async () => {
    setIsRedirecting(true);
    setError(null);
    try {
      if (checkoutRequiresUberAddress) {
        setStep("address");
        throw new Error(
          "Enter your address to check Uber Express before payment",
        );
      }

      const res = await fetch("/api/stripe/create-cart-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: activeItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          deliveryMethod: selectedDelivery,
          shippingAddress:
            selectedDelivery !== "pickup" && isAddressComplete
              ? address
              : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        reconcileUnavailableItems(data);
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

  const handleExpressCheckoutComplete = React.useCallback(
    (sessionId: string) => {
      window.location.href = `/marketplace/checkout/success?session_id=${encodeURIComponent(
        sessionId,
      )}&cart=1`;
    },
    [],
  );

  const deliveryOptions: {
    id: DeliveryMethod;
    label: string;
    description: string;
    cost: number;
  }[] = [
    {
      id: "uber_express",
      label: "Uber Express",
      description: "Get it in 1 hour",
      cost: UBER_EXPRESS_FEE,
    },
    {
      id: "auspost",
      label: "Australia Post",
      description: "2-5 business days",
      cost: AUSPOST_FEE,
    },
    {
      id: "pickup",
      label: "Local Pickup",
      description: "Arrange collection with the seller",
      cost: 0,
    },
  ];
  const sheetSide = isMobileSheet ? "bottom" : "right";

  return (
    <>
      <CartReplaceDialog />

      <Sheet open={cart.isOpen} onOpenChange={(o) => !o && cart.closeCart()}>
        <SheetContent
          side={sheetSide}
          showCloseButton={false}
          onInteractOutside={keepGooglePlacesDropdownInteractive}
          onPointerDownOutside={keepGooglePlacesDropdownInteractive}
          className="w-full sm:max-w-md p-0 flex flex-col gap-0 data-[side=bottom]:max-h-[92dvh] data-[side=bottom]:rounded-t-2xl data-[side=bottom]:pb-[env(safe-area-inset-bottom)]"
        >
          <SheetTitle className="sr-only">Shopping cart</SheetTitle>

          {/* Header */}
          <div className="flex-shrink-0 border-b border-gray-100">
            <div className="flex justify-center pt-2 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center justify-between px-4 h-14">
              <div className="flex items-center gap-2.5">
                {step !== "cart" && (
                  <button
                    type="button"
                    onClick={() =>
                      setStep(step === "address" ? "delivery" : "cart")
                    }
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
                  {step !== "cart" && (
                    <p className="text-xs text-gray-500">
                      {step === "address"
                        ? "Uber Express availability"
                        : "Address collected securely at payment"}
                    </p>
                  )}
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
              <p className="text-sm font-medium text-gray-900">
                Your cart is empty
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-[15rem]">
                Add items from a seller to check out together.
              </p>
              {error && (
                <p className="mt-3 text-xs text-red-500 max-w-[15rem]">
                  {error}
                </p>
              )}
              <Button
                variant="outline"
                className="mt-5 rounded-md cursor-pointer"
                onClick={cart.closeCart}
              >
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
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-5 w-5 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">
                        {item.name}
                      </p>
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
                            onClick={() =>
                              cart.setQuantity(
                                item.productId,
                                item.quantity - 1,
                              )
                            }
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
                            onClick={() =>
                              cart.setQuantity(
                                item.productId,
                                item.quantity + 1,
                              )
                            }
                            disabled={item.quantity >= item.maxQuantity}
                            className="flex h-7 w-7 items-center justify-center rounded-r-md text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {item.maxQuantity > 1 &&
                        item.quantity >= item.maxQuantity && (
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
                  <span className="text-gray-600">
                    Subtotal ({activeUnits}{" "}
                    {activeUnits === 1 ? "item" : "items"})
                  </span>
                  <span className="font-semibold text-gray-900">
                    {fmt(activeSubtotal)}
                  </span>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                {user && expressCheckoutItems.length > 0 && (
                  <CartExpressCheckout
                    key={expressCheckoutKey}
                    items={expressCheckoutItems}
                    onComplete={handleExpressCheckoutComplete}
                    onError={setError}
                    onUnavailable={reconcileUnavailableItems}
                  />
                )}
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
                  Enter your delivery address to check Uber Express.
                </p>
                <div className="space-y-3">
                  <div>
                    <Label
                      htmlFor="cart-line1"
                      className="text-sm font-medium text-gray-700"
                    >
                      Street Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      ref={addressInputRef}
                      id="cart-line1"
                      value={address.line1}
                      onChange={(e) => updateAddress({ line1: e.target.value })}
                      placeholder={
                        canUseGoogleAddressAutocomplete
                          ? "Start typing your address"
                          : "123 Example Street"
                      }
                      className="mt-1 rounded-md"
                      autoComplete="street-address"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="cart-line2"
                      className="text-sm font-medium text-gray-700"
                    >
                      Apartment, suite, etc. (optional)
                    </Label>
                    <Input
                      id="cart-line2"
                      value={address.line2}
                      onChange={(e) => updateAddress({ line2: e.target.value })}
                      placeholder="Apt 4B"
                      className="mt-1 rounded-md"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label
                        htmlFor="cart-city"
                        className="text-sm font-medium text-gray-700"
                      >
                        City <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cart-city"
                        value={address.city}
                        onChange={(e) =>
                          updateAddress({ city: e.target.value })
                        }
                        placeholder="Melbourne"
                        className="mt-1 rounded-md"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="cart-state"
                        className="text-sm font-medium text-gray-700"
                      >
                        State <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cart-state"
                        value={address.state}
                        onChange={(e) =>
                          updateAddress({ state: e.target.value })
                        }
                        placeholder="VIC"
                        className="mt-1 rounded-md"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label
                        htmlFor="cart-postcode"
                        className="text-sm font-medium text-gray-700"
                      >
                        Postcode <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cart-postcode"
                        value={address.postal_code}
                        onChange={(e) =>
                          updateAddress({ postal_code: e.target.value })
                        }
                        placeholder="3000"
                        className="mt-1 rounded-md"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="cart-country"
                        className="text-sm font-medium text-gray-700"
                      >
                        Country
                      </Label>
                      <Input
                        id="cart-country"
                        value="Australia"
                        disabled
                        className="mt-1 rounded-md bg-gray-50"
                      />
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
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {isAddressComplete && (
                  <div className="flex items-center gap-3 rounded-md bg-gray-50 p-3">
                    <MapPin className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-900">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ""}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {address.city}, {address.state} {address.postal_code}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep("address")}
                      className="text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      Change
                    </button>
                  </div>
                )}
                {deliveryOptions.map((option) => {
                  const isUber = option.id === "uber_express";
                  const needsAddressForUber =
                    isUber && cartUberEligible && !isAddressComplete;
                  const needsUberCheck =
                    isUber &&
                    cartUberEligible &&
                    isAddressComplete &&
                    !uberEligibility.eligible &&
                    !hasUberResult &&
                    !uberEligibility.checking;
                  const isDisabled =
                    isUber &&
                    (!cartUberEligible ||
                      uberEligibility.checking ||
                      (!uberEligibility.eligible && hasUberResult));
                  const isAvailable =
                    !isDisabled && !needsAddressForUber && !needsUberCheck;
                  const isSelected =
                    selectedDelivery === option.id && isAvailable;
                  const optionDescription = isUber
                    ? !cartUberEligible
                      ? "Every cart item must be Uber enabled"
                      : needsAddressForUber
                        ? "Add address to check 1-hour delivery"
                        : needsUberCheck
                          ? "Check 1-hour availability"
                          : isDisabled
                            ? "Only available within 10km of this store"
                            : option.description
                    : option.description;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        if (needsAddressForUber) {
                          setStep("address");
                          return;
                        }
                        if (needsUberCheck) {
                          void checkUberEligibility();
                          return;
                        }
                        if (isAvailable) setSelectedDelivery(option.id);
                      }}
                      disabled={isDisabled || uberEligibility.checking}
                      className={cn(
                        "w-full flex items-center gap-3 p-4 rounded-md border-2 transition-all text-left disabled:cursor-not-allowed",
                        isDisabled
                          ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
                          : isSelected
                            ? "border-gray-900 bg-gray-50 cursor-pointer"
                            : "border-gray-200 hover:border-gray-300 bg-white cursor-pointer",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-md flex-shrink-0",
                          isSelected ? "bg-gray-900" : "bg-gray-100",
                        )}
                      >
                        {option.id === "pickup" ? (
                          <MapPin
                            className={cn(
                              "h-5 w-5",
                              isSelected ? "text-white" : "text-gray-600",
                            )}
                          />
                        ) : (
                          <Package
                            className={cn(
                              "h-5 w-5",
                              isSelected ? "text-white" : "text-gray-600",
                            )}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            isDisabled ? "text-gray-400" : "text-gray-900",
                          )}
                        >
                          {option.label}
                        </span>
                        <p
                          className={cn(
                            "text-xs mt-0.5",
                            isDisabled ? "text-gray-400" : "text-gray-500",
                          )}
                        >
                          {optionDescription}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-bold flex-shrink-0",
                          isDisabled ? "text-gray-400" : "text-gray-900",
                        )}
                      >
                        {option.cost === 0 ? "Free" : `$${option.cost}`}
                      </span>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}

                {!uberEligibility.eligible &&
                  (uberEligibility.distance !== null ||
                    uberEligibility.message) &&
                  !uberEligibility.checking && (
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
                    <span className="text-gray-900">
                      {deliveryCost === 0 ? "Free" : `$${deliveryCost}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Service fee</span>
                    <span className="text-gray-900">{fmt(buyerFee)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5">
                    <span className="text-sm font-semibold text-gray-900">
                      Total
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {fmt(total)}
                    </span>
                  </div>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <Button
                  onClick={handleCheckout}
                  disabled={isCheckoutDisabled}
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
                  <Image
                    src="/stripe.svg"
                    alt="Stripe"
                    width={36}
                    height={15}
                    className="opacity-50"
                  />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

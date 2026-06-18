"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Loader2,
  ArrowRight,
  Store,
  Copy,
  Check,
  Mail,
  Truck,
  BadgeCheck,
} from '@/components/layout/app-sidebar/dashboard-icons';
import { Button } from "@/components/ui/button";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { useCart } from "@/components/providers/cart-provider";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ============================================================
// Confetti Animation Component
// ============================================================

function seededRandom(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function Confetti() {
  const confettiPieces = React.useMemo(() => {
    const pieces = [];
    // Brand-forward palette: Yellow Jersey gold with warm + neutral accents.
    const colors = ['#FACC15', '#FDE047', '#F59E0B', '#FEF08A', '#1F2937'];

    for (let i = 0; i < 56; i++) {
      const random = (salt: number) => seededRandom(i * 97 + salt);

      pieces.push({
        id: i,
        x: random(1) * 100,
        delay: random(2) * 0.4,
        duration: 2.6 + random(3) * 2.2,
        color: colors[Math.floor(random(4) * colors.length)],
        size: 5 + random(5) * 7,
        rotation: random(6) * 360,
        drift: (random(7) - 0.5) * 20,
        round: random(8) > 0.6,
      });
    }
    return pieces;
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {confettiPieces.map((piece) => (
        <motion.div
          key={piece.id}
          initial={{
            x: `${piece.x}vw`,
            y: -24,
            rotate: 0,
            opacity: 0.9,
          }}
          animate={{
            x: `${piece.x + piece.drift}vw`,
            y: '110vh',
            rotate: piece.rotation + 720,
            opacity: [0.9, 0.8, 0],
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          style={{
            position: 'absolute',
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 0.5,
            backgroundColor: piece.color,
            borderRadius: piece.round ? '50%' : 2,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Animated Success Mark
// ============================================================

function SuccessMark() {
  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Pulsing halo */}
      <motion.span
        initial={{ scale: 0.6, opacity: 0.6 }}
        animate={{ scale: 1.7, opacity: 0 }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        className="absolute h-20 w-20 rounded-full bg-primary/40"
      />
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.05 }}
        className="relative h-20 w-20 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center"
      >
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-9 w-9 text-primary-foreground"
        >
          <motion.path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.35, duration: 0.4, ease: "easeOut" }}
          />
        </motion.svg>
      </motion.div>
    </div>
  );
}

// ============================================================
// Timeline Step Component
// ============================================================

interface TimelineStepProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  isComplete?: boolean;
  isActive?: boolean;
  delay: number;
  isLast?: boolean;
}

function TimelineStep({ icon, title, description, isComplete, isActive, delay, isLast }: TimelineStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="flex items-start gap-3.5"
    >
      <div className="flex flex-col items-center">
        <div className={cn(
          "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center",
          isComplete
            ? "bg-primary text-primary-foreground"
            : isActive
              ? "bg-primary/10 text-amber-700 ring-2 ring-primary/30"
              : "bg-gray-100 text-gray-400"
        )}>
          {isComplete ? <Check className="h-4 w-4" /> : icon}
        </div>
        {!isLast && (
          <div className={cn(
            "w-px h-9 mt-1.5",
            isComplete ? "bg-primary/40" : "bg-gray-200"
          )} />
        )}
      </div>
      <div className="flex-1 pb-7">
        <p className={cn(
          "text-sm font-medium",
          isComplete || isActive ? "text-gray-900" : "text-gray-500"
        )}>
          {title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

// ============================================================
// Purchase Details Interface
// ============================================================

interface ProductDetails {
  id: string;
  description: string;
  display_name: string | null;
  primary_image_url: string | null;
}

interface SellerDetails {
  name: string;
  business_name: string | null;
}

interface PurchaseDetails {
  id: string;
  order_number: string;
  total_amount: number;
  item_price: number;
  /** Units purchased on this row. Optional — absent if read before the migration. */
  quantity?: number;
  shipping_cost: number;
  product: ProductDetails | ProductDetails[] | null;
  seller: SellerDetails | SellerDetails[] | null;
}

// Helper to extract first item from array or return object
function extractFirst<T>(data: T | T[] | null | undefined): T | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

// ============================================================
// Loading Fallback
// ============================================================

function CheckoutSuccessLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          className="mb-8"
        >
          <Loader2 className="h-8 w-8 text-primary" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-base text-gray-900 font-medium"
        >
          Confirming your purchase
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm text-gray-500 mt-1.5"
        >
          This will only take a moment...
        </motion.p>
      </motion.div>
    </div>
  );
}

// ============================================================
// Main Content Component (uses useSearchParams)
// ============================================================

function CheckoutSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { clear: clearCart } = useCart();
  const { refreshProfile } = useUserProfile();

  // Support both session_id (Stripe Checkout) and payment_intent (Embedded Checkout)
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent");
  const phoneFromUrl = searchParams.get("phone"); // Phone passed from checkout
  const isCart = searchParams.get("cart") === "1"; // Multi-item cart order

  const [loading, setLoading] = React.useState(true);
  const [purchase, setPurchase] = React.useState<PurchaseDetails | null>(null);
  const [purchases, setPurchases] = React.useState<PurchaseDetails[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [showConfetti, setShowConfetti] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const cartCleared = React.useRef(false);

  // Track if SMS has been sent to avoid duplicates
  const [smsSent, setSmsSent] = React.useState(false);

  // Send SMS for Uber Express orders (works with both paymentIntent and sessionId)
  React.useEffect(() => {
    if ((paymentIntentId || sessionId) && !smsSent) {
      const sendOrderSms = async () => {
        try {
          await fetch('/api/sms/order-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentIntentId,
              sessionId,
              phone: phoneFromUrl, // Pass phone from URL as backup
            }),
          });
          setSmsSent(true);
        } catch (err) {
          console.error('[Success] Failed to send SMS:', err);
        }
      };
      sendOrderSms();
    }
  }, [paymentIntentId, sessionId, phoneFromUrl, smsSent]);

  // Clear the cart once we reach the success page (payment already succeeded)
  React.useEffect(() => {
    if (isCart && !cartCleared.current) {
      cartCleared.current = true;
      clearCart();
    }
  }, [isCart, clearCart]);

  React.useEffect(() => {
    // Cart order — fetch all purchase rows for the session
    if (isCart && sessionId) {
      const fetchCartPurchases = async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const response = await fetch(`/api/stripe/session/${sessionId}?multi=1`);
          if (response.ok) {
            const data = await response.json();
            setPurchases(Array.isArray(data.purchases) ? data.purchases : []);
            await refreshProfile();
          }
        } catch (err) {
          console.error("Error fetching cart purchases:", err);
        } finally {
          setLoading(false);
          setShowConfetti(true);
        }
      };
      fetchCartPurchases();
      return;
    }

    // If we have a payment_intent, fetch purchase by payment intent
    if (paymentIntentId) {
      const fetchPurchaseByPaymentIntent = async () => {
        try {
          // Give webhook time to process
          await new Promise(resolve => setTimeout(resolve, 2000));

          const response = await fetch(`/api/stripe/session/${paymentIntentId}?type=payment_intent`);

          if (response.ok) {
            const data = await response.json();
            setPurchase(data.purchase);
            await refreshProfile();
          }
        } catch (err) {
          console.error("Error fetching purchase:", err);
        } finally {
          setLoading(false);
          setShowConfetti(true);
        }
      };

      fetchPurchaseByPaymentIntent();
      return;
    }

    // Legacy: session_id from Stripe Checkout
    if (!sessionId) {
      setError("No session ID provided");
      setLoading(false);
      return;
    }

    const fetchPurchase = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1500));

        const response = await fetch(`/api/stripe/session/${sessionId}`);

        if (response.ok) {
          const data = await response.json();
          setPurchase(data.purchase);
          await refreshProfile();
        }
      } catch (err) {
        console.error("Error fetching purchase:", err);
      } finally {
        setLoading(false);
        setShowConfetti(true);
      }
    };

    fetchPurchase();
  }, [sessionId, paymentIntentId, isCart, refreshProfile]);

  // Extract product and seller (handle both array and object from Supabase)
  const product = extractFirst(purchase?.product);
  const seller = extractFirst(purchase?.seller);

  const productName = product?.display_name || product?.description || "Your item";
  const productImage = product?.primary_image_url;
  const sellerName = seller?.business_name || seller?.name || "Seller";

  // Cart (multi-item) derived values
  const cartItems = purchases.map((p) => {
    const prod = extractFirst(p.product);
    return {
      id: p.id,
      name: prod?.display_name || prod?.description || "Item",
      image: prod?.primary_image_url || null,
      price: p.item_price,
      quantity: p.quantity ?? 1,
    };
  });
  // Total units across the order (sum of quantities), vs cartItems.length = lines.
  const cartUnits = cartItems.reduce((sum, it) => sum + it.quantity, 0);
  const cartItemsSubtotal = purchases.reduce(
    (sum, p) => sum + (p.item_price || 0) * (p.quantity ?? 1),
    0
  );
  const cartShipping = purchases.reduce((sum, p) => sum + (p.shipping_cost || 0), 0);
  const cartTotal = purchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);
  // Cart rows share an order reference with a per-item "-N" suffix; strip it.
  const cartOrderNumber = purchases[0]?.order_number?.replace(/-\d+$/, "") || "";

  const displayOrderNumber = isCart ? cartOrderNumber : purchase?.order_number;
  const hasOrder = isCart ? purchases.length > 0 : !!purchase;
  const totalPaid = isCart ? cartTotal : purchase?.total_amount ?? 0;

  const copyOrderNumber = () => {
    if (displayOrderNumber) {
      navigator.clipboard.writeText(displayOrderNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return <CheckoutSuccessLoading />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-sm shadow-sm">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Package className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-gray-600 mb-5">{error}</p>
          <Button onClick={() => router.push("/marketplace")} className="rounded-xl">
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-50">
      {/* Soft brand glow behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent"
      />

      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && <Confetti />}
      </AnimatePresence>

      <div className="relative max-w-lg mx-auto px-4 pt-24 sm:pt-28 pb-40 sm:pb-16">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="mb-6 flex justify-center">
            <SuccessMark />
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mb-2"
          >
            It&apos;s yours!
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-gray-500 text-sm sm:text-base"
          >
            Order confirmed — we&apos;ve let {sellerName} know
          </motion.p>

          {totalPaid > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-5 inline-flex items-baseline gap-2 rounded-full bg-white px-5 py-2 border border-gray-200 shadow-sm"
            >
              <span className="text-xs font-medium text-gray-500">Total paid</span>
              <span className="text-lg font-semibold text-gray-900">
                ${totalPaid.toFixed(2)}
              </span>
            </motion.div>
          )}
        </motion.div>

        {/* Order card: items + breakdown + order number */}
        {hasOrder && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4"
          >
            {/* Card header — order number + copy */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50/80 border-b border-gray-100">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Order</p>
                <p className="text-sm font-mono font-semibold text-gray-900 truncate">
                  {displayOrderNumber}
                </p>
              </div>
              <button
                onClick={copyOrderNumber}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-amber-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Items */}
            {isCart ? (
              <>
                <div className="flex items-center justify-between px-5 pt-4 pb-1">
                  <h2 className="text-sm font-medium text-gray-900">
                    {cartUnits} {cartUnits === 1 ? "item" : "items"}
                  </h2>
                  <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                    <Store className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[160px]">{sellerName}</span>
                  </div>
                </div>
                <ul className="divide-y divide-gray-100 px-2">
                  {cartItems.map((it) => (
                    <li key={it.id} className="flex items-center gap-3 px-3 py-3">
                      <div className="relative h-14 w-14 flex-shrink-0 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
                        {it.image ? (
                          <Image src={it.image} alt={it.name} fill className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-5 w-5 text-gray-300" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 line-clamp-2">{it.name}</p>
                        {it.quantity > 1 && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            {it.quantity} × ${it.price.toFixed(2)}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        ${(it.price * it.quantity).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              purchase && (
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="relative h-20 w-20 flex-shrink-0 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
                    {productImage ? (
                      <Image
                        src={productImage}
                        alt={productName}
                        fill
                        className="object-cover"
                        priority
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 line-clamp-2 leading-snug">
                      {productName}
                    </h2>
                    <div className="mt-1 flex items-center gap-1.5 text-gray-500 text-sm">
                      <Store className="h-3.5 w-3.5" />
                      <span className="truncate">{sellerName}</span>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Price breakdown */}
            <div className="px-5 py-4 border-t border-gray-100 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">
                  {isCart ? `Items (${cartUnits})` : "Item price"}
                </span>
                <span className="text-gray-900">
                  ${(isCart ? cartItemsSubtotal : purchase?.item_price ?? 0).toFixed(2)}
                </span>
              </div>
              {(isCart ? cartShipping : purchase?.shipping_cost ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Shipping</span>
                  <span className="text-gray-900">
                    ${(isCart ? cartShipping : purchase?.shipping_cost ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2.5 border-t border-gray-100">
                <span className="text-sm font-medium text-gray-900">Total paid</span>
                <span className="text-base font-semibold text-gray-900">
                  ${totalPaid.toFixed(2)}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* What happens next */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6"
        >
          <h3 className="text-sm font-medium text-gray-900 mb-4">What happens next</h3>
          <div>
            <TimelineStep
              icon={<BadgeCheck className="h-4 w-4" />}
              title="Payment confirmed"
              description="Your payment was processed successfully"
              isComplete
              delay={0.5}
            />
            <TimelineStep
              icon={<Mail className="h-4 w-4" />}
              title="Seller notified"
              description="They've received your order details"
              isComplete
              delay={0.58}
            />
            <TimelineStep
              icon={<Truck className="h-4 w-4" />}
              title="Collection or shipping"
              description="The seller will be in touch to arrange delivery"
              isActive
              delay={0.66}
              isLast
            />
          </div>
        </motion.div>

        {/* Desktop / tablet actions (inline) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="hidden sm:flex flex-col gap-3"
        >
          <Button
            onClick={() => router.push("/settings/purchases")}
            className="w-full h-12 rounded-xl text-sm font-semibold"
          >
            View my purchases
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/marketplace")}
            className="w-full h-12 rounded-xl text-sm font-medium"
          >
            Continue browsing
          </Button>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
          className="mt-8 sm:mt-10 text-center space-y-4"
        >
          <p className="text-xs text-gray-400">
            A confirmation email has been sent to your email address
          </p>
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-gray-400">Secured by</span>
            <Image
              src="/stripe.svg"
              alt="Stripe"
              width={36}
              height={15}
              className="opacity-50"
            />
          </div>
        </motion.div>
      </div>

      {/* Mobile sticky action bar */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <Button
          onClick={() => router.push("/settings/purchases")}
          className="w-full h-12 rounded-xl text-sm font-semibold"
        >
          View my purchases
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
        <button
          onClick={() => router.push("/marketplace")}
          className="mt-2 w-full text-center text-sm font-medium text-gray-500 py-1.5"
        >
          Continue browsing
        </button>
      </motion.div>
    </div>
  );
}

// ============================================================
// Main Checkout Success Page (wrapped in Suspense)
// ============================================================

export default function CheckoutSuccessPage() {
  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />
      <Suspense fallback={<CheckoutSuccessLoading />}>
        <CheckoutSuccessContent />
      </Suspense>
    </>
  );
}

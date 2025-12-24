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
  Sparkles,
  Receipt
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ============================================================
// Confetti Animation Component
// ============================================================

function Confetti() {
  const confettiPieces = React.useMemo(() => {
    const pieces = [];
    const colors = ['#E5E7EB', '#D1D5DB', '#9CA3AF', '#6B7280', '#374151'];
    
    for (let i = 0; i < 40; i++) {
      pieces.push({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.3,
        duration: 3 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 6,
        rotation: Math.random() * 360,
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
            y: -20,
            rotate: 0,
            opacity: 0.8 
          }}
          animate={{ 
            y: '110vh',
            rotate: piece.rotation + 720,
            opacity: [0.8, 0.6, 0]
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: [0.25, 0.46, 0.45, 0.94]
          }}
          style={{
            position: 'absolute',
            width: piece.size,
            height: piece.size * 0.6,
            backgroundColor: piece.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Timeline Step Component
// ============================================================

interface TimelineStepProps {
  step: number;
  title: string;
  description: string;
  isComplete?: boolean;
  isActive?: boolean;
  delay: number;
  isLast?: boolean;
}

function TimelineStep({ step, title, description, isComplete, isActive, delay, isLast }: TimelineStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="flex items-start gap-3"
    >
      <div className="flex flex-col items-center">
        <div className={cn(
          "flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium",
          isComplete 
            ? "bg-gray-900 text-white" 
            : isActive 
              ? "bg-gray-200 text-gray-700 ring-2 ring-gray-300 ring-offset-2" 
              : "bg-gray-100 text-gray-400"
        )}>
          {isComplete ? <Check className="h-3.5 w-3.5" /> : step}
        </div>
        {!isLast && (
          <div className={cn(
            "w-px h-8 mt-1.5",
            isComplete ? "bg-gray-300" : "bg-gray-200"
          )} />
        )}
      </div>
      <div className="flex-1 pb-6">
        <p className={cn(
          "text-sm font-medium",
          isComplete || isActive ? "text-gray-900" : "text-gray-500"
        )}>
          {title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
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
          <Loader2 className="h-8 w-8 text-gray-400" />
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
  
  // Support both session_id (Stripe Checkout) and payment_intent (Embedded Checkout)
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent");
  const phoneFromUrl = searchParams.get("phone"); // Phone passed from checkout

  const [loading, setLoading] = React.useState(true);
  const [purchase, setPurchase] = React.useState<PurchaseDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showConfetti, setShowConfetti] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Track if SMS has been sent to avoid duplicates
  const [smsSent, setSmsSent] = React.useState(false);
  const [smsDebug, setSmsDebug] = React.useState<{
    apiUrl?: string;
    phone?: string;
    productName?: string;
    deliveryMethod?: string;
    result?: string;
    success?: boolean;
    message?: string;
    reason?: string;
  } | null>(null);

  // Send SMS for Uber Express orders (works with both paymentIntent and sessionId)
  React.useEffect(() => {
    if ((paymentIntentId || sessionId) && !smsSent) {
      const sendOrderSms = async () => {
        try {
          console.log('[Success] Sending order confirmation SMS...');
          console.log('[Success] PaymentIntent:', paymentIntentId);
          console.log('[Success] SessionId:', sessionId);
          console.log('[Success] Phone from URL:', phoneFromUrl);
          
          const response = await fetch('/api/sms/order-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              paymentIntentId,
              sessionId,
              phone: phoneFromUrl, // Pass phone from URL as backup
            }),
          });
          const result = await response.json();
          console.log('[Success] SMS result:', result);
          setSmsDebug({ ...result.debug, success: result.success, message: result.message, reason: result.reason });
          setSmsSent(true);
        } catch (err) {
          console.error('[Success] Failed to send SMS:', err);
          setSmsDebug({ result: `Error: ${err}` });
        }
      };
      sendOrderSms();
    }
  }, [paymentIntentId, sessionId, phoneFromUrl, smsSent]);

  React.useEffect(() => {
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
        }
      } catch (err) {
        console.error("Error fetching purchase:", err);
      } finally {
        setLoading(false);
        setShowConfetti(true);
      }
    };

    fetchPurchase();
  }, [sessionId, paymentIntentId]);

  const copyOrderNumber = () => {
    if (purchase?.order_number) {
      navigator.clipboard.writeText(purchase.order_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Extract product and seller (handle both array and object from Supabase)
  const product = extractFirst(purchase?.product);
  const seller = extractFirst(purchase?.seller);
  
  const productName = product?.display_name || product?.description || "Your item";
  const productImage = product?.primary_image_url;
  const sellerName = seller?.business_name || seller?.name || "Seller";

  return (
    <div className="min-h-screen bg-white">
      
      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && <Confetti />}
      </AnimatePresence>
      
      {/* Loading State */}
      {loading ? (
        <CheckoutSuccessLoading />
      ) : error ? (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
          <div className="bg-white rounded-md border border-gray-200 p-8 text-center max-w-sm">
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => router.push("/marketplace")} className="rounded-md">
              Back to Marketplace
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-w-lg mx-auto px-4 pt-8 sm:pt-12 pb-24">
          
          {/* Success Badge & Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            {/* Success Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full mb-5"
            >
              <Sparkles className="h-3.5 w-3.5 text-gray-600" />
              <span className="text-xs font-medium text-gray-700">Purchase Complete</span>
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-2"
            >
              It's yours!
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-gray-500 text-sm sm:text-base"
            >
              We've notified the seller about your purchase
            </motion.p>
          </motion.div>

          {/* Product Hero Card */}
          {purchase && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5 }}
              className="bg-white rounded-md border border-gray-200 overflow-hidden mb-4"
            >
              {/* Product Image */}
              <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
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
                    <Package className="h-16 w-16 text-gray-300" />
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-1.5 line-clamp-2">
                  {productName}
                </h2>
                
                <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                  <Store className="h-3.5 w-3.5" />
                  <span>{sellerName}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Order Details Card */}
          {purchase && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="bg-white rounded-md border border-gray-200 p-5 mb-4"
            >
              {/* Order Number Row */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center">
                    <Receipt className="h-4 w-4 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Order number</p>
                    <p className="text-sm font-mono font-medium text-gray-900">
                      {purchase.order_number}
                    </p>
                  </div>
                </div>
                <button
                  onClick={copyOrderNumber}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
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

              {/* Price Breakdown */}
              <div className="pt-4 space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Item price</span>
                  <span className="text-gray-900">${purchase.item_price.toFixed(2)}</span>
                </div>
                {purchase.shipping_cost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Shipping</span>
                    <span className="text-gray-900">${purchase.shipping_cost.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2.5 border-t border-gray-100">
                  <span className="text-sm font-medium text-gray-900">Total paid</span>
                  <span className="text-base font-semibold text-gray-900">
                    ${purchase.total_amount.toFixed(2)}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* What's Next Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.5 }}
            className="bg-white rounded-md border border-gray-200 p-5 mb-6"
          >
            <h3 className="text-sm font-medium text-gray-900 mb-4">What happens next</h3>
            
            <div>
              <TimelineStep
                step={1}
                title="Payment confirmed"
                description="Your payment was processed successfully"
                isComplete
                delay={0.5}
              />
              
              <TimelineStep
                step={2}
                title="Seller notified"
                description="They've received your order details"
                isComplete
                delay={0.6}
              />
              
              <TimelineStep
                step={3}
                title="Arrange collection or shipping"
                description="The seller will contact you to arrange delivery"
                isActive
                delay={0.7}
                isLast
              />
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="space-y-3"
          >
            <Button
              onClick={() => router.push("/settings/purchases")}
              className="w-full h-11 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium"
            >
              View my purchases
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            
            <Button
              variant="outline"
              onClick={() => router.push("/marketplace")}
              className="w-full h-11 rounded-md text-sm font-medium"
            >
              Continue browsing
            </Button>
          </motion.div>

          {/* SMS Debug Info (for testing) */}
          {smsDebug && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.4 }}
              className="mt-6 bg-gray-100 rounded-md p-4 text-left"
            >
              <h4 className="text-xs font-semibold text-gray-600 mb-2">SMS Debug Info</h4>
              <div className="space-y-2 text-xs font-mono">
                <div>
                  <span className="text-gray-500">Success:</span>{" "}
                  <span className={smsDebug.success ? "text-green-600" : "text-red-600"}>
                    {smsDebug.success ? "Yes" : "No"}
                  </span>
                </div>
                {smsDebug.reason && (
                  <div>
                    <span className="text-gray-500">Reason:</span>{" "}
                    <span className="text-orange-600">{smsDebug.reason}</span>
                  </div>
                )}
                {smsDebug.deliveryMethod && (
                  <div>
                    <span className="text-gray-500">Delivery:</span>{" "}
                    <span className="text-gray-700">{smsDebug.deliveryMethod}</span>
                  </div>
                )}
                {smsDebug.phone && (
                  <div>
                    <span className="text-gray-500">Phone:</span>{" "}
                    <span className="text-gray-700">{smsDebug.phone}</span>
                  </div>
                )}
                {smsDebug.productName && (
                  <div>
                    <span className="text-gray-500">Product:</span>{" "}
                    <span className="text-gray-700">{smsDebug.productName}</span>
                  </div>
                )}
                {smsDebug.result && (
                  <div>
                    <span className="text-gray-500">API Result:</span>{" "}
                    <span className="text-gray-700">{smsDebug.result}</span>
                  </div>
                )}
                {smsDebug.apiUrl && (
                  <div className="pt-2 border-t border-gray-200">
                    <span className="text-gray-500 block mb-1">API URL:</span>
                    <div className="bg-white p-2 rounded border border-gray-200 break-all text-[10px] text-gray-600">
                      {smsDebug.apiUrl}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-10 text-center space-y-4"
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
      )}
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

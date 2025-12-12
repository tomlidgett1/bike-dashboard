"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Check, 
  Package, 
  Loader2, 
  ShoppingBag, 
  Mail, 
  ChevronRight,
  Store,
  Copy,
  CheckCircle2,
  Calendar
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
    const colors = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];
    
    for (let i = 0; i < 50; i++) {
      pieces.push({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2.5 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 8,
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
            opacity: 1 
          }}
          animate={{ 
            y: '110vh',
            rotate: piece.rotation + 720,
            opacity: [1, 1, 0]
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
// Success Checkmark Animation
// ============================================================

function SuccessCheckmark() {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ 
        type: "spring", 
        stiffness: 200, 
        damping: 15,
        delay: 0.2 
      }}
      className="relative"
    >
      {/* Subtle glow */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl"
        style={{ width: 100, height: 100, margin: -10 }}
      />
      
      {/* Main circle */}
      <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
        <motion.div
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <Check className="h-10 w-10 text-white" strokeWidth={3} />
        </motion.div>
      </div>
    </motion.div>
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
}

function TimelineStep({ icon, title, description, isComplete, isActive, delay }: TimelineStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="flex items-start gap-4"
    >
      <div className={cn(
        "flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
        isComplete 
          ? "bg-emerald-100 text-emerald-600" 
          : isActive 
            ? "bg-blue-100 text-blue-600" 
            : "bg-gray-100 text-gray-400"
      )}>
        {icon}
      </div>
      <div className="flex-1 pt-1">
        <p className={cn(
          "font-medium",
          isComplete ? "text-emerald-700" : isActive ? "text-gray-900" : "text-gray-500"
        )}>
          {title}
        </p>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      {isComplete && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.2, type: "spring", stiffness: 300 }}
          className="flex-shrink-0"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================
// Purchase Details Interface
// ============================================================

interface PurchaseDetails {
  id: string;
  order_number: string;
  total_amount: number;
  item_price: number;
  shipping_cost: number;
  product: {
    id: string;
    description: string;
    display_name: string | null;
    primary_image_url: string | null;
  };
  seller: {
    name: string;
    business_name: string | null;
  };
}

// ============================================================
// Main Checkout Success Page
// ============================================================

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = React.useState(true);
  const [purchase, setPurchase] = React.useState<PurchaseDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showConfetti, setShowConfetti] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!sessionId) {
      setError("No session ID provided");
      setLoading(false);
      return;
    }

    const fetchPurchase = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));

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
  }, [sessionId]);

  const copyOrderNumber = () => {
    if (purchase?.order_number) {
      navigator.clipboard.writeText(purchase.order_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const productName = purchase?.product?.display_name || purchase?.product?.description || "Your item";
  const sellerName = purchase?.seller?.business_name || purchase?.seller?.name || "Seller";

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />
      
      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && <Confetti />}
      </AnimatePresence>

      <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 pt-16 sm:pt-20 pb-24">
        
        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="mb-6"
            >
              <Loader2 className="h-10 w-10 text-emerald-500" />
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg text-gray-600 font-medium"
            >
              Confirming your purchase...
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-sm text-gray-400 mt-2"
            >
              This will only take a moment
            </motion.p>
          </div>
        ) : error ? (
          <div className="max-w-md mx-auto px-4 pt-20">
            <div className="bg-white rounded-md border border-gray-200 p-8 text-center shadow-sm">
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={() => router.push("/marketplace")} className="rounded-md">
                Back to Marketplace
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4">
            
            {/* Success Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10 pt-6"
            >
              <SuccessCheckmark />
              
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="text-3xl sm:text-4xl font-bold text-gray-900 mt-8 mb-3"
              >
                You've got a new ride!
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-lg text-gray-500"
              >
                Your order has been confirmed and is on its way
              </motion.p>
            </motion.div>

            {/* Product Showcase Card */}
            {purchase && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden mb-6"
              >
                {/* Product Image - Large and Prominent */}
                <div className="relative aspect-[16/10] bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
                  {purchase.product?.primary_image_url ? (
                    <Image
                      src={purchase.product.primary_image_url}
                      alt={productName}
                      fill
                      className="object-contain p-4"
                      priority
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-20 w-20 text-gray-300" />
                    </div>
                  )}
                  
                  {/* Subtle gradient overlay at bottom */}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/60 to-transparent" />
                </div>

                {/* Product Details */}
                <div className="p-6">
                  {/* Product Name */}
                  <h2 className="text-xl font-semibold text-gray-900 mb-2 line-clamp-2">
                    {productName}
                  </h2>
                  
                  {/* Seller Info */}
                  <div className="flex items-center gap-2 text-gray-500 mb-6">
                    <Store className="h-4 w-4" />
                    <span className="text-sm">Sold by <span className="font-medium text-gray-700">{sellerName}</span></span>
                  </div>

                  {/* Order Number */}
                  <div className="bg-gray-50 rounded-md p-4 mb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">
                          Order Number
                        </p>
                        <p className="text-lg font-mono font-bold text-gray-900">
                          {purchase.order_number}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyOrderNumber}
                        className="rounded-md gap-2"
                      >
                        {copied ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Price Summary */}
                  <div className="border-t border-gray-100 pt-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Item Price</span>
                        <span className="text-gray-700">${purchase.item_price.toFixed(2)}</span>
                      </div>
                      {purchase.shipping_cost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Shipping</span>
                          <span className="text-gray-700">${purchase.shipping_cost.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-lg font-semibold pt-3 border-t border-gray-100">
                        <span className="text-gray-900">Total Paid</span>
                        <span className="text-emerald-600">${purchase.total_amount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* What's Next Timeline */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="bg-white rounded-md border border-gray-200 shadow-sm p-6 mb-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-6">What happens next?</h3>
              
              <div className="space-y-6">
                <TimelineStep
                  icon={<Check className="h-5 w-5" />}
                  title="Order Confirmed"
                  description="Your payment was successful"
                  isComplete
                  delay={0.6}
                />
                
                <TimelineStep
                  icon={<Mail className="h-5 w-5" />}
                  title="Seller Notified"
                  description="They've received your order details"
                  isComplete
                  delay={0.7}
                />
                
                <TimelineStep
                  icon={<Calendar className="h-5 w-5" />}
                  title="Arrange Collection"
                  description="The seller will be in touch to arrange shipping or pickup"
                  isActive
                  delay={0.8}
                />
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.4 }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <Button
                onClick={() => router.push("/settings/purchases")}
                className="flex-1 h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white gap-2"
              >
                <ShoppingBag className="h-5 w-5" />
                View My Purchases
                <ChevronRight className="h-4 w-4 ml-auto" />
              </Button>
              
              <Button
                variant="outline"
                onClick={() => router.push("/marketplace")}
                className="flex-1 h-12 rounded-md gap-2"
              >
                Continue Shopping
              </Button>
            </motion.div>

            {/* Footer Note */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="text-center text-sm text-gray-400 mt-8"
            >
              A confirmation email has been sent to your registered email address
            </motion.p>

            {/* Stripe Branding */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="flex items-center justify-center gap-2 mt-6"
            >
              <span className="text-xs text-gray-400">Payment secured by</span>
              <Image
                src="/stripe.svg"
                alt="Stripe"
                width={40}
                height={17}
                className="opacity-40"
              />
            </motion.div>
          </div>
        )}
      </div>
    </>
  );
}


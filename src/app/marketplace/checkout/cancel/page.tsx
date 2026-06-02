"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ShoppingBag, Loader2, ShieldCheck, Tag, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import Image from "next/image";

// ============================================================
// Reassurance Row
// ============================================================

function ReassuranceRow({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="flex items-start gap-3.5"
    >
      <div className="flex-shrink-0 h-9 w-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

// ============================================================
// Checkout Cancel Page Content (uses useSearchParams)
// ============================================================

function CheckoutCancelContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("product_id");

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.05 }}
          className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gray-100"
        >
          <X className="h-9 w-9 text-gray-500" strokeWidth={2.5} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mb-2"
        >
          Checkout cancelled
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-gray-500 text-sm sm:text-base"
        >
          No worries — you haven&apos;t been charged
        </motion.p>
      </motion.div>

      {/* Reassurance card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6 space-y-5"
      >
        <ReassuranceRow
          icon={<ShieldCheck className="h-4 w-4" />}
          title="No payment taken"
          description="Nothing was charged to your account"
          delay={0.4}
        />
        <ReassuranceRow
          icon={<RotateCcw className="h-4 w-4" />}
          title="Still available"
          description="The item remains for sale if you'd like to try again"
          delay={0.48}
        />
        <ReassuranceRow
          icon={<Tag className="h-4 w-4" />}
          title="Make an offer instead"
          description="Not quite right on price? You can send the seller an offer"
          delay={0.56}
        />
      </motion.div>

      {/* Desktop / tablet actions (inline) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="hidden sm:flex flex-col gap-3"
      >
        {productId && (
          <Button
            onClick={() => router.push(`/marketplace/product/${productId}`)}
            className="w-full h-12 rounded-xl text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Return to product
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => router.push("/marketplace")}
          className="w-full h-12 rounded-xl text-sm font-medium"
        >
          <ShoppingBag className="h-4 w-4 mr-1.5" />
          Browse marketplace
        </Button>
      </motion.div>

      {/* Help + Stripe footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.75 }}
        className="mt-8 sm:mt-10 text-center space-y-4"
      >
        <p className="text-sm text-gray-500">
          Having trouble?{" "}
          <button
            onClick={() => router.push("/help")}
            className="text-gray-900 font-medium hover:underline"
          >
            Get help
          </button>
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

      {/* Mobile sticky action bar */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {productId ? (
          <>
            <Button
              onClick={() => router.push(`/marketplace/product/${productId}`)}
              className="w-full h-12 rounded-xl text-sm font-semibold"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Return to product
            </Button>
            <button
              onClick={() => router.push("/marketplace")}
              className="mt-2 w-full text-center text-sm font-medium text-gray-500 py-1.5"
            >
              Browse marketplace
            </button>
          </>
        ) : (
          <Button
            onClick={() => router.push("/marketplace")}
            className="w-full h-12 rounded-xl text-sm font-semibold"
          >
            <ShoppingBag className="h-4 w-4 mr-1.5" />
            Browse marketplace
          </Button>
        )}
      </motion.div>
    </>
  );
}

// ============================================================
// Loading Fallback
// ============================================================

function CheckoutCancelLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );
}

// ============================================================
// Checkout Cancel Page (wrapped in Suspense)
// ============================================================

export default function CheckoutCancelPage() {
  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <div className="relative min-h-screen bg-gray-50 pb-40 sm:pb-16">
        {/* Soft neutral glow behind the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-gray-200/40 via-gray-100/20 to-transparent"
        />
        <div className="relative max-w-lg mx-auto px-4 pt-10 sm:pt-14">
          <Suspense fallback={<CheckoutCancelLoading />}>
            <CheckoutCancelContent />
          </Suspense>
        </div>
      </div>
    </>
  );
}

"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { XCircle, ArrowLeft, ShoppingBag, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import Image from "next/image";

// ============================================================
// Checkout Cancel Page
// ============================================================

export default function CheckoutCancelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("product_id");

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <div className="min-h-screen bg-gray-50 pt-16 sm:pt-20 pb-24">
        <div className="max-w-lg mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Cancel Card */}
            <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="bg-gray-50 p-6 text-center border-b border-gray-100">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, delay: 0.1 }}
                  className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 mb-4"
                >
                  <XCircle className="h-8 w-8 text-gray-500" />
                </motion.div>
                
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-2xl font-bold text-gray-900 mb-2"
                >
                  Checkout Cancelled
                </motion.h1>
                
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-gray-600"
                >
                  Your payment was not processed
                </motion.p>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="text-center mb-6">
                  <p className="text-gray-600 mb-2">
                    No worries! Your checkout was cancelled and you haven&apos;t been charged.
                  </p>
                  <p className="text-sm text-gray-500">
                    The item is still available if you&apos;d like to try again.
                  </p>
                </div>

                {/* Reassurance */}
                <div className="bg-white border border-gray-200 rounded-md p-4 mb-6">
                  <h3 className="font-medium text-gray-900 mb-2">Good to know:</h3>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5">•</span>
                      No payment was taken from your account
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5">•</span>
                      The item remains available for purchase
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5">•</span>
                      You can try again anytime or make an offer instead
                    </li>
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  {productId && (
                    <Button
                      onClick={() => router.push(`/marketplace/product/${productId}`)}
                      className="w-full rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Return to Product
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    onClick={() => router.push("/marketplace")}
                    className="w-full rounded-md"
                  >
                    <ShoppingBag className="h-4 w-4 mr-2" />
                    Browse Marketplace
                  </Button>
                </div>

                {/* Help Link */}
                <div className="mt-6 text-center">
                  <p className="text-sm text-gray-500">
                    Having trouble?{" "}
                    <button
                      onClick={() => router.push("/help")}
                      className="text-gray-900 font-medium hover:underline"
                    >
                      Get help
                    </button>
                  </p>
                </div>
              </div>
            </div>

            {/* Stripe Branding */}
            <div className="flex items-center justify-center gap-2 mt-6">
              <span className="text-xs text-gray-400">Payment secured by</span>
              <Image
                src="/stripe.svg"
                alt="Stripe"
                width={40}
                height={17}
                className="opacity-40"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}

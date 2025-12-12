"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Package, ArrowRight, Loader2, Home, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import Link from "next/link";
import Image from "next/image";

// ============================================================
// Checkout Success Page
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

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = React.useState(true);
  const [purchase, setPurchase] = React.useState<PurchaseDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!sessionId) {
      setError("No session ID provided");
      setLoading(false);
      return;
    }

    // Fetch purchase details
    const fetchPurchase = async () => {
      try {
        // Wait a moment for webhook to process
        await new Promise(resolve => setTimeout(resolve, 2000));

        const response = await fetch(`/api/stripe/session/${sessionId}`);
        
        if (response.ok) {
          const data = await response.json();
          setPurchase(data.purchase);
        } else {
          // Purchase might not be ready yet, show generic success
          console.log("Purchase not found yet, showing generic success");
        }
      } catch (err) {
        console.error("Error fetching purchase:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPurchase();
  }, [sessionId]);

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <div className="min-h-screen bg-gray-50 pt-16 sm:pt-20 pb-24">
        <div className="max-w-lg mx-auto px-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
              <p className="text-gray-600">Confirming your purchase...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-md border border-gray-200 p-8 text-center">
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={() => router.push("/marketplace")} className="rounded-md">
                Back to Marketplace
              </Button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Success Card */}
              <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
                {/* Success Header */}
                <div className="bg-green-50 p-6 text-center border-b border-green-100">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 15, delay: 0.2 }}
                    className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4"
                  >
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </motion.div>
                  
                  <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-2xl font-bold text-gray-900 mb-2"
                  >
                    Purchase Complete!
                  </motion.h1>
                  
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-gray-600"
                  >
                    Thank you for your order
                  </motion.p>
                </div>

                {/* Order Details */}
                <div className="p-6">
                  {purchase ? (
                    <>
                      {/* Order Number */}
                      <div className="text-center mb-6">
                        <p className="text-sm text-gray-500 mb-1">Order Number</p>
                        <p className="text-lg font-mono font-bold text-gray-900">
                          {purchase.order_number}
                        </p>
                      </div>

                      {/* Product Info */}
                      <div className="bg-gray-50 rounded-md p-4 mb-6">
                        <div className="flex gap-4">
                          <div className="relative h-16 w-16 rounded-md overflow-hidden bg-gray-200 flex-shrink-0">
                            {purchase.product?.primary_image_url ? (
                              <Image
                                src={purchase.product.primary_image_url}
                                alt={purchase.product.display_name || purchase.product.description}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Package className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 line-clamp-2">
                              {purchase.product?.display_name || purchase.product?.description}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                              From {purchase.seller?.business_name || purchase.seller?.name}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Price Breakdown */}
                      <div className="space-y-2 mb-6">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Item Price</span>
                          <span className="text-gray-900">${purchase.item_price.toFixed(2)}</span>
                        </div>
                        {purchase.shipping_cost > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Shipping</span>
                            <span className="text-gray-900">${purchase.shipping_cost.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
                          <span className="text-gray-900">Total Paid</span>
                          <span className="text-gray-900">${purchase.total_amount.toFixed(2)}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Generic Success */
                    <div className="text-center py-4">
                      <p className="text-gray-600 mb-2">
                        Your payment was successful and your order is being processed.
                      </p>
                      <p className="text-sm text-gray-500">
                        You&apos;ll receive a confirmation email shortly.
                      </p>
                    </div>
                  )}

                  {/* Next Steps */}
                  <div className="bg-gray-50 rounded-md p-4 mb-6">
                    <h3 className="font-medium text-gray-900 mb-2">What&apos;s next?</h3>
                    <ul className="text-sm text-gray-600 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">✓</span>
                        The seller has been notified of your purchase
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">✓</span>
                        You&apos;ll receive updates on shipping via email
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">✓</span>
                        Track your order in &quot;My Purchases&quot;
                      </li>
                    </ul>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    <Button
                      onClick={() => router.push("/settings/purchases")}
                      className="w-full rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                    >
                      <ShoppingBag className="h-4 w-4 mr-2" />
                      View My Purchases
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={() => router.push("/marketplace")}
                      className="w-full rounded-md"
                    >
                      <Home className="h-4 w-4 mr-2" />
                      Continue Shopping
                    </Button>
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
          )}
        </div>
      </div>
    </>
  );
}

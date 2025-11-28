"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Package } from "lucide-react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ============================================================
// Sell Your Bike Page
// Placeholder page for future seller listing form
// ============================================================

export default function SellPage() {
  const router = useRouter();

  return (
    <MarketplaceLayout>
      {/* Simple Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="max-w-[1920px] mx-auto px-6">
          <div className="flex h-16 items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/marketplace')}
              className="rounded-md"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold text-gray-900">Sell Your Bike</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-[1920px] mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto"
        >
          <Card className="rounded-md bg-white border-gray-200">
            <CardHeader className="text-center pb-6">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <Package className="h-8 w-8 text-gray-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900">
                Coming Soon
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-center">
              <p className="text-gray-600">
                The seller listing form is currently under development. Soon you'll be able to:
              </p>

              <div className="space-y-3 text-left bg-gray-50 rounded-md p-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-medium">
                    1
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">List your products</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Add detailed descriptions, pricing, and specifications
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-medium">
                    2
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Upload photos</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Showcase your items with high-quality images
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-medium">
                    3
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Reach buyers</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Connect with thousands of cycling enthusiasts
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <p className="text-sm text-gray-600">
                  For now, you can manage your existing inventory through the{" "}
                  <a href="/settings" className="text-gray-900 font-medium hover:underline">
                    Dashboard
                  </a>
                  .
                </p>

                <Button
                  onClick={() => router.push('/marketplace')}
                  className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                >
                  Back to Marketplace
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </MarketplaceLayout>
  );
}


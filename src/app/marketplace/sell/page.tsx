"use client";

import * as React from "react";
import { Suspense } from "react";
import { SellWizard } from "@/components/marketplace/sell/sell-wizard";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";

// ============================================================
// Sell Your Bike Page
// Now includes marketplace layout for mobile bottom nav
// ============================================================

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function SellPage() {
  return (
    <MarketplaceLayout showFooter={false}>
      <MarketplaceHeader />
      <Suspense fallback={<div className="min-h-screen pt-20 flex items-center justify-center">Loading...</div>}>
        <SellWizard />
      </Suspense>
    </MarketplaceLayout>
  );
}

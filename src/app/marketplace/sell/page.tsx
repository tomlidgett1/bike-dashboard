"use client";

import * as React from "react";
import { SellWizard } from "@/components/marketplace/sell/sell-wizard";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";

// ============================================================
// Sell Your Bike Page
// Now includes marketplace layout for mobile bottom nav
// ============================================================

export default function SellPage() {
  return (
    <MarketplaceLayout showFooter={false}>
      <SellWizard />
    </MarketplaceLayout>
  );
}

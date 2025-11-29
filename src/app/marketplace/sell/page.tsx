"use client";

import * as React from "react";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { SellWizard } from "@/components/marketplace/sell/sell-wizard";

// ============================================================
// Sell Your Bike Page
// ============================================================

export default function SellPage() {
  return (
    <MarketplaceLayout>
      <SellWizard />
    </MarketplaceLayout>
  );
}

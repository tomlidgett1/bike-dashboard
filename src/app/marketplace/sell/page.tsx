"use client";

import * as React from "react";
import { SellWizard } from "@/components/marketplace/sell/sell-wizard";

// ============================================================
// Sell Your Bike Page
// No layout wrapper - wizard handles its own layout without footer
// ============================================================

export default function SellPage() {
  return <SellWizard />;
}

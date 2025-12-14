"use client";

import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { HelpPage } from "@/components/help";

export default function HelpCentrePage() {
  return (
    <>
      {/* Desktop: Show header */}
      <div className="hidden lg:block">
        <MarketplaceHeader showFloatingButton={false} />
      </div>

      <HelpPage />
    </>
  );
}

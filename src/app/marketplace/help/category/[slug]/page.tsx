"use client";

import { useParams } from "next/navigation";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { HelpPage } from "@/components/help";

export default function HelpCategoryPage() {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <>
      {/* Desktop: Show header */}
      <div className="hidden lg:block">
        <MarketplaceHeader showFloatingButton={false} />
      </div>

      <HelpPage categorySlug={slug} />
    </>
  );
}


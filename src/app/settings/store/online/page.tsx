"use client";

export const dynamic = "force-dynamic";

import { Globe } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreOnlineProductsManager } from "@/components/settings/store-online-products-manager";

export default function StoreOnlineProductsPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Online products"
        description="Publish products from any online store with an Online Only badge."
      />
      <PageBody>
        <SettingsSection
          title="Online products"
          description="Screenshot products from any online store — AI extracts the listings, sources images via SERP, and publishes them."
          icon={Globe}
        >
          <StoreOnlineProductsManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

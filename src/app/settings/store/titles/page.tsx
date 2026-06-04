"use client";

export const dynamic = "force-dynamic";

import { Type } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreProductTitlesManager } from "@/components/settings/store-product-titles-manager";

export default function StoreTitlesPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Titles"
        description="Clean up Lightspeed product names into ecommerce-ready titles."
      />
      <PageBody>
        <SettingsSection
          title="Product titles"
          description="Titles shown on the marketplace, cleaned from raw Lightspeed names."
          icon={Type}
        >
          <StoreProductTitlesManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

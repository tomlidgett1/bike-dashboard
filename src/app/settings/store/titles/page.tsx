"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { Type } from "@/components/layout/app-sidebar/dashboard-icons";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreProductTitlesManager = nextDynamic(
  () => import("@/components/settings/store-product-titles-manager").then((mod) => mod.StoreProductTitlesManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-56" /> }
);

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

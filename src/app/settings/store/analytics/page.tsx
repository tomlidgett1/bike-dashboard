"use client";

export const dynamic = "force-dynamic";

import { BarChart3 } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreAnalyticsManager } from "@/components/settings/store-analytics-manager";

export default function StoreAnalyticsPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Analytics"
        description="Store visits, product views, impressions and distinct users."
      />
      <PageBody>
        <SettingsSection
          title="Storefront analytics"
          description="Track engagement across your store page."
          icon={BarChart3}
        >
          <StoreAnalyticsManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

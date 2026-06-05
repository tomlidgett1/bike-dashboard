"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { BarChart3 } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreAnalyticsManager = nextDynamic(
  () => import("@/components/settings/store-analytics-manager").then((mod) => mod.StoreAnalyticsManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-64" /> }
);

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

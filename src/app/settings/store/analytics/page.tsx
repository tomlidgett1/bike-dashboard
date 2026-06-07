"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { PageContainer, PageHeader, PageBody } from "@/components/dashboard";
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
        description="Website traffic, product engagement, distinct viewers, and device split."
      />
      <PageBody>
        <StoreAnalyticsManager />
      </PageBody>
    </PageContainer>
  );
}

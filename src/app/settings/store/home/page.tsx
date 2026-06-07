"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { PageBody, PageContainer, PageHeader } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreOverviewDashboard = nextDynamic(
  () => import("@/components/settings/store-overview-dashboard").then((mod) => mod.StoreOverviewDashboard),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-72" /> }
);

const StoreSetupButton = nextDynamic(
  () => import("@/components/settings/store-setup-button").then((mod) => mod.StoreSetupButton),
  { ssr: false, loading: () => null }
);

export default function StoreHomePage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Home"
        description="Website tracking, marketplace reach, and what needs attention."
        actions={<StoreSetupButton />}
      />
      <PageBody>
        <StoreOverviewDashboard />
      </PageBody>
    </PageContainer>
  );
}

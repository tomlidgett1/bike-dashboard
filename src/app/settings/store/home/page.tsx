"use client";

export const dynamic = "force-dynamic";

import { PageBody, PageContainer, PageHeader } from "@/components/dashboard";
import { StoreOverviewDashboard } from "@/components/settings/store-overview-dashboard";
import { StoreSetupButton } from "@/components/settings/store-setup-button";

export default function StoreHomePage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Home"
        description="Store performance, marketplace reach, and what needs attention."
        actions={<StoreSetupButton />}
      />
      <PageBody>
        <StoreOverviewDashboard />
      </PageBody>
    </PageContainer>
  );
}

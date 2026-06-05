"use client";

export const dynamic = "force-dynamic";

import { PageBody, PageContainer, PageHeader } from "@/components/dashboard";
import { StoreOverviewDashboard } from "@/components/settings/store-overview-dashboard";

export default function StoreHomePage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Home"
        description="Store performance, marketplace reach, and what needs attention."
      />
      <PageBody>
        <StoreOverviewDashboard />
      </PageBody>
    </PageContainer>
  );
}

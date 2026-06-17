"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { BarChart3 } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreAnalyticsManager = nextDynamic(
  () => import("@/components/settings/store-analytics-manager").then((mod) => mod.StoreAnalyticsManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-64" /> }
);

export default function StoreAnalyticsPage() {
  return (
    <DashboardFloatingPage
      title="Analytics"
      icon={BarChart3}
      description="Website traffic, product engagement, customer search terms, distinct viewers, and device split."
      flush
    >
      <StoreAnalyticsManager />
    </DashboardFloatingPage>
  );
}

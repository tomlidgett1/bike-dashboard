"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { BarChart3 } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const AnalyticsStudio = nextDynamic(
  () => import("@/components/analytics-studio/analytics-studio").then((mod) => mod.AnalyticsStudio),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-64" /> }
);

export default function AnalyticsNewPage() {
  return (
    <DashboardFloatingPage
      title="Analytics"
      icon={BarChart3}
      hideTitle
      flush
      cardClassName="rounded-t-none"
      scrollClassName="flex flex-col"
    >
      <AnalyticsStudio />
    </DashboardFloatingPage>
  );
}

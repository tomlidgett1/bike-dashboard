"use client";

export const dynamic = "force-dynamic";

import { BarChart3 } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { MetricsWorkspace } from "@/components/metrics/metrics-workspace";

export default function StoreMetricsPage() {
  return (
    <DashboardFloatingPage
      title="Sales analytics"
      icon={BarChart3}
      description="Ask governed questions about revenue, margin, and store performance. Pin charts to your dashboard."
      flush
    >
      <MetricsWorkspace />
    </DashboardFloatingPage>
  );
}

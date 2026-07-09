"use client";

export const dynamic = "force-dynamic";

import { LayoutGrid } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { MetricsWorkspace } from "@/components/metrics/metrics-workspace";

export default function StoreDashboardPage() {
  return (
    <DashboardFloatingPage
      title="Analytics dashboard"
      icon={LayoutGrid}
      description="Pinned charts and tables from your sales analytics investigations."
      flush
    >
      <MetricsWorkspace initialTab="dashboard" />
    </DashboardFloatingPage>
  );
}

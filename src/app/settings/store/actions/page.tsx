"use client";

export const dynamic = "force-dynamic";

import { Widget } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { ActionsSimpleBentoTable } from "@/components/settings/actions-simple-bento-table";

export default function StoreActionsPage() {
  return (
    <DashboardFloatingPage
      title="Actions"
      icon={Widget}
      flush
    >
      <ActionsSimpleBentoTable className="min-h-0 flex-1" />
    </DashboardFloatingPage>
  );
}

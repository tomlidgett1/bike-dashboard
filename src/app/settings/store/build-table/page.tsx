"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { Table2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const TableBuilder = nextDynamic(
  () => import("@/components/table-builder/table-builder").then((mod) => mod.TableBuilder),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-64" /> },
);

export default function BuildTablePage() {
  return (
    <DashboardFloatingPage
      title="Build a Table"
      icon={Table2}
      flush
      scrollClassName="flex min-h-0 flex-col overflow-hidden"
    >
      <Suspense fallback={<SettingsManagerLoading className="min-h-64" />}>
        <TableBuilder />
      </Suspense>
    </DashboardFloatingPage>
  );
}

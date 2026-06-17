"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { Type } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreProductTitlesManager = nextDynamic(
  () => import("@/components/settings/store-product-titles-manager").then((mod) => mod.StoreProductTitlesManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-56" /> }
);

export default function StoreTitlesPage() {
  return (
    <DashboardFloatingPage
      title="Titles"
      icon={Type}
      description="Clean up Lightspeed product names into ecommerce-ready titles."
      flush
    >
      <div className="p-4 md:p-5">
        <StoreProductTitlesManager />
      </div>
    </DashboardFloatingPage>
  );
}

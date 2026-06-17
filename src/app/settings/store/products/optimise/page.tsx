"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import nextDynamic from "next/dynamic";
import { ArrowLeft, MagicStick3 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const BulkOptimiseWorkspace = nextDynamic(
  () =>
    import("@/components/optimize/bulk-optimise-workspace").then(
      (mod) => mod.BulkOptimiseWorkspace,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-72" /> },
);

export default function BulkOptimisePage() {
  return (
    <DashboardFloatingPage
      title="Bulk optimise"
      icon={MagicStick3}
      description="Optimise titles, descriptions, specs, photos and brands for many products at once."
      flush
      actions={
        <Button variant="outline" size="sm" className="rounded-md" asChild>
          <Link href="/settings/store/products">
            <ArrowLeft className="size-4" />
            Back to products
          </Link>
        </Button>
      }
    >
      <div className="p-4 md:p-5">
        <BulkOptimiseWorkspace />
      </div>
    </DashboardFloatingPage>
  );
}

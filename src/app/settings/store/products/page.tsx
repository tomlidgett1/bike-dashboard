"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import nextDynamic from "next/dynamic";
import { FileText, Pencil } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  DashboardFloatingPage,
  DashboardFloatingSection,
} from "@/components/layout/dashboard-floating-page";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreProductDescriptionsManager = nextDynamic(
  () => import("@/components/settings/store-product-descriptions-manager").then((mod) => mod.StoreProductDescriptionsManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-56" /> }
);

export default function StoreProductContentPage() {
  return (
    <DashboardFloatingPage
      title="Product content"
      icon={FileText}
      description="Create and manage high-quality product descriptions."
      flush
      actions={
        <Button variant="outline" size="sm" className="rounded-md" asChild>
          <Link href="/products">
            <Pencil className="size-4" />
            Edit products
          </Link>
        </Button>
      }
    >
      <div className="space-y-8 p-4 md:p-5">
        <DashboardFloatingSection
          title="Product descriptions"
          description="Generate AI-powered e-commerce descriptions for your live products using web search."
        >
          <StoreProductDescriptionsManager />
        </DashboardFloatingSection>
      </div>
    </DashboardFloatingPage>
  );
}

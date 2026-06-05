"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { Wrench } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreServicesManager = nextDynamic(
  () => import("@/components/settings/store-services-manager").then((mod) => mod.StoreServicesManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-56" /> }
);

export default function StoreServicesPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Services"
        description="The services your store offers to customers."
      />
      <PageBody>
        <SettingsSection
          title="Store services"
          description="Manage the services shown on your storefront."
          icon={Wrench}
        >
          <StoreServicesManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

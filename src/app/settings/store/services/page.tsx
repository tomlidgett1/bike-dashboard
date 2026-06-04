"use client";

export const dynamic = "force-dynamic";

import { Wrench } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreServicesManager } from "@/components/settings/store-services-manager";

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

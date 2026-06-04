"use client";

export const dynamic = "force-dynamic";

import { Layers } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreSectionsManager } from "@/components/settings/store-sections-manager";

export default function StoreSectionsPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Sections"
        description="Group your carousels into named sections on your store page."
      />
      <PageBody>
        <SettingsSection
          title="Store sections"
          description={`e.g. a "Nutrition" section containing Clif, GU and Specials carousels.`}
          icon={Layers}
        >
          <StoreSectionsManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

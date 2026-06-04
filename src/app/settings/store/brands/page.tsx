"use client";

export const dynamic = "force-dynamic";

import { Tag } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreBrandsManager } from "@/components/settings/store-brands-manager";

export default function StoreBrandsPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Brands"
        description="Showcase the brands you stock on your store page."
      />
      <PageBody>
        <SettingsSection
          title="Brands we stock"
          description="Upload brand logos to display on your storefront."
          icon={Tag}
        >
          <StoreBrandsManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { Tag } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreBrandsManager = nextDynamic(
  () => import("@/components/settings/store-brands-manager").then((mod) => mod.StoreBrandsManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-48" /> }
);

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

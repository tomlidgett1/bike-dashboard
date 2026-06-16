"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import nextDynamic from "next/dynamic";
import { FileText, Pencil, Sparkles } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreProductDescriptionsManager = nextDynamic(
  () => import("@/components/settings/store-product-descriptions-manager").then((mod) => mod.StoreProductDescriptionsManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-56" /> }
);

const StoreImmersiveProductsManager = nextDynamic(
  () => import("@/components/settings/store-immersive-products-manager").then((mod) => mod.StoreImmersiveProductsManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-40" /> }
);

export default function StoreProductContentPage() {
  return (
    <PageContainer size="full">
      <PageHeader
        title="Product content"
        description="AI-generated descriptions and immersive product pages."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/products">
              <Pencil className="size-4" />
              Edit products
            </Link>
          </Button>
        }
      />
      <PageBody>
        <SettingsSection
          title="Product descriptions"
          description="Generate AI-powered e-commerce descriptions for your live products using web search."
          icon={FileText}
          contentClassName="px-0 py-0"
        >
          <StoreProductDescriptionsManager />
        </SettingsSection>
        <SettingsSection
          title="Immersive product pages"
          description="Choose which products use the full-screen Immersive layout — a cinematic hero image with a floating buy card."
          icon={Sparkles}
        >
          <StoreImmersiveProductsManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

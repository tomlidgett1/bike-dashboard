"use client";

export const dynamic = "force-dynamic";

import { FileText, Sparkles } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreProductDescriptionsManager } from "@/components/settings/store-product-descriptions-manager";
import { StoreImmersiveProductsManager } from "@/components/settings/store-immersive-products-manager";

export default function StoreProductContentPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Product content"
        description="AI-generated descriptions and immersive product pages."
      />
      <PageBody>
        <SettingsSection
          title="Product descriptions"
          description="Generate AI-powered ecommerce descriptions for your live products using web search."
          icon={FileText}
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

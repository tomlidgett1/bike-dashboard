"use client";

export const dynamic = "force-dynamic";

import { GalleryHorizontal, Store } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreCategoriesManager } from "@/components/settings/store-categories-manager";

export default function StoreCarouselsPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Carousels"
        description="Manage the product carousels shown on your store page."
      />
      <PageBody>
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <GalleryHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Featured carousel</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The <strong>first carousel</strong> below is shown as the featured tile on your public store profile. Drag to reorder.
            </p>
          </div>
        </div>
        <SettingsSection
          title="Store carousels"
          description="Import from Lightspeed or create custom carousels."
          icon={Store}
        >
          <StoreCategoriesManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

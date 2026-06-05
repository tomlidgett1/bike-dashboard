"use client";

import * as React from "react";
import { GalleryHorizontal, Store } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreCategoriesManager } from "@/components/settings/store-categories-manager";
import { AutoAssignCarouselsPanel } from "@/components/settings/auto-assign-carousels-panel";
import { Sparkles } from "lucide-react";

export function StoreCarouselsPageContent() {
  const [refreshKey, setRefreshKey] = React.useState(0);

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Carousels"
        description="Manage the product carousels shown on your store page."
      />
      <PageBody>
        <SettingsSection
          title="Auto-assign marketplace-ready products"
          description="Organise products with approved photos into carousels. You approve every change before it is saved."
          icon={Sparkles}
        >
          <AutoAssignCarouselsPanel onApplied={() => setRefreshKey((k) => k + 1)} />
        </SettingsSection>
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 px-4 py-3">
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
          <StoreCategoriesManager refreshKey={refreshKey} />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

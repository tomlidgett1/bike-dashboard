"use client";

export const dynamic = "force-dynamic";

import { Store, Tag } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreCategoriesManager } from "@/components/settings/store-categories-manager";

export default function StoreCategoriesPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Categories"
        description="Manage the category carousels shown on your store page."
      />
      <PageBody>
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <Tag className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Featured collection</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The <strong>first category</strong> below is shown as the featured tile on your public store profile. Drag to reorder.
            </p>
          </div>
        </div>
        <SettingsSection
          title="Product categories"
          description="Import from Lightspeed or create custom categories."
          icon={Store}
        >
          <StoreCategoriesManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

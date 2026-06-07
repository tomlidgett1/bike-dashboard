"use client";

import * as React from "react";
import { GalleryHorizontal, Store, Package, Bike } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreCategoriesManager } from "@/components/settings/store-categories-manager";
import { AutoAssignCarouselsPanel } from "@/components/settings/auto-assign-carousels-panel";
import { Sparkles } from "lucide-react";
import type { StoreCarouselPage } from "@/lib/types/store";
import { cn } from "@/lib/utils";

export function StoreCarouselsPageContent() {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [activePage, setActivePage] = React.useState<StoreCarouselPage>("products");

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Carousels"
        description="Manage product carousels for your Products and Bikes storefront tabs."
      />
      <PageBody>
        <SettingsSection
          title="Auto-assign marketplace-ready products"
          description="Organise products with approved photos into carousels. You approve every change before it is saved."
          icon={Sparkles}
        >
          <AutoAssignCarouselsPanel onApplied={() => setRefreshKey((k) => k + 1)} />
        </SettingsSection>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
            <button
              type="button"
              onClick={() => setActivePage("products")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activePage === "products"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Package size={15} />
              Products page
            </button>
            <button
              type="button"
              onClick={() => setActivePage("bikes")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activePage === "bikes"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Bike size={15} />
              Bikes page
            </button>
          </div>
        </div>

        {activePage === "products" ? (
          <div className="flex items-start gap-3 rounded-md border bg-white px-4 py-3">
            <GalleryHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Featured carousel</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The <strong>first carousel</strong> on the Products page is shown as the featured tile on your public store profile. Drag to reorder.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-md border bg-white px-4 py-3">
            <Bike className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Bikes tab carousels</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Carousels here appear on the <strong>Bikes</strong> tab of your store landing page, to the right of Products.
              </p>
            </div>
          </div>
        )}

        <SettingsSection
          title={activePage === "bikes" ? "Bikes page carousels" : "Products page carousels"}
          description={
            activePage === "bikes"
              ? "Create and order carousels shown on your store Bikes tab."
              : "Import from Lightspeed or create custom carousels for your Products tab."
          }
          icon={Store}
        >
          <StoreCategoriesManager refreshKey={refreshKey} activePage={activePage} />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}

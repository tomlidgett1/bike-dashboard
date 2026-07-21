"use client";

import * as React from "react";
import {
  Bike,
  Database,
  ScanSearch,
  Sparkles,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { StoreBikeUrlImport } from "@/components/settings/store-bike-url-import";
import { StoreFesportsScrapeManager } from "@/components/settings/store-fesports-scrape-manager";
import { StoreSharedCatalogueIngest } from "@/components/settings/store-shared-catalogue-ingest";
import { StoreSupplierScraperBuilder } from "@/components/settings/store-supplier-scraper-builder";
import { cn } from "@/lib/utils";

type ScrapeTab = "shared" | "builder" | "bike" | "fesports";

const TABS: Array<{ id: ScrapeTab; label: string; icon: typeof Sparkles }> = [
  { id: "shared", label: "Shared catalogue", icon: Database },
  { id: "builder", label: "Supplier scrapers", icon: Sparkles },
  { id: "bike", label: "Bike from URL", icon: Bike },
  { id: "fesports", label: "FE Sports", icon: ScanSearch },
];

export function StoreScrapePageContent() {
  const [activeTab, setActiveTab] = React.useState<ScrapeTab>("shared");

  return (
    <DashboardFloatingPage
      title="Scrape"
      icon={ScanSearch}
      description="Connect supplier websites and walk through a guided scrape, review, and import into your catalogue."
      flush
    >
      <div className="px-6 pt-6">
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === tab.id
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {activeTab === "shared" ? (
        <StoreSharedCatalogueIngest />
      ) : activeTab === "builder" ? (
        <StoreSupplierScraperBuilder />
      ) : activeTab === "bike" ? (
        <StoreBikeUrlImport />
      ) : (
        <StoreFesportsScrapeManager />
      )}
    </DashboardFloatingPage>
  );
}

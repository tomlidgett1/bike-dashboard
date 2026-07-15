"use client";

import * as React from "react";
import {
  ScanSearch,
  Sparkles,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { StoreFesportsScrapeManager } from "@/components/settings/store-fesports-scrape-manager";
import { StoreSupplierScraperBuilder } from "@/components/settings/store-supplier-scraper-builder";
import { cn } from "@/lib/utils";

export function StoreScrapePageContent() {
  const [activeTab, setActiveTab] = React.useState<"builder" | "fesports">("builder");

  return (
    <DashboardFloatingPage
      title="Scrape"
      icon={ScanSearch}
      description="Build reusable supplier scrapers with YJ or run the dedicated FE Sports importer."
      flush
    >
      <div className="px-6 pt-6">
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("builder")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "builder"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Sparkles size={15} />
            YJ scraper builder
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("fesports")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "fesports"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <ScanSearch size={15} />
            FE Sports
          </button>
        </div>
      </div>
      {activeTab === "builder" ? (
        <StoreSupplierScraperBuilder />
      ) : (
        <StoreFesportsScrapeManager />
      )}
    </DashboardFloatingPage>
  );
}

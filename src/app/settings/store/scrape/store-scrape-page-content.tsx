"use client";

import * as React from "react";
import { ScanSearch } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { StoreFesportsScrapeManager } from "@/components/settings/store-fesports-scrape-manager";

export function StoreScrapePageContent() {
  return (
    <DashboardFloatingPage
      title="Scrape"
      icon={ScanSearch}
      description="Import products from the FEsports catalogue into your store."
      flush
    >
      <StoreFesportsScrapeManager />
    </DashboardFloatingPage>
  );
}

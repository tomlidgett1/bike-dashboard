"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreScrapePageContent = nextDynamic(
  () => import("./store-scrape-page-content").then((mod) => mod.StoreScrapePageContent),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-48" /> },
);

export default function StoreScrapePage() {
  return <StoreScrapePageContent />;
}

"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreRentalsPageContent = nextDynamic(
  () => import("./store-rentals-page-content").then((mod) => mod.StoreRentalsPageContent),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-48" /> },
);

export default function StoreRentalsPage() {
  return <StoreRentalsPageContent />;
}

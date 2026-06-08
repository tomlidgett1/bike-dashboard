"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreServicesPageContent = nextDynamic(
  () => import("./store-services-page-content").then((mod) => mod.StoreServicesPageContent),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-48" /> },
);

export default function StoreServicesPage() {
  return <StoreServicesPageContent />;
}

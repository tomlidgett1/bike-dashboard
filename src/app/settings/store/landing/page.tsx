"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreHomepageManager = nextDynamic(
  () => import("@/components/settings/store-homepage-manager").then((mod) => mod.StoreHomepageManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-80" /> }
);

export default function StoreLandingPage() {
  return <StoreHomepageManager />;
}

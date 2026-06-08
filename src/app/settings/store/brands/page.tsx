"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreBrandsPageContent = nextDynamic(
  () => import("./store-brands-page-content").then((mod) => mod.StoreBrandsPageContent),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-48" /> },
);

export default function StoreBrandsPage() {
  return <StoreBrandsPageContent />;
}

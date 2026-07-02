"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const CrmPageContent = nextDynamic(
  () => import("./crm-page-content").then((mod) => mod.CrmPageContent),
  { ssr: false, loading: () => <SettingsManagerLoading fullPage /> },
);

export default function StoreCrmPage() {
  return (
    <Suspense fallback={<SettingsManagerLoading fullPage />}>
      <CrmPageContent />
    </Suspense>
  );
}

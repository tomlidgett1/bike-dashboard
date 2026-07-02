"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const CrmPageContent = nextDynamic(
  () => import("./crm-page-content").then((mod) => mod.CrmPageContent),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-72" /> },
);

export default function StoreCrmPage() {
  return (
    <Suspense fallback={<SettingsManagerLoading className="m-6 min-h-72" />}>
      <CrmPageContent />
    </Suspense>
  );
}

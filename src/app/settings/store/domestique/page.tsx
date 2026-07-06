"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreDomestiquePageContent = nextDynamic(
  () => import("./store-domestique-page-content").then((mod) => mod.StoreDomestiquePageContent),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-72" /> },
);

export default function StoreDomestiquePage() {
  return (
    <Suspense fallback={<SettingsManagerLoading className="m-6 min-h-72" />}>
      <StoreDomestiquePageContent />
    </Suspense>
  );
}

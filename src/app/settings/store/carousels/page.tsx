"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreCarouselsPageContent = nextDynamic(
  () => import("./store-carousels-page-content").then((mod) => mod.StoreCarouselsPageContent),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-72" /> }
);

export default function StoreCarouselsPage() {
  return (
    <Suspense fallback={<SettingsManagerLoading className="m-6 min-h-72" />}>
      <StoreCarouselsPageContent />
    </Suspense>
  );
}

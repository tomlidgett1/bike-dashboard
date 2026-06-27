"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreOffersPageContent = nextDynamic(
  () =>
    import("./store-offers-page-content").then((mod) => mod.StoreOffersPageContent),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-72" /> },
);

export default function StoreOffersPage() {
  return (
    <Suspense fallback={<SettingsManagerLoading className="m-6 min-h-72" />}>
      <StoreOffersPageContent />
    </Suspense>
  );
}

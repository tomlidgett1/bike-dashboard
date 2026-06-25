"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreSpecialsPageContent = nextDynamic(
  () =>
    import("./store-specials-page-content").then(
      (mod) => mod.StoreSpecialsPageContent,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-72" /> },
);

export default function StoreSpecialsPage() {
  return (
    <Suspense fallback={<SettingsManagerLoading className="m-6 min-h-72" />}>
      <StoreSpecialsPageContent />
    </Suspense>
  );
}

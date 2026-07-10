"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const WorkordersPageContent = nextDynamic(
  () =>
    import("./workorders-page-content").then(
      (mod) => mod.WorkordersPageContent,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading className="m-6 min-h-72" /> },
);

export default function StoreWorkordersPage() {
  return (
    <Suspense fallback={<SettingsManagerLoading className="m-6 min-h-72" />}>
      <WorkordersPageContent />
    </Suspense>
  );
}

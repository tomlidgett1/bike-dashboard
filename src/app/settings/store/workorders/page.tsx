"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";
import { FloatingCardPage } from "@/components/layout/floating-card-page";

const WorkordersPageContent = nextDynamic(
  () =>
    import("./workorders-page-content").then(
      (mod) => mod.WorkordersPageContent,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading fullPage /> },
);

export default function StoreWorkordersPage() {
  return (
    <FloatingCardPage>
      <WorkordersPageContent />
    </FloatingCardPage>
  );
}

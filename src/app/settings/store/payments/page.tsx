"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { FloatingCardPage } from "@/components/layout/floating-card-page";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StorePaymentsPanel = nextDynamic(
  () =>
    import("@/components/settings/store-payments-panel").then(
      (mod) => mod.StorePaymentsPanel,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading fullPage /> },
);

export default function StorePaymentsPage() {
  return (
    <FloatingCardPage>
      <StorePaymentsPanel />
    </FloatingCardPage>
  );
}

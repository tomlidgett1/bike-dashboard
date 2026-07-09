"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";
import { FloatingCardPage } from "@/components/layout/floating-card-page";

const StoreCustomerInquiriesPanel = nextDynamic(
  () =>
    import("@/components/settings/store-customer-inquiries-panel").then(
      (mod) => mod.StoreCustomerInquiriesPanel,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading fullPage /> },
);

export default function StoreCustomerInquiriesPage() {
  return (
    <FloatingCardPage>
      <StoreCustomerInquiriesPanel />
    </FloatingCardPage>
  );
}

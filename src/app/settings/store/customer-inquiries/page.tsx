"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { PageContainer } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreCustomerInquiriesPanel = nextDynamic(
  () =>
    import("@/components/settings/store-customer-inquiries-panel").then(
      (mod) => mod.StoreCustomerInquiriesPanel,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-80" /> },
);

export default function StoreCustomerInquiriesPage() {
  return (
    <PageContainer
      size="full"
      className="flex h-full min-h-0 flex-col overflow-hidden !p-0 !pt-2.5"
    >
      <StoreCustomerInquiriesPanel />
    </PageContainer>
  );
}

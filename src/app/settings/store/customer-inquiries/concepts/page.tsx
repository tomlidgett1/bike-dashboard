"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { PageContainer } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const CustomerInquiriesConcepts = nextDynamic(
  () =>
    import("@/components/settings/customer-inquiries/concepts-client").then(
      (mod) => mod.CustomerInquiriesConcepts,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-80" /> },
);

export default function CustomerInquiriesConceptsPage() {
  return (
    <PageContainer
      size="full"
      className="flex h-[calc(100svh-3rem)] min-h-0 flex-col overflow-hidden !p-0"
    >
      <CustomerInquiriesConcepts />
    </PageContainer>
  );
}

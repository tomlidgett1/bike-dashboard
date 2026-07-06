"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";
import { FloatingCardPage } from "@/components/layout/floating-card-page";

const CustomerInquiriesAnalyticsPanel = nextDynamic(
  () =>
    import("@/components/settings/customer-inquiries/analytics-panel").then(
      (mod) => mod.CustomerInquiriesAnalyticsPanel,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-80" /> },
);

export default function CustomerInquiriesAnalyticsPage() {
  return (
    <FloatingCardPage>
      <CustomerInquiriesAnalyticsPanel />
    </FloatingCardPage>
  );
}

"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { PageContainer } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreNestMessagesPanel = nextDynamic(
  () => import("@/components/settings/store-nest-messages-panel").then((mod) => mod.StoreNestMessagesPanel),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-80" /> }
);

export default function StoreNestPage() {
  return (
    <PageContainer
      size="wide"
      className="flex min-h-0 flex-1 flex-col overflow-hidden !py-4 lg:!py-5"
    >
      <StoreNestMessagesPanel />
    </PageContainer>
  );
}

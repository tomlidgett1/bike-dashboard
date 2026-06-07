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
      size="full"
      className="flex h-[calc(100svh-3rem)] min-h-0 flex-col overflow-hidden !p-0"
    >
      <StoreNestMessagesPanel />
    </PageContainer>
  );
}

"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { PageBody, PageContainer } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreNestMessagesPanel = nextDynamic(
  () => import("@/components/settings/store-nest-messages-panel").then((mod) => mod.StoreNestMessagesPanel),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-[60vh]" /> }
);

export default function StoreNestPage() {
  return (
    <PageContainer size="wide">
      <PageBody>
        <StoreNestMessagesPanel />
      </PageBody>
    </PageContainer>
  );
}

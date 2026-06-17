"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { FloatingCardPage } from "@/components/layout/floating-card-page";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreNestMessagesPanel = nextDynamic(
  () => import("@/components/settings/store-nest-messages-panel").then((mod) => mod.StoreNestMessagesPanel),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-80" /> }
);

export default function StoreNestPage() {
  return (
    <FloatingCardPage>
      <StoreNestMessagesPanel />
    </FloatingCardPage>
  );
}

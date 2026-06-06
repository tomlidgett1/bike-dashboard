"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreNestMessagesPanel = nextDynamic(
  () => import("@/components/settings/store-nest-messages-panel").then((mod) => mod.StoreNestMessagesPanel),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-[60vh]" /> }
);

export default function StoreNestPage() {
  return (
    <div className="min-h-[calc(100svh-57px)] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
      <StoreNestMessagesPanel />
    </div>
  );
}

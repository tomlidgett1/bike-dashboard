"use client";

export const dynamic = "force-dynamic";

import { PageBody, PageContainer } from "@/components/dashboard";
import { StoreNestMessagesPanel } from "@/components/settings/store-nest-messages-panel";

export default function StoreNestPage() {
  return (
    <PageContainer size="wide">
      <PageBody>
        <StoreNestMessagesPanel />
      </PageBody>
    </PageContainer>
  );
}

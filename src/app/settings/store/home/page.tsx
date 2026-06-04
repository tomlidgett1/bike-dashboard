"use client";

export const dynamic = "force-dynamic";

import { Home } from "lucide-react";
import { PageContainer, PageHeader, PageBody } from "@/components/dashboard";
import { StoreHomepageManager } from "@/components/settings/store-homepage-manager";

export default function StoreHomePage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Home page"
        description="Design the landing page customers see first on your storefront."
      />
      <PageBody>
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <Home className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Your storefront landing page</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Everything updates in the live preview — don&apos;t forget to <strong>Save</strong>.
            </p>
          </div>
        </div>
        <StoreHomepageManager />
      </PageBody>
    </PageContainer>
  );
}

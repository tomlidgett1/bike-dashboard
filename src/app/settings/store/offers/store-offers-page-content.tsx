"use client";

import * as React from "react";
import { Plus, Gift } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { StoreOffersManager } from "@/components/settings/store-offers-manager";

export function StoreOffersPageContent() {
  const [addRequest, setAddRequest] = React.useState(0);

  return (
    <DashboardFloatingPage
      title="Offers"
      icon={Gift}
      description="Create buy-one-get-free bundles with an expiry date. Shown on your storefront Offers tab."
      flush
      actions={
        <Button size="sm" className="rounded-full" onClick={() => setAddRequest((n) => n + 1)}>
          <Plus className="size-4" />
          Create offer
        </Button>
      }
    >
      <StoreOffersManager addRequest={addRequest} />
    </DashboardFloatingPage>
  );
}

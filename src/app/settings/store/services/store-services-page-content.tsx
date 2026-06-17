"use client";

import * as React from "react";
import { Plus, Wrench } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { StoreServicesManager } from "@/components/settings/store-services-manager";

export function StoreServicesPageContent() {
  const [addRequest, setAddRequest] = React.useState(0);

  return (
    <DashboardFloatingPage
      title="Services"
      icon={Wrench}
      description="The services your store offers to customers."
      flush
      actions={
        <Button size="sm" className="rounded-md" onClick={() => setAddRequest((n) => n + 1)}>
          <Plus className="size-4" />
          Add service
        </Button>
      }
    >
      <StoreServicesManager addRequest={addRequest} />
    </DashboardFloatingPage>
  );
}

"use client";

import * as React from "react";
import { Plus } from "@/components/layout/app-sidebar/dashboard-icons";
import { PageContainer, PageHeader, PageBody } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { StoreServicesManager } from "@/components/settings/store-services-manager";

export function StoreServicesPageContent() {
  const [addRequest, setAddRequest] = React.useState(0);

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Services"
        description="The services your store offers to customers."
        actions={
          <Button size="sm" className="rounded-md" onClick={() => setAddRequest((n) => n + 1)}>
            <Plus className="size-4" />
            Add service
          </Button>
        }
      />
      <PageBody>
        <StoreServicesManager addRequest={addRequest} />
      </PageBody>
    </PageContainer>
  );
}

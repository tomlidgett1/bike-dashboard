"use client";

import * as React from "react";
import { Plus, Tag } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { StoreBrandsManager } from "@/components/settings/store-brands-manager";

export function StoreBrandsPageContent() {
  const [addRequest, setAddRequest] = React.useState(0);

  return (
    <DashboardFloatingPage
      title="Brands"
      icon={Tag}
      description="Showcase the brands you stock on your store page."
      flush
      actions={
        <Button size="sm" className="rounded-md" onClick={() => setAddRequest((n) => n + 1)}>
          <Plus className="size-4" />
          Add Brand
        </Button>
      }
    >
      <StoreBrandsManager addRequest={addRequest} />
    </DashboardFloatingPage>
  );
}

"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { PageContainer, PageHeader, PageBody } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { StoreBrandsManager } from "@/components/settings/store-brands-manager";

export function StoreBrandsPageContent() {
  const [addRequest, setAddRequest] = React.useState(0);

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Brands"
        description="Showcase the brands you stock on your store page."
        actions={
          <Button size="sm" className="rounded-md" onClick={() => setAddRequest((n) => n + 1)}>
            <Plus className="size-4" />
            Add Brand
          </Button>
        }
      />
      <PageBody>
        <StoreBrandsManager addRequest={addRequest} />
      </PageBody>
    </PageContainer>
  );
}

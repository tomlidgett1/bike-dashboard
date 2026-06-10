"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import nextDynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, PageBody } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const BulkOptimiseWorkspace = nextDynamic(
  () =>
    import("@/components/optimize/bulk-optimise-workspace").then(
      (mod) => mod.BulkOptimiseWorkspace,
    ),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-72" /> },
);

export default function BulkOptimisePage() {
  return (
    <PageContainer size="full">
      <PageHeader
        title="Bulk optimise"
        description="Optimise titles, descriptions, specs, photos and brands for many products at once."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/store/products">
              <ArrowLeft className="size-4" />
              Back to products
            </Link>
          </Button>
        }
      />
      <PageBody>
        <BulkOptimiseWorkspace />
      </PageBody>
    </PageContainer>
  );
}

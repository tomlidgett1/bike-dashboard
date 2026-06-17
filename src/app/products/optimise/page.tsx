"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import nextDynamic from "next/dynamic";
import { ArrowLeft, Loader2, Sparkles } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  FloatingCard,
  FloatingCardPage,
  FloatingCardPageBody,
  FloatingCardPageHeader,
  FloatingCardPageTitleRow,
} from "@/components/layout/floating-card-page";

const BulkOptimiseWorkspace = nextDynamic(
  () =>
    import("@/components/optimize/bulk-optimise-workspace").then(
      (mod) => mod.BulkOptimiseWorkspace,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export default function ProductsBulkOptimisePage() {
  return (
    <FloatingCardPage>
      <FloatingCardPageHeader>
        <FloatingCardPageTitleRow
          title="Optimise products"
          icon={Sparkles}
          actions={
            <Button variant="outline" size="sm" className="rounded-md" asChild>
              <Link href="/optimize">
                <ArrowLeft className="size-4" />
                Back to optimise
              </Link>
            </Button>
          }
        />
      </FloatingCardPageHeader>

      <FloatingCardPageBody>
        <FloatingCard className="border-gray-300">
          <BulkOptimiseWorkspace variant="products-card" />
        </FloatingCard>
      </FloatingCardPageBody>
    </FloatingCardPage>
  );
}

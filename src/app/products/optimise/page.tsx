"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { Loader2, Sparkles } from "lucide-react";
import { PageContainer, PageBody } from "@/components/dashboard";
import {
  storeSettingsPageChromeClass,
  storeSettingsPageHeaderNudgeClass,
} from "@/components/settings/actions-page-header";
import { cn } from "@/lib/utils";

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
    <PageContainer
      size="full"
      className="flex h-[calc(100svh-3.5rem)] min-h-0 flex-col !p-0 !pt-2.5 !pb-0"
    >
      <div className={cn("sticky top-0 z-30 w-full bg-white", storeSettingsPageChromeClass)}>
        <div className={cn(storeSettingsPageHeaderNudgeClass, "!pb-0")}>
          <div className="flex min-h-9 items-center justify-between gap-3">
            <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <Sparkles className="h-[18px] w-[18px] shrink-0 text-foreground" aria-hidden />
              Optimise products
            </h1>
          </div>
        </div>
      </div>

      <PageBody className="mt-1 flex min-h-0 flex-1 flex-col space-y-0 px-1.5">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-xl border border-gray-200/80 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <BulkOptimiseWorkspace variant="products-card" />
        </section>
      </PageBody>
    </PageContainer>
  );
}

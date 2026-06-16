"use client";

export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import * as React from "react";

import { PageContainer } from "@/components/dashboard";
import { ActionsSimpleBentoTable } from "@/components/settings/actions-simple-bento-table";
import { ActionsViewToggle, type ActionsViewMode } from "@/components/settings/actions-view-toggle";
import { DeputyRosterBento } from "@/components/settings/deputy-roster-bento";
import { EcommerceAgentBento } from "@/components/settings/ecommerce-agent-bento";
import {
  ActionsPageHeader,
  storeSettingsPageChromeClass,
} from "@/components/settings/actions-page-header";
import { MissingBrandsBento } from "@/components/settings/missing-brands-bento";
import { NestMessagesBento } from "@/components/settings/nest-messages-bento";
import { OverivewoTestBento } from "@/components/settings/overivewo-test-bento";
import { UncategorisedBento } from "@/components/settings/uncategorised-bento";
import { OverivewoBentoCarouselRow } from "@/components/settings/overivewo-bento-carousel-row";
import { cn } from "@/lib/utils";

function ActionsSection({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("w-full space-y-4", className)}>
      <div className="px-0.5">
        <h2 className="text-lg font-semibold tracking-tight text-gray-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function BentoActionsView() {
  return (
    <div className="mt-4 flex flex-col gap-8">
      <section className="w-full space-y-3">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="px-0.5">
              <h2 className="text-lg font-semibold tracking-tight text-gray-950">Customer enquiries</h2>
              <p className="mt-1 text-sm text-gray-600">
                Reply to emails and Nest messages without leaving the dashboard.
              </p>
            </div>
            <OverivewoBentoCarouselRow className="w-full max-w-none">
              <OverivewoTestBento variant="light-beige-floating" />
              <NestMessagesBento variant="light-beige-floating" />
            </OverivewoBentoCarouselRow>
          </div>

          <div className="w-full shrink-0 space-y-3 lg:w-[min(340px,calc(100vw-2rem))] lg:ml-auto">
            <div className="px-0.5">
              <h2 className="text-lg font-semibold tracking-tight text-gray-950">Roster</h2>
              <p className="mt-1 text-sm text-gray-600">Today’s shift coverage from Deputy.</p>
            </div>
            <DeputyRosterBento variant="light-beige-floating" />
          </div>
        </div>
      </section>

      <ActionsSection
        title="Lightspeed actions"
        description="Fix missing brands and assign categories from your Lightspeed catalog."
      >
        <OverivewoBentoCarouselRow className="w-full max-w-none">
          <MissingBrandsBento variant="light-beige-floating" />
          <UncategorisedBento variant="light-beige-floating" />
        </OverivewoBentoCarouselRow>
      </ActionsSection>

      <ActionsSection
        title="Ecommerce agent"
        description="Slow-moving stock and suggested clearance pricing."
        className="pb-2"
      >
        <div className="flex w-full justify-start">
          <EcommerceAgentBento variant="light-beige-floating" className="w-full max-w-[860px]" />
        </div>
      </ActionsSection>
    </div>
  );
}

function SimpleActionsView() {
  return (
    <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-6">
      <div className="min-w-0 flex-1">
        <ActionsSimpleBentoTable className="h-full" />
      </div>

      <div className="w-full shrink-0 space-y-3 lg:w-[min(340px,calc(100vw-2rem))]">
        <div className="px-0.5">
          <h2 className="text-lg font-semibold tracking-tight text-gray-950">Roster</h2>
          <p className="mt-1 text-sm text-gray-600">Today’s shift coverage from Deputy.</p>
        </div>
        <DeputyRosterBento
          variant="light-beige-floating"
          className="aspect-auto h-full min-h-[calc(100vh-7rem)] w-full max-w-none"
        />
      </div>
    </div>
  );
}

export default function StoreActionsPage() {
  const [view, setView] = React.useState<ActionsViewMode>("bento");

  return (
    <PageContainer size="full" className="!p-0 !pt-2.5 !pb-6">
      <div
        className={cn(
          "mx-auto flex w-full max-w-[1400px] flex-col",
          storeSettingsPageChromeClass,
        )}
      >
        <ActionsPageHeader
          trailingActions={<ActionsViewToggle view={view} onViewChange={setView} />}
        />

        {view === "bento" ? <BentoActionsView /> : <SimpleActionsView />}
      </div>
    </PageContainer>
  );
}

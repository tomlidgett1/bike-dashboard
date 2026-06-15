"use client";

export const dynamic = "force-dynamic";

import type { ReactNode } from "react";

import { PageContainer } from "@/components/dashboard";
import { DeputyRosterBento } from "@/components/settings/deputy-roster-bento";
import { EcommerceAgentBento } from "@/components/settings/ecommerce-agent-bento";
import { ActionsPageHeader } from "@/components/settings/actions-page-header";
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

export default function StoreActionsPage() {
  return (
    <PageContainer
      size="full"
      className="flex min-h-full items-start justify-center !pb-6 !pt-2.5 px-2 sm:px-3 lg:px-4"
    >
      <div className="flex w-full max-w-[1400px] flex-col gap-8">
        <ActionsPageHeader className="px-0.5" />

        <section className="w-full space-y-4">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
            <div className="min-w-0 flex-1 space-y-4">
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

            <div className="w-full shrink-0 space-y-4 lg:w-[min(340px,calc(100vw-2rem))] lg:ml-auto">
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
    </PageContainer>
  );
}

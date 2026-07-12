"use client";

export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import * as React from "react";
import dynamicImport from "next/dynamic";

import { Widget } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { ActionsSimpleBentoTable } from "@/components/settings/actions-simple-bento-table";
import { ActionsViewToggle, type ActionsViewMode } from "@/components/settings/actions-view-toggle";
import { storeSettingsPageChromeClass } from "@/components/settings/actions-page-header";
import { cn } from "@/lib/utils";

const DeputyRosterBento = dynamicImport(() =>
  import("@/components/settings/deputy-roster-bento").then((module) => module.DeputyRosterBento),
);
const EcommerceAgentBento = dynamicImport(() =>
  import("@/components/settings/ecommerce-agent-bento").then((module) => module.EcommerceAgentBento),
);
const MissingBrandsBento = dynamicImport(() =>
  import("@/components/settings/missing-brands-bento").then((module) => module.MissingBrandsBento),
);
const NestMessagesBento = dynamicImport(() =>
  import("@/components/settings/nest-messages-bento").then((module) => module.NestMessagesBento),
);
const OverivewoTestBento = dynamicImport(() =>
  import("@/components/settings/overivewo-test-bento").then((module) => module.OverivewoTestBento),
);
const UncategorisedBento = dynamicImport(() =>
  import("@/components/settings/uncategorised-bento").then((module) => module.UncategorisedBento),
);
const OverivewoBentoCarouselRow = dynamicImport(() =>
  import("@/components/settings/overivewo-bento-carousel-row").then(
    (module) => module.OverivewoBentoCarouselRow,
  ),
);

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
  return <ActionsSimpleBentoTable className="min-h-0 flex-1" />;
}

export default function StoreActionsPage() {
  const [view, setView] = React.useState<ActionsViewMode>("simple");
  const isSimple = view === "simple";

  return (
    <DashboardFloatingPage
      title="Actions"
      icon={Widget}
      flush
      actions={<ActionsViewToggle view={view} onViewChange={setView} />}
      cardClassName={isSimple ? undefined : "border-0 bg-transparent shadow-none"}
    >
      {isSimple ? (
        <SimpleActionsView />
      ) : (
        <div
          className={cn(
            "mx-auto flex w-full max-w-[1400px] flex-col",
            storeSettingsPageChromeClass,
          )}
        >
          <BentoActionsView />
        </div>
      )}
    </DashboardFloatingPage>
  );
}

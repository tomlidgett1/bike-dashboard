"use client";

export const dynamic = "force-dynamic";

import { PageContainer } from "@/components/dashboard";
import { DeputyRosterBento } from "@/components/settings/deputy-roster-bento";
import { EcommerceAgentBento } from "@/components/settings/ecommerce-agent-bento";
import { HomeGenieFloatingPrompt } from "@/components/settings/home-genie-floating-prompt";
import { MissingBrandsBento } from "@/components/settings/missing-brands-bento";
import { NestMessagesBento } from "@/components/settings/nest-messages-bento";
import { OverivewoTestBento } from "@/components/settings/overivewo-test-bento";
import { UncategorisedBento } from "@/components/settings/uncategorised-bento";
import { OverivewoBentoCarouselRow } from "@/components/settings/overivewo-bento-carousel-row";

export default function StoreOverivewoPage() {
  return (
    <PageContainer
      size="full"
      className="flex min-h-[calc(100svh-3rem)] items-start justify-center px-2 pt-4 sm:px-3 lg:px-4"
    >
      <div className="flex w-full flex-col items-center gap-8">
        <HomeGenieFloatingPrompt />

        <OverivewoBentoCarouselRow className="w-full max-w-none">
          <OverivewoTestBento variant="light-beige-floating" />
          <NestMessagesBento variant="light-beige-floating" />
          <DeputyRosterBento variant="light-beige-floating" />
          <MissingBrandsBento variant="light-beige-floating" />
        </OverivewoBentoCarouselRow>

        <div className="flex w-full flex-col items-center gap-6 px-2 pb-2 lg:flex-row lg:items-start lg:justify-center">
          <UncategorisedBento variant="light-beige-floating" />
          <EcommerceAgentBento variant="light-beige-floating" className="w-full max-w-[860px]" />
        </div>
      </div>
    </PageContainer>
  );
}

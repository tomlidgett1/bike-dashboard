"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MissingBrandsBento } from "@/components/settings/missing-brands-bento";
import { NestMessagesBento } from "@/components/settings/nest-messages-bento";
import { OverivewoBentoCarouselRow } from "@/components/settings/overivewo-bento-carousel-row";
import { OverivewoTestBento } from "@/components/settings/overivewo-test-bento";

const BENTO_CTA_LINK = "text-[#b07b00] transition-colors hover:text-[#8a6000]";

export function OverivewoShowcaseSection() {
  return (
    <div
      id="overivewo"
      className="relative overflow-hidden rounded-[20px] border border-black/[0.07] bg-[#f2f1ee]"
    >
      <div className="p-7 sm:p-8">
        <div className="max-w-[360px]">
          <h3 className="text-2xl font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
            Action cards on your shop home.
          </h3>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
            Overivewo surfaces what needs attention — customer enquiries, Nest messages, and missing
            brands — in swipeable cards your team can act on in seconds.
          </p>
          <Link
            href="/login"
            className={cn("group mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-medium", BENTO_CTA_LINK)}
          >
            See it in your dashboard
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-8 overflow-hidden rounded-[14px] bg-[#e4e0d8] p-4 sm:mt-10 sm:p-5">
          <OverivewoBentoCarouselRow className="w-full">
            <OverivewoTestBento variant="light-beige-floating" marketingPreview />
            <MissingBrandsBento variant="light-beige-floating" marketingPreview />
            <NestMessagesBento variant="light-beige-floating" />
          </OverivewoBentoCarouselRow>
        </div>
      </div>
    </div>
  );
}

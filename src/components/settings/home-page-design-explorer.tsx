"use client";

import * as React from "react";
import Link from "next/link";
import { NestLogo } from "@/components/genie/nest-logo";
import { InstagramLogo } from "@/components/genie/instagram-logo";
import { HomeV2MetricsCards } from "@/components/settings/homev2-metrics-cards";
import { buildCustomerEnquiriesNestUrl } from "@/lib/customer-inquiries/enquiries-deep-link";
import { cn } from "@/lib/utils";

const homeQuickActionClassName =
  "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400";

function HomePageQuickActions() {
  const sendMessageHref = buildCustomerEnquiriesNestUrl({ compose: true });
  const instagramCreateHref = "/settings/store/instagram?tab=create";

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Link href={sendMessageHref} className={homeQuickActionClassName}>
        <NestLogo className="size-[15px]" />
        Send message
      </Link>
      <Link href={instagramCreateHref} className={homeQuickActionClassName}>
        <InstagramLogo className="size-[15px] rounded-sm" />
        Create Instagram post
      </Link>
    </div>
  );
}

function WelcomeLine({
  todayLabel,
  className,
  dateClassName,
}: {
  todayLabel: string;
  className?: string;
  dateClassName?: string;
}) {
  return (
    <h1 className={cn("text-center font-semibold tracking-tight text-foreground", className)}>
      <span>Welcome,</span>{" "}
      <span className={dateClassName}>today is {todayLabel}</span>
    </h1>
  );
}

export function HomePageQuietLayout({
  todayLabel,
  input,
}: {
  todayLabel: string;
  input: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-12 sm:py-14">
      <WelcomeLine
        todayLabel={todayLabel}
        className="text-xl font-medium text-gray-800 sm:text-[1.375rem]"
        dateClassName="text-gray-500"
      />
      <div className="flex w-full min-w-0 max-w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          {input}
          <HomePageQuickActions />
        </div>
        <HomeV2MetricsCards tone="subtle" />
      </div>
    </div>
  );
}

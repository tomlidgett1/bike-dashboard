"use client";

import * as React from "react";
import { HomeV2MetricsCards } from "@/components/settings/homev2-metrics-cards";
import { cn } from "@/lib/utils";

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
  toolbar,
  input,
}: {
  todayLabel: string;
  toolbar: React.ReactNode;
  input: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-14 px-6 py-16 sm:py-20">
      <WelcomeLine
        todayLabel={todayLabel}
        className="text-xl font-medium text-gray-800 sm:text-[1.375rem]"
        dateClassName="text-gray-500"
      />
      <div className="w-full max-w-2xl">
        <HomeV2MetricsCards tone="subtle" />
      </div>
      <div className="w-full space-y-2.5">
        <div className="opacity-90">{toolbar}</div>
        {input}
      </div>
    </div>
  );
}

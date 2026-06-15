"use client";

import * as React from "react";
import { NestLogo } from "@/components/genie/nest-logo";
import {
  bentoCardShellClassName,
  bentoOuterWrapClassName,
  getBentoShellStyles,
  type BentoShellVariant,
} from "@/components/settings/bento-variant-styles";
import { cn } from "@/lib/utils";

export function NestSettingsBentoShell({
  title,
  description,
  variant = "light-beige-floating",
  className,
  children,
  icon,
}: {
  title: string;
  description?: string;
  variant?: BentoShellVariant;
  className?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const shell = getBentoShellStyles(variant);

  return (
    <div className={bentoCardShellClassName(cn("w-full max-w-none", className))}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div className="min-w-0 pr-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-[12px] leading-snug text-gray-500">{description}</p>
          ) : null}
        </div>
        {icon ?? <NestLogo className="mt-0.5 h-[20px] w-[20px] shrink-0" />}
      </div>

      <div className={bentoOuterWrapClassName(variant)}>
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", shell.panelClassName)}>
          <div className="flex min-h-0 flex-1 flex-col p-3 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import type { LucideIcon } from "@/components/layout/app-sidebar/dashboard-icons";
import { PageBody, PageContainer } from "@/components/dashboard";
import {
  floatingCardPageCardClass,
  floatingCardPageChromeClass,
  floatingCardPageContainerResetClass,
  floatingCardPageHeaderNudgeClass,
  floatingCardPageHeaderToCardGapClass,
  floatingCardPageTopInsetClass,
  floatingCardPageViewportClass,
} from "@/lib/layout/floating-card-page";
import { cn } from "@/lib/utils";

/** Full-height page shell — Products page blueprint. */
export function FloatingCardPage({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <PageContainer
      size="full"
      className={cn(
        floatingCardPageViewportClass,
        floatingCardPageContainerResetClass,
        floatingCardPageTopInsetClass,
        className,
      )}
    >
      {children}
    </PageContainer>
  );
}

/** Sticky white header band above the floating card. */
export function FloatingCardPageHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("sticky top-0 z-30 w-full bg-white", floatingCardPageChromeClass, className)}>
      <div className={floatingCardPageHeaderNudgeClass}>{children}</div>
    </div>
  );
}

/** Standard title + primary actions row (`min-h-9`). */
export function FloatingCardPageTitleRow({
  title,
  icon: Icon,
  actions,
}: {
  title: string;
  icon: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <Icon className="h-[18px] w-[18px] shrink-0 text-foreground" aria-hidden />
        {title}
      </h1>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Flex column between header and card; gap matches top inset. */
export function FloatingCardPageBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <PageBody
      className={cn(
        "flex min-h-0 flex-1 flex-col space-y-0",
        floatingCardPageHeaderToCardGapClass,
        className,
      )}
    >
      {children}
    </PageBody>
  );
}

/** Rounded top card shell — table, filters, and scrollable content go inside. */
export function FloatingCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={cn(floatingCardPageCardClass, className)}>{children}</section>;
}

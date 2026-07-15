import type { ReactNode } from "react";
import type { LucideIcon } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  FloatingCard,
  FloatingCardPage,
  FloatingCardPageBody,
  FloatingCardPageHeader,
  FloatingCardPageTitleRow,
} from "@/components/layout/floating-card-page";
import { cn } from "@/lib/utils";

export type DashboardFloatingPageProps = {
  title?: string;
  icon?: LucideIcon;
  /** Hide the sticky title row above the floating card (toolbar-only pages). */
  hideTitle?: boolean;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  /** Children fill the card without inner padding (tables, edge-to-edge content). */
  flush?: boolean;
  cardClassName?: string;
  scrollClassName?: string;
};

/** Standard dashboard page shell — Products / Landing blueprint. */
export function DashboardFloatingPage({
  title,
  icon,
  description,
  actions,
  toolbar,
  children,
  hideTitle = false,
  flush = false,
  cardClassName,
  scrollClassName,
}: DashboardFloatingPageProps) {
  const showToolbar = description != null || toolbar != null;
  const showTitleRow = !hideTitle && title != null && icon != null;

  return (
    <FloatingCardPage>
      {showTitleRow ? (
        <FloatingCardPageHeader>
          <FloatingCardPageTitleRow title={title} icon={icon} actions={actions} />
        </FloatingCardPageHeader>
      ) : null}
      <FloatingCardPageBody>
        <FloatingCard className={cn("flex min-h-0 flex-1 flex-col", cardClassName)}>
          {showToolbar ? (
            <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 bg-gray-50 px-4 py-3 md:px-5">
              {description != null ? (
                typeof description === "string" ? (
                  <p className="text-sm text-muted-foreground">{description}</p>
                ) : (
                  description
                )
              ) : null}
              {toolbar}
            </div>
          ) : null}
          <div className={cn("min-h-0 flex-1 overflow-y-auto", scrollClassName)}>
            {flush ? children : <div className="space-y-6 p-4 md:p-5">{children}</div>}
          </div>
        </FloatingCard>
      </FloatingCardPageBody>
    </FloatingCardPage>
  );
}

/** Flat section heading inside a floating card (no nested card chrome). */
export function DashboardFloatingSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

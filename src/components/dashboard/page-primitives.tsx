// ─────────────────────────────────────────────────────────────────────────────
// Page-level layout primitives — the shared frame for every dashboard page.
//
// Every page composes these so spacing, type scale and alignment are identical
// everywhere. Change it here → it changes everywhere.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { dashboardHorizontalPadding } from "@/lib/layout/dashboard-padding";
import { cn } from "@/lib/utils";

/**
 * Outer page wrapper. Controls horizontal rhythm + max reading width.
 * - "narrow"  → forms & settings (comfortable reading measure)
 * - "wide"    → data tables & dashboards (use the full canvas)
 * - "full"    → edge-to-edge tables (no max width cap)
 */
export function PageContainer({
  size = "narrow",
  className,
  children,
}: {
  size?: "narrow" | "wide" | "full";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full py-6 lg:py-8",
        dashboardHorizontalPadding,
        size === "narrow"
          ? "max-w-4xl"
          : size === "full"
            ? "max-w-none"
            : "max-w-[1400px]",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Standard page heading: title + description on the left, a slot for primary
 * actions on the right. Identical on every page.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/** Vertical stack used directly under a PageHeader to space out sections. */
export function PageBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mt-6 space-y-6", className)}>{children}</div>;
}

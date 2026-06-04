// ─────────────────────────────────────────────────────────────────────────────
// Settings primitives — the single pattern every settings panel is built from.
//
// The old dashboard had a different layout on every settings page. These
// components guarantee one consistent rhythm: a titled card, rows that align
// label/description on the left and the control on the right, and a footer
// for the save action.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/** A titled settings card. Optional icon + actions in the header, optional footer. */
export function SettingsSection({
  title,
  description,
  icon: Icon,
  headerAction,
  footer,
  className,
  contentClassName,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-6 py-4">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground">
              <Icon className="size-4" />
            </div>
          ) : null}
          <div className="space-y-1">
            <h3 className="font-heading text-base font-semibold leading-none text-foreground">
              {title}
            </h3>
            {description ? (
              <p className="text-sm leading-snug text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      <div className={cn("px-6 py-5", contentClassName)}>{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/30 px-6 py-3">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * One labelled row inside a SettingsSection. Label + helper text on the left,
 * control on the right. Use `align="start"` for tall controls.
 */
export function SettingsRow({
  label,
  description,
  htmlFor,
  control,
  align = "center",
  className,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  control: React.ReactNode;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-6",
        align === "center" ? "sm:items-center" : "sm:items-start",
        className
      )}
    >
      <div className="space-y-0.5">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium leading-none text-foreground"
        >
          {label}
        </label>
        {description ? (
          <p className="text-[13px] leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 sm:min-w-[240px] sm:max-w-[360px]">{control}</div>
    </div>
  );
}

/** Hairline divider used between SettingsRows. */
export function SettingsDivider({ className }: { className?: string }) {
  return <div className={cn("-mx-6 my-5 h-px bg-border/60", className)} />;
}

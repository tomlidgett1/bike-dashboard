"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, X } from "lucide-react";
import { SlidingNavTabs } from "@/components/layout/sliding-nav-tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { NestWorkspaceTab } from "@/lib/nest/nest-workspace-types";

export const dropdownTransition = {
  duration: 0.4,
  ease: [0.04, 0.62, 0.23, 0.98] as const,
};

type WorkspaceTabItem = {
  id: NestWorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function WorkspaceTabs({
  items,
  value,
  onChange,
}: {
  items: readonly WorkspaceTabItem[];
  value: NestWorkspaceTab;
  onChange: (value: NestWorkspaceTab) => void;
}) {
  return (
    <SlidingNavTabs
      items={items}
      value={value}
      onChange={onChange}
      layoutId="nest-workspace-tabs"
    />
  );
}

export function WorkspaceDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="animate-in fade-in duration-200 data-open:duration-200"
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-xl border border-gray-200 bg-white p-0 shadow-xl ring-0 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out data-open:duration-300 sm:max-w-xl [&_button]:rounded-lg [&_input]:rounded-lg [&_textarea]:rounded-lg",
          className,
        )}
      >
        <DialogHeader className="relative border-b border-gray-100 px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-base font-semibold text-gray-900">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="text-sm leading-relaxed text-gray-500">
              {description}
            </DialogDescription>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function CollapsiblePanel({
  title,
  description,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{title}</span>
            {badge ? (
              <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {badge}
              </span>
            ) : null}
          </span>
          {description ? (
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={dropdownTransition}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 py-4">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function WorkspaceNotice({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        {children ? (
          <div className="mt-0.5 text-xs leading-relaxed text-gray-500">
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function BusyLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      {children}
    </span>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="text-sm font-medium text-gray-800">{children}</span>
      {hint ? (
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function formatWorkspaceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

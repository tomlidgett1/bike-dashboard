"use client";

import * as React from "react";
import { Loader2, Search } from "@/components/layout/app-sidebar/dashboard-icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Underline workflow tabs (Photos / Copy / CSV/Image). */
export function OptimiseWorkflowTabs({
  items,
  activeId,
  onChange,
}: {
  items: {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="border-b border-border/60">
      <nav className="-mb-px flex flex-wrap gap-6" aria-label="Optimise workflows">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** Toolbar row: category, filters, search — no card wrapper. */
export function OptimiseToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function OptimiseSegmentedControl<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (id: T) => void;
  items: { id: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center bg-gray-100 p-0.5 rounded-full w-fit", className)}>
      {items.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
            value === tab.id
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span className="tabular-nums text-[10px] opacity-70">({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function OptimiseSearchInput({
  value,
  onChange,
  placeholder = "Search products…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 w-full sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border-border/60 bg-background pl-9 pr-14"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
        ⌘K
      </kbd>
    </div>
  );
}

/** Select-all row + primary actions — divider only. */
export function OptimiseBulkBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3">
      {children}
    </div>
  );
}

/** Product rows separated by dividers, no outer card. */
export function OptimiseList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border/60">{children}</div>;
}

export function OptimiseCenteredState({
  children,
  className,
  onClick,
  role,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  role?: React.AriaRole;
}) {
  return (
    <div
      role={role}
      onClick={onClick}
      className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}
    >
      {children}
    </div>
  );
}

export function OptimiseLoadingState({ label }: { label?: string }) {
  return (
    <OptimiseCenteredState>
      <Loader2 className="size-7 animate-spin text-muted-foreground" />
      {label && <p className="mt-3 text-sm text-muted-foreground">{label}</p>}
    </OptimiseCenteredState>
  );
}

/** Secondary toolbar strip (e.g. copy field toggles) without a card. */
export function OptimiseSubToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      {children}
    </div>
  );
}

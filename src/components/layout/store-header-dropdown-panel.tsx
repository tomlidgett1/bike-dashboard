"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { isStoreDashboardPath } from "@/lib/routes/store-dashboard";
import { cn } from "@/lib/utils";

/** Matches FloatingGenieJobsPill popup card shell */
export const storeHeaderDropdownContentClass =
  "w-[min(100vw-2rem,22rem)] overflow-hidden rounded-[28px] border border-gray-200 bg-white p-0 text-gray-800 shadow-xl ring-0";

export function useStoreHeaderDropdownStyle() {
  const pathname = usePathname();
  return isStoreDashboardPath(pathname);
}

export function StoreHeaderDropdownHeader({
  title,
  actions,
  subtitle,
}: {
  title: string;
  actions?: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="px-5 pb-2 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {actions}
      </div>
      {subtitle}
    </div>
  );
}

export function StoreHeaderDropdownBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-h-[50vh] overflow-y-auto border-t border-gray-100 sm:max-h-[400px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StoreHeaderDropdownFooter({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-gray-100 px-5 py-3">{children}</div>;
}

export function StoreHeaderDropdownItem({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "w-full border-b border-gray-100 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-gray-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StoreHeaderDropdownEmpty({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <Icon className="mx-auto mb-2 h-7 w-7 text-gray-400" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

export function StoreHeaderDropdownFooterAction({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "w-full text-xs font-medium text-gray-500 transition hover:text-gray-800",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

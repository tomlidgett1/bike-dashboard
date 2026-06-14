"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function BentoInboxDismissButton({
  onDismiss,
  ignoring = false,
}: {
  onDismiss: () => void;
  ignoring?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      disabled={ignoring}
      aria-label="Dismiss"
      className={cn(
        "absolute bottom-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-md text-gray-300 opacity-0 transition-all duration-200",
        "pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100",
        "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        "hover:bg-gray-100 hover:text-gray-500 focus-visible:pointer-events-auto focus-visible:opacity-100",
        ignoring && "!opacity-0",
      )}
    >
      <X className="h-3 w-3" strokeWidth={2} />
    </button>
  );
}

export function BentoInboxPrimaryButton({
  label,
  onClick,
  ignoring = false,
  className,
}: {
  label: string;
  onClick: () => void;
  ignoring?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ignoring}
      className={cn(
        "mt-0.5 shrink-0 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40",
        className,
      )}
    >
      {label}
    </button>
  );
}

export function BentoInboxEmptyState({ message = "You're all caught up." }: { message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <p className="text-[12px] font-medium text-gray-500">{message}</p>
      <p className="mt-1 text-[11px] text-gray-400">Nothing needs your attention right now.</p>
    </div>
  );
}

export function useDismissibleIds() {
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(() => new Set());
  const [ignoringId, setIgnoringId] = React.useState<string | null>(null);

  function isDismissed(id: string) {
    return dismissedIds.has(id);
  }

  function dismiss(id: string) {
    if (dismissedIds.has(id)) return;
    setIgnoringId(id);
    window.setTimeout(() => {
      setDismissedIds((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
      setIgnoringId((current) => (current === id ? null : current));
    }, 280);
  }

  return { dismissedIds, ignoringId, isDismissed, dismiss };
}

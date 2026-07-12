"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Pencil, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import { cn } from "@/lib/utils";

export type LightspeedActionPreview = {
  key: string;
  kind: "missing-brand" | "assign-category";
  title: string;
  subtitle: string;
  suggestionLabel: string | null;
};

export const SAMPLE_LIGHTSPEED_ACTION: LightspeedActionPreview = {
  key: "sample:missing-brand",
  kind: "missing-brand",
  title: "Trek Domane AL 2 Disc",
  subtitle: "TDAL2-56",
  suggestionLabel: "Trek",
};

const TYPE_COPY: Record<
  LightspeedActionPreview["kind"],
  { label: string; changeLabel: string; emptySuggestion: string }
> = {
  "missing-brand": {
    label: "Missing brand",
    changeLabel: "Change brand",
    emptySuggestion: "No brand suggested yet",
  },
  "assign-category": {
    label: "Assign category",
    changeLabel: "Change category",
    emptySuggestion: "No category suggested yet",
  },
};

type LightspeedActionRequiredPopupProps = {
  open: boolean;
  action: LightspeedActionPreview | null;
  onClose: () => void;
  onApprove?: (action: LightspeedActionPreview) => void;
  onReject?: (action: LightspeedActionPreview) => void;
  onChange?: (action: LightspeedActionPreview) => void;
};

export function LightspeedActionRequiredPopup({
  open,
  action,
  onClose,
  onApprove,
  onReject,
  onChange,
}: LightspeedActionRequiredPopupProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted || !open || !action) return null;

  const copy = TYPE_COPY[action.kind];

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div
        className="pointer-events-auto absolute inset-0 bg-black/10 animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Action required"
        className={cn(
          "pointer-events-auto absolute bottom-6 right-6 mb-[env(safe-area-inset-bottom)]",
          "w-[min(100vw-2rem,22rem)] overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-xl ring-1 ring-black/5",
          "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 ring-1 ring-gray-200/80">
              <LightspeedLogo className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Action required</p>
              <p className="truncate text-xs text-gray-500">{copy.label}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-4 pt-1">
          <div className="rounded-md border border-gray-200 bg-white px-3.5 py-3">
            <p className="truncate text-sm font-medium text-gray-900">{action.title}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">{action.subtitle}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                {copy.label}
              </span>
              {action.suggestionLabel ? (
                <span className="truncate text-xs text-gray-700">
                  Suggested: <span className="font-medium text-gray-900">{action.suggestionLabel}</span>
                </span>
              ) : (
                <span className="truncate text-xs text-gray-400">{copy.emptySuggestion}</span>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onApprove?.(action)}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#ffde59] px-3 text-xs font-medium text-gray-900 shadow-sm transition-colors hover:bg-[#f0cf45]"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              type="button"
              onClick={() => onReject?.(action)}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              Reject
            </button>
          </div>

          <button
            type="button"
            onClick={() => onChange?.(action)}
            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <Pencil className="h-3.5 w-3.5" />
            {action.suggestionLabel ? copy.changeLabel : action.kind === "missing-brand" ? "Add brand" : "Assign category"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

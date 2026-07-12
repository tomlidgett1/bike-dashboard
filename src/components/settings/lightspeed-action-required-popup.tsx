"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import type { LightspeedCategoryOption } from "@/lib/missing-categories/types";
import { playSuccessSound } from "@/lib/ui/play-success-sound";
import { cn } from "@/lib/utils";

export type LightspeedActionPreview = {
  key: string;
  kind: "missing-brand" | "assign-category";
  title: string;
  subtitle: string;
  suggestionLabel: string | null;
  suggestionId?: string | null;
};

export const SAMPLE_LIGHTSPEED_ACTION: LightspeedActionPreview = {
  key: "sample:missing-brand",
  kind: "missing-brand",
  title: "Trek Domane AL 2 Disc",
  subtitle: "TDAL2-56",
  suggestionLabel: "Trek",
  suggestionId: null,
};

const TYPE_COPY: Record<
  LightspeedActionPreview["kind"],
  {
    badge: string;
    changeLabel: string;
    assignLabel: string;
    emptyCopy: string;
    fieldLabel: string;
    fieldPlaceholder: string;
  }
> = {
  "missing-brand": {
    badge: "Missing brand",
    changeLabel: "Change brand",
    assignLabel: "Add brand",
    emptyCopy: "No brand proposed yet",
    fieldLabel: "Brand",
    fieldPlaceholder: "Enter brand…",
  },
  "assign-category": {
    badge: "Missing category",
    changeLabel: "Change category",
    assignLabel: "Assign category",
    emptyCopy: "No category proposed yet",
    fieldLabel: "Category",
    fieldPlaceholder: "Select a category…",
  },
};

const POPUP_SPRING = {
  type: "spring" as const,
  damping: 18,
  stiffness: 320,
  mass: 0.78,
};

type LightspeedActionRequiredPopupProps = {
  open: boolean;
  action: LightspeedActionPreview | null;
  categories?: LightspeedCategoryOption[];
  categoriesLoading?: boolean;
  onRequestCategories?: () => void;
  onClose: () => void;
  onApprove?: (action: LightspeedActionPreview) => void;
  onReject?: (action: LightspeedActionPreview) => void;
};

export function LightspeedActionRequiredPopup({
  open,
  action,
  categories = [],
  categoriesLoading = false,
  onRequestCategories,
  onClose,
  onApprove,
  onReject,
}: LightspeedActionRequiredPopupProps) {
  const [mounted, setMounted] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState("");
  const [draftId, setDraftId] = React.useState<string | null>(null);
  const [proposal, setProposal] = React.useState<string | null>(null);
  const [proposalId, setProposalId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selectRef = React.useRef<HTMLSelectElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open || !action) {
      setEditing(false);
      setDraftValue("");
      setDraftId(null);
      setProposal(null);
      setProposalId(null);
      return;
    }
    setEditing(false);
    setProposal(action.suggestionLabel);
    setProposalId(action.suggestionId ?? null);
    setDraftValue(action.suggestionLabel ?? "");
    setDraftId(action.suggestionId ?? null);
  }, [open, action]);

  React.useEffect(() => {
    if (!editing || !action) return;
    if (action.kind === "assign-category") {
      onRequestCategories?.();
      const frame = window.requestAnimationFrame(() => selectRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [editing, action, onRequestCategories]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (editing) {
          setEditing(false);
          setDraftValue(proposal ?? "");
          setDraftId(proposalId);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, editing, proposal, proposalId]);

  if (!mounted) return null;

  const copy = action ? TYPE_COPY[action.kind] : null;
  const hasProposal = Boolean(proposal?.trim());
  const canSave =
    action?.kind === "assign-category"
      ? Boolean(draftId?.trim())
      : Boolean(draftValue.trim());

  function startEditing() {
    setDraftValue(proposal ?? "");
    setDraftId(proposalId);
    setEditing(true);
    if (action?.kind === "missing-brand") {
      void playSuccessSound();
    }
  }

  function saveDraft() {
    if (!action) return;

    if (action.kind === "assign-category") {
      const selected = categories.find((category) => category.categoryId === draftId);
      if (!selected) return;
      setProposal(selected.label);
      setProposalId(selected.categoryId);
      setEditing(false);
      return;
    }

    const next = draftValue.trim();
    if (!next) return;
    setProposal(next);
    setProposalId(null);
    setEditing(false);
  }

  return createPortal(
    <AnimatePresence>
      {open && action && copy ? (
        <div key={action.key} className="pointer-events-none fixed inset-0 z-[80]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-auto absolute inset-0 bg-black/10"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Action required"
            initial={{ opacity: 0, y: 42, scale: 0.86 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.92 }}
            transition={POPUP_SPRING}
            className={cn(
              "pointer-events-auto absolute bottom-6 right-6 mb-[env(safe-area-inset-bottom)]",
              "w-[min(100vw-2rem,22rem)] origin-bottom-right bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.12)]",
              "rounded-[28px] border border-black/5",
            )}
            style={{ transformOrigin: "bottom right" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <LightspeedLogo className="h-7 w-7 shrink-0" />
                <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">
                  Action required
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-0.5 shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <span className="mt-4 inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
              {copy.badge}
            </span>

            <p className="mt-4 text-[15px] font-medium leading-snug text-foreground">
              {action.title}
            </p>
            {action.subtitle ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{action.subtitle}</p>
            ) : null}

            {editing ? null : hasProposal ? (
              <div className="mt-4">
                <p className="font-display text-xl font-semibold leading-snug tracking-[-0.02em] text-foreground">
                  {action.kind === "missing-brand"
                    ? `Set the brand to ${proposal}?`
                    : `Set the category to ${proposal}?`}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{copy.emptyCopy}</p>
            )}

            <AnimatePresence initial={false} mode="wait">
              {editing ? (
                <motion.div
                  key="edit"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: 0.4,
                    ease: [0.04, 0.62, 0.23, 0.98],
                  }}
                  className="overflow-hidden"
                >
                  <div className="mt-4">
                    <label
                      htmlFor={`action-required-${action.key}`}
                      className="text-xs text-muted-foreground"
                    >
                      {copy.fieldLabel}
                    </label>

                    {action.kind === "assign-category" ? (
                      <div className="relative mt-1.5">
                        <select
                          ref={selectRef}
                          id={`action-required-${action.key}`}
                          value={draftId ?? ""}
                          onChange={(event) => {
                            const nextId = event.target.value;
                            setDraftId(nextId || null);
                            const selected = categories.find(
                              (category) => category.categoryId === nextId,
                            );
                            setDraftValue(selected?.label ?? "");
                          }}
                          disabled={categoriesLoading}
                          className="h-10 w-full appearance-none rounded-md border border-gray-200 bg-white py-2 pl-3 pr-9 text-sm outline-none transition-colors focus:border-gray-400 disabled:opacity-60"
                        >
                          <option value="" disabled>
                            {categoriesLoading
                              ? "Loading Lightspeed categories…"
                              : copy.fieldPlaceholder}
                          </option>
                          {categories.map((category) => (
                            <option key={category.categoryId} value={category.categoryId}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    ) : (
                      <input
                        ref={inputRef}
                        id={`action-required-${action.key}`}
                        type="text"
                        value={draftValue}
                        onChange={(event) => setDraftValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveDraft();
                          }
                        }}
                        placeholder={copy.fieldPlaceholder}
                        className="mt-1.5 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-gray-400"
                      />
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={saveDraft}
                        disabled={!canSave || (action.kind === "assign-category" && categoriesLoading)}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-[#ffde59] text-sm font-medium text-gray-900 transition-colors hover:bg-[#f0cf45] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(false);
                          setDraftValue(proposal ?? "");
                          setDraftId(proposalId);
                        }}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-200/80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="view"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: 0.4,
                    ease: [0.04, 0.62, 0.23, 0.98],
                  }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onApprove?.({
                          ...action,
                          suggestionLabel: proposal,
                          suggestionId: proposalId,
                        })
                      }
                      disabled={!hasProposal}
                      className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-[#ffde59] text-sm font-medium text-gray-900 transition-colors hover:bg-[#f0cf45] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {hasProposal ? "Yes" : "Approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject?.(action)}
                      className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-200/80"
                    >
                      {hasProposal ? "No" : "Reject"}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={startEditing}
                    className="mt-3 w-full text-center text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
                  >
                    {hasProposal ? copy.changeLabel : copy.assignLabel}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

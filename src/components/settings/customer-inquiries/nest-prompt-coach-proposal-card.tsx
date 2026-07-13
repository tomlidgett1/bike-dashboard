"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Loader2,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  coachFieldLabel,
  type CoachConfigField,
  type PromptCoachProposal,
} from "@/lib/nest/prompt-coach-types";
import { cn } from "@/lib/utils";

function statusLabel(status: PromptCoachProposal["status"]): string {
  if (status === "contradiction") return "Conflict";
  if (status === "duplicate") return "Already covered";
  return "Ready";
}

function operationLabel(proposal: PromptCoachProposal): string {
  if (proposal.operation === "delete") return "Remove";
  if (proposal.operation === "replace") return "Replace";
  if (proposal.operation === "append") return "Add to";
  return "Add";
}

function destinationLabel(proposal: PromptCoachProposal): string {
  if (proposal.target === "knowledge") {
    return proposal.title?.trim() || "Knowledge base";
  }
  return coachFieldLabel(proposal.field as CoachConfigField | null | undefined);
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function NestPromptCoachProposalCard({
  proposal,
  busy,
  onConfirm,
  onCancel,
}: {
  proposal: PromptCoachProposal;
  busy?: boolean;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const needsForce =
    proposal.status === "contradiction" || proposal.status === "duplicate";
  const primaryLabel =
    proposal.operation === "delete"
      ? "Remove this"
      : needsForce
        ? "Replace existing"
        : proposal.operation === "replace"
          ? "Replace this"
          : "Add this";

  const removeText =
    proposal.operation === "delete"
      ? proposal.currentSnippet || proposal.title || "This knowledge entry"
      : proposal.conflictingLine ||
        (proposal.operation === "replace" ? proposal.currentSnippet : null);

  const addText =
    proposal.operation === "delete"
      ? null
      : proposal.proposedSnippet && !sameText(proposal.proposedSnippet, removeText)
        ? proposal.proposedSnippet
        : proposal.operation === "append" || proposal.operation === "add"
          ? proposal.proposedSnippet
          : null;

  const showConflict = Boolean(removeText) && proposal.status === "contradiction";
  const showRemoving =
    Boolean(removeText) && !showConflict && proposal.operation !== "append" && proposal.operation !== "add";

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-gray-200/80 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{proposal.summary}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {operationLabel(proposal)} · {destinationLabel(proposal)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
            proposal.status === "ready"
              ? "border-gray-200 bg-gray-50 text-gray-600"
              : "border-gray-300 bg-white text-gray-700",
          )}
        >
          {statusLabel(proposal.status)}
        </span>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        {showConflict ? (
          <div className="rounded-md border border-gray-200 bg-white px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Conflicts with
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-700">{removeText}</p>
          </div>
        ) : null}

        {showRemoving ? (
          <div className="rounded-md border border-gray-200 bg-white px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              {proposal.operation === "delete" ? "Will remove" : "Remove"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-700">{removeText}</p>
          </div>
        ) : null}

        {addText ? (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              {showConflict || showRemoving ? "Change to" : "Will add"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-800">{addText}</p>
          </div>
        ) : null}

        {!showConflict && !showRemoving && !addText ? (
          <p className="text-xs text-gray-500">{proposal.summary}</p>
        ) : null}

        {proposal.mergedValue?.trim() ? (
          <div className="rounded-md border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-medium text-gray-700"
              aria-expanded={detailsOpen}
            >
              Review the complete saved wording
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-gray-400 transition-transform duration-200",
                  detailsOpen && "rotate-180",
                )}
              />
            </button>
            <AnimatePresence>
              {detailsOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: 0.4,
                    ease: [0.04, 0.62, 0.23, 0.98],
                  }}
                  className="overflow-hidden"
                >
                  <p className="border-t border-gray-100 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap text-gray-700">
                    {proposal.mergedValue}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}

        <p className="text-xs text-gray-500">
          Do you want to apply this change to Nest?
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-3.5 py-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(needsForce)}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Clock3, ShieldCheck, X } from "lucide-react";
import { CustomerChip } from "@/components/crm/primitives/customer-chip";
import {
  actionCustomerId,
  actionCustomerName,
  actionDecisions,
  actionDueAt,
  actionRiskTier,
  actionSummary,
  actionTitle,
  formatCrmDateTime,
  type CrmAction,
} from "@/components/crm/types";
import { cn } from "@/lib/utils";

type Decision = "approve" | "dismiss" | "snooze";

function tomorrowMorningValue(): string {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(9, 0, 0, 0);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export function ActionCard({
  action,
  rank,
  busy = false,
  defaultOpen = false,
  onDecision,
  className,
}: {
  action: CrmAction;
  rank?: number;
  busy?: boolean;
  defaultOpen?: boolean;
  onDecision: (decision: Decision, snoozeUntil?: string) => void | Promise<void>;
  className?: string;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const [snoozeOpen, setSnoozeOpen] = React.useState(false);
  const [snoozeAt, setSnoozeAt] = React.useState(tomorrowMorningValue);
  const headingId = React.useId();
  const decisions = actionDecisions(action);
  const summary = actionSummary(action);
  const customerId = actionCustomerId(action);
  const customerName = actionCustomerName(action);
  const dueAt = actionDueAt(action);
  const proposal = "proposal" in action ? action.proposal : null;
  const proposedMessage = proposal
    ? String(proposal.message ?? proposal.body ?? proposal.content ?? "").trim()
    : "";
  const decisionReason = "decisionReason" in action ? action.decisionReason : null;

  React.useEffect(() => {
    if (!snoozeOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setSnoozeOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, snoozeOpen]);

  const submitSnooze = () => {
    const parsed = new Date(snoozeAt);
    if (Number.isNaN(parsed.getTime())) return;
    void onDecision("snooze", parsed.toISOString());
    setSnoozeOpen(false);
  };

  return (
    <>
      <article
        className={cn(
          "rounded-md bg-white ring-1 ring-inset ring-gray-200 transition-shadow hover:shadow-sm",
          className,
        )}
      >
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-md p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400"
          onClick={() => setIsOpen((value) => !value)}
          aria-expanded={isOpen}
          aria-controls={`${headingId}-details`}
        >
          {rank ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold tabular-nums text-gray-600">
              {rank}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span id={headingId} className="block text-sm font-semibold text-gray-900">
              {actionTitle(action)}
            </span>
            {summary ? (
              <span className="mt-1 line-clamp-2 block text-sm leading-5 text-gray-600">
                {summary}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          {customerId || customerName ? (
            <CustomerChip
              customerId={customerId}
              name={customerName}
              compact
              className="mr-auto"
            />
          ) : (
            <span className="mr-auto text-xs text-gray-400">No customer linked</span>
          )}
          <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[11px] font-medium capitalize text-gray-600 ring-1 ring-inset ring-gray-200">
            <ShieldCheck className="h-3 w-3 text-gray-400" aria-hidden />
            {actionRiskTier(action)} risk
          </span>
          {dueAt ? (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <Clock3 className="h-3 w-3" aria-hidden />
              {formatCrmDateTime(dueAt)}
            </span>
          ) : null}
        </div>

        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              id={`${headingId}-details`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                duration: 0.4,
                ease: [0.04, 0.62, 0.23, 0.98],
              }}
              className="overflow-hidden"
            >
              <div className="border-t border-gray-100 px-4 py-3">
                {decisionReason ? (
                  <div className="rounded-md bg-gray-50 p-3 ring-1 ring-inset ring-gray-200">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                      Why now
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-700">{decisionReason}</p>
                  </div>
                ) : null}
                {proposedMessage ? (
                  <div className="mt-3 rounded-md bg-white p-3 ring-1 ring-inset ring-gray-200">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                      Exact message
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                      {proposedMessage}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-gray-500">
                    Review this recommendation before approving it. Dismiss it if it is no
                    longer relevant, or snooze it for later.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {decisions.includes("dismiss") ? (
                    <button
                      type="button"
                      onClick={() => void onDecision("dismiss")}
                      disabled={busy}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Dismiss
                    </button>
                  ) : null}
                  {decisions.includes("snooze") ? (
                    <button
                      type="button"
                      onClick={() => setSnoozeOpen(true)}
                      disabled={busy}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
                    >
                      <Clock3 className="h-3.5 w-3.5" aria-hidden />
                      Snooze
                    </button>
                  ) : null}
                  {decisions.includes("approve") ? (
                    <button
                      type="button"
                      onClick={() => void onDecision("approve")}
                      disabled={busy}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      {busy ? "Updating…" : "Approve"}
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </article>

      {snoozeOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close snooze dialog"
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
            onClick={() => !busy && setSnoozeOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${headingId}-snooze-title`}
            className="relative z-10 w-full max-w-md rounded-md border border-gray-200 bg-white p-5 shadow-xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
          >
            <h2 id={`${headingId}-snooze-title`} className="text-base font-semibold text-gray-900">
              Snooze this action
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Choose when this action should return to Today.
            </p>
            <label className="mt-4 block text-xs font-medium text-gray-700" htmlFor={`${headingId}-snooze-at`}>
              Return date and time
            </label>
            <input
              id={`${headingId}-snooze-at`}
              type="datetime-local"
              value={snoozeAt}
              onChange={(event) => setSnoozeAt(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSnoozeOpen(false)}
                className="h-9 rounded-md bg-white px-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitSnooze}
                className="h-9 rounded-md bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
              >
                Snooze
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

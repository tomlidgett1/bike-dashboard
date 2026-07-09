"use client";

import * as React from "react";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { NestLogo } from "@/components/genie/nest-logo";
import { NestPromptCoachProposalCard } from "@/components/settings/customer-inquiries/nest-prompt-coach-proposal-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
import type {
  PromptCoachProposal,
  PromptCoachUndoSnapshot,
} from "@/lib/nest/prompt-coach-types";
import { cn } from "@/lib/utils";

type CoachTurn = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  proposals?: PromptCoachProposal[];
  proposalStates?: Record<
    string,
    "pending" | "applied" | "cancelled" | "error" | "undone"
  >;
  proposalErrors?: Record<string, string>;
  undoByProposal?: Record<string, PromptCoachUndoSnapshot>;
};

const STARTERS = [
  "Wrong hours — we close at 6, not 5",
  "Stop promising free shipping",
  "Add our service booking policy",
  "The bot quoted the wrong price",
] as const;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ShimmerLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className={genieProgressShimmerClassName} style={genieProgressShimmerStyle}>
      {children}
    </span>
  );
}

export function NestPromptCoachSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [turns, setTurns] = React.useState<CoachTurn[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);
  const [undoingId, setUndoingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, sending, applyingId, undoingId]);

  const historyForApi = React.useMemo(
    () =>
      turns
        .filter((turn) => turn.role === "user" || turn.role === "assistant")
        .map((turn) => ({ role: turn.role as "user" | "assistant", text: turn.text })),
    [turns],
  );

  async function sendMessage(raw: string) {
    const message = raw.trim();
    if (!message || sending) return;

    setError(null);
    setInput("");
    const userTurn: CoachTurn = { id: newId(), role: "user", text: message };
    setTurns((prev) => [...prev, userTurn]);
    setSending(true);

    try {
      const res = await fetch("/api/store/nest-prompt-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          message,
          chatHistory: historyForApi,
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        followUp?: string | null;
        proposals?: PromptCoachProposal[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not reach Nest Prompt Coach.");
      }

      const replyParts = [data.reply?.trim(), data.followUp?.trim()].filter(Boolean);
      const proposals = Array.isArray(data.proposals) ? data.proposals : [];
      const proposalStates: CoachTurn["proposalStates"] = {};
      for (const proposal of proposals) {
        proposalStates![proposal.id] = "pending";
      }

      setTurns((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: replyParts.join(" ") || "Here’s what I suggest.",
          proposals,
          proposalStates,
          proposalErrors: {},
          undoByProposal: {},
        },
      ]);
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError(messageText);
      setTurns((prev) => [
        ...prev,
        {
          id: newId(),
          role: "system",
          text: messageText,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function applyProposal(
    turnId: string,
    proposal: PromptCoachProposal,
    force: boolean,
  ) {
    if (applyingId || undoingId) return;
    setApplyingId(proposal.id);
    setError(null);

    try {
      const res = await fetch("/api/store/nest-prompt-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          force,
          proposals: [proposal],
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reply?: string;
        applied?: Array<{
          id: string;
          ok: boolean;
          summary: string;
          error?: string;
          undo?: PromptCoachUndoSnapshot;
        }>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not apply this change.");
      }

      const result = data.applied?.[0];
      const ok = result?.ok ?? data.ok === true;

      setTurns((prev) => {
        const next: CoachTurn[] = prev.map((turn) => {
          if (turn.id !== turnId) return turn;
          const nextState: "applied" | "error" = ok ? "applied" : "error";
          return {
            ...turn,
            proposalStates: {
              ...turn.proposalStates,
              [proposal.id]: nextState,
            },
            proposalErrors: {
              ...turn.proposalErrors,
              ...(ok ? {} : { [proposal.id]: result?.error || "Could not apply." }),
            },
            undoByProposal: {
              ...turn.undoByProposal,
              ...(ok && result?.undo ? { [proposal.id]: result.undo } : {}),
            },
          };
        });
        return next;
      });
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : "Could not apply this change.";
      setTurns((prev) =>
        prev.map((turn) => {
          if (turn.id !== turnId) return turn;
          return {
            ...turn,
            proposalStates: {
              ...turn.proposalStates,
              [proposal.id]: "error",
            },
            proposalErrors: {
              ...turn.proposalErrors,
              [proposal.id]: messageText,
            },
          };
        }),
      );
    } finally {
      setApplyingId(null);
    }
  }

  async function undoProposal(turnId: string, proposalId: string) {
    if (applyingId || undoingId) return;
    const turn = turns.find((item) => item.id === turnId);
    const undo = turn?.undoByProposal?.[proposalId];
    if (!undo) return;

    setUndoingId(proposalId);
    setError(null);

    try {
      const res = await fetch("/api/store/nest-prompt-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo", undo }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reply?: string;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || data.reply || "Could not undo this change.");
      }

      setTurns((prev) =>
        prev.map((item) => {
          if (item.id !== turnId) return item;
          const nextUndo = { ...item.undoByProposal };
          delete nextUndo[proposalId];
          return {
            ...item,
            proposalStates: {
              ...item.proposalStates,
              [proposalId]: "undone",
            },
            undoByProposal: nextUndo,
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo this change.");
    } finally {
      setUndoingId(null);
    }
  }

  function cancelProposal(turnId: string, proposalId: string) {
    setTurns((prev) =>
      prev.map((turn) => {
        if (turn.id !== turnId) return turn;
        return {
          ...turn,
          proposalStates: {
            ...turn.proposalStates,
            [proposalId]: "cancelled",
          },
        };
      }),
    );
  }

  const empty = turns.length === 0 && !sending;
  const busy = sending || Boolean(applyingId) || Boolean(undoingId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className={cn(
          "flex h-full w-full flex-col gap-0 border-l border-gray-200/80 bg-white p-0 sm:max-w-[420px]",
          "data-open:duration-300 data-open:ease-out",
        )}
      >
        <SheetHeader className="shrink-0 border-b border-gray-100 px-5 py-4 pr-12 text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md border border-gray-200 bg-white">
              <NestLogo className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold tracking-tight text-gray-900">
                Train Nest
              </SheetTitle>
              <SheetDescription className="text-xs text-gray-500">
                Tell Nest what to fix — we’ll check for conflicts first.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div
          ref={scrollerRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        >
          {empty ? (
            <div className="flex flex-1 flex-col justify-center gap-4 px-1">
              <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-5 shadow-sm">
                <p className="text-sm font-medium text-gray-900">
                  What did Nest get wrong?
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  Describe the mistake or the rule you want. Nest will propose a
                  precise change and ask before saving.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void sendMessage(starter)}
                    className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-left text-xs text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((turn) => (
            <div
              key={turn.id}
              className={cn(
                "flex w-full flex-col",
                turn.role === "user" ? "items-end" : "items-start",
              )}
            >
              {turn.role === "system" ? (
                <div className="w-full rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm">
                  {turn.text}
                </div>
              ) : (
                <div
                  className={cn(
                    "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    turn.role === "user"
                      ? "bg-gray-100 text-gray-900"
                      : "bg-transparent px-0.5 text-gray-800",
                  )}
                >
                  {turn.text}
                </div>
              )}

              {turn.proposals?.map((proposal) => {
                const state = turn.proposalStates?.[proposal.id] ?? "pending";
                if (state === "cancelled") return null;
                if (state === "undone") {
                  return (
                    <div
                      key={proposal.id}
                      className="mt-2 w-full max-w-[92%] rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-xs text-gray-500 shadow-sm"
                    >
                      Undone — {proposal.summary}
                    </div>
                  );
                }
                if (state === "applied") {
                  const canUndo = Boolean(turn.undoByProposal?.[proposal.id]);
                  return (
                    <div
                      key={proposal.id}
                      className="mt-2 flex w-full max-w-[92%] items-center justify-between gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-2 shadow-sm"
                    >
                      <p className="min-w-0 text-xs text-gray-600">
                        Applied — {proposal.summary}
                      </p>
                      {canUndo ? (
                        <button
                          type="button"
                          disabled={undoingId === proposal.id || busy}
                          onClick={() => void undoProposal(turn.id, proposal.id)}
                          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                        >
                          {undoingId === proposal.id ? (
                            <ShimmerLabel>Undoing…</ShimmerLabel>
                          ) : (
                            "Undo"
                          )}
                        </button>
                      ) : null}
                    </div>
                  );
                }
                if (state === "error") {
                  return (
                    <div
                      key={proposal.id}
                      className="mt-2 w-full max-w-[92%] rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-xs text-gray-700 shadow-sm"
                    >
                      {turn.proposalErrors?.[proposal.id] || "Could not apply."}
                    </div>
                  );
                }
                return (
                  <div key={proposal.id} className="w-full max-w-[92%]">
                    <NestPromptCoachProposalCard
                      proposal={proposal}
                      busy={applyingId === proposal.id}
                      onConfirm={(force) => void applyProposal(turn.id, proposal, force)}
                      onCancel={() => cancelProposal(turn.id, proposal.id)}
                    />
                  </div>
                );
              })}
            </div>
          ))}

          {sending ? (
            <p className="text-xs">
              <ShimmerLabel>Checking Nest settings…</ShimmerLabel>
            </p>
          ) : null}
          {applyingId ? (
            <p className="text-xs">
              <ShimmerLabel>Saving to Nest…</ShimmerLabel>
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white px-3 py-3">
          {error ? (
            <p className="mb-2 px-1 text-xs text-gray-500">{error}</p>
          ) : null}
          <HomeV2ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => void sendMessage(input)}
            isRunning={sending}
            compact
            showDisclaimer={false}
            placeholder="e.g. We don’t do same-day repairs…"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

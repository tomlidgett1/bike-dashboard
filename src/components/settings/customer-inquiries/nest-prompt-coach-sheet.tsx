"use client";

import * as React from "react";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { NestLogo } from "@/components/genie/nest-logo";
import { NestPromptCoachProposalCard } from "@/components/settings/customer-inquiries/nest-prompt-coach-proposal-card";
import {
  Bot,
  MessageCircle,
  Sparkles,
} from "@/components/layout/app-sidebar/dashboard-icons";
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

type CoachMode = "train" | "test";

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

const TRAIN_STARTERS = [
  "Wrong hours — we close at 6, not 5",
  "Stop promising free shipping",
  "Add our service booking policy",
  "The bot quoted the wrong price",
] as const;

const TEST_STARTERS = [
  "What are your opening hours?",
  "Do you do same-day repairs?",
  "How much is a general service?",
  "Can I book a bike fit this week?",
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
  const [mode, setMode] = React.useState<CoachMode>("train");
  const [trainTurns, setTrainTurns] = React.useState<CoachTurn[]>([]);
  const [testTurns, setTestTurns] = React.useState<CoachTurn[]>([]);
  const [testChatId, setTestChatId] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendingStartedAt, setSendingStartedAt] = React.useState<number | null>(null);
  const [sendingElapsedSec, setSendingElapsedSec] = React.useState(0);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);
  const [undoingId, setUndoingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  const turns = mode === "train" ? trainTurns : testTurns;

  React.useEffect(() => {
    if (!sending || sendingStartedAt == null) {
      setSendingElapsedSec(0);
      return;
    }
    const tick = () => {
      setSendingElapsedSec(Math.max(0, Math.floor((Date.now() - sendingStartedAt) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [sending, sendingStartedAt]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, sending, sendingElapsedSec, applyingId, undoingId, mode]);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setInput("");
  }, [open, mode]);

  const historyForApi = React.useMemo(
    () =>
      trainTurns
        .filter((turn) => turn.role === "user" || turn.role === "assistant")
        .map((turn) => ({ role: turn.role as "user" | "assistant", text: turn.text })),
    [trainTurns],
  );

  async function sendTrainMessage(raw: string) {
    const message = raw.trim();
    if (!message || sending) return;

    setError(null);
    setInput("");
    const userTurn: CoachTurn = { id: newId(), role: "user", text: message };
    setTrainTurns((prev) => [...prev, userTurn]);
    setSendingStartedAt(Date.now());
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

      setTrainTurns((prev) => [
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
      setTrainTurns((prev) => [
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

  async function sendTestMessage(raw: string) {
    const message = raw.trim();
    if (!message || sending) return;

    setError(null);
    setInput("");
    setTestTurns((prev) => [...prev, { id: newId(), role: "user", text: message }]);
    setSendingStartedAt(Date.now());
    setSending(true);

    try {
      const history = testTurns
        .filter((turn) => turn.role === "user" || turn.role === "assistant")
        .map((turn) => ({
          role: turn.role as "user" | "assistant",
          text: turn.text,
        }));

      const res = await fetch("/api/store/nest-test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          ...(testChatId ? { chatId: testChatId } : {}),
        }),
      });
      const data = (await res.json()) as {
        chatId?: string;
        reply?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not reach Nest.");
      }

      if (typeof data.chatId === "string" && data.chatId.trim()) {
        setTestChatId(data.chatId.trim());
      }

      setTestTurns((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: data.reply?.trim() || "Nest didn’t return a reply.",
        },
      ]);
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError(messageText);
      setTestTurns((prev) => [
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

  async function sendMessage(raw: string) {
    if (mode === "train") {
      await sendTrainMessage(raw);
      return;
    }
    await sendTestMessage(raw);
  }

  function resetTestChat() {
    setTestTurns([]);
    setTestChatId(null);
    setError(null);
    setInput("");
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

      setTrainTurns((prev) => {
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
      setTrainTurns((prev) =>
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
    const turn = trainTurns.find((item) => item.id === turnId);
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

      setTrainTurns((prev) =>
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
    setTrainTurns((prev) =>
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
                {mode === "train" ? "Train Nest" : "Test Nest"}
              </SheetTitle>
              <SheetDescription className="text-xs text-gray-500">
                {mode === "train"
                  ? "Tell Nest what to fix — we’ll check for conflicts first."
                  : "Chat as a customer using your Nest settings (hours, prices, policies)."}
              </SheetDescription>
            </div>
          </div>

          <div className="mt-3 flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
            <button
              type="button"
              onClick={() => setMode("train")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                mode === "train"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Sparkles size={15} />
              Train
            </button>
            <button
              type="button"
              onClick={() => setMode("test")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                mode === "test"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <MessageCircle size={15} />
              Test
            </button>
          </div>
        </SheetHeader>

        <div
          ref={scrollerRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        >
          {empty ? (
            <div className="flex flex-1 flex-col justify-center gap-4 px-1">
              <div className="rounded-md border border-gray-200/80 bg-white px-4 py-5 shadow-sm">
                <p className="text-sm font-medium text-gray-900">
                  {mode === "train" ? "What did Nest get wrong?" : "Try Nest as a customer"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  {mode === "train"
                    ? "Describe the mistake or the rule you want. Nest will propose a precise change and ask before saving."
                    : "Send a normal customer question. Nest replies with the live brand settings — nothing is saved from this chat."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(mode === "train" ? TRAIN_STARTERS : TEST_STARTERS).map((starter) => (
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
                <div className="w-full rounded-md border border-gray-200/80 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm">
                  {turn.text}
                </div>
              ) : (
                <div
                  className={cn(
                    "max-w-[92%] rounded-md px-3.5 py-2.5 text-sm leading-relaxed",
                    turn.role === "user"
                      ? "bg-gray-100 text-gray-900"
                      : mode === "test"
                        ? "rounded-md border border-gray-200/80 bg-white text-gray-800 shadow-sm"
                        : "bg-transparent px-0.5 text-gray-800",
                  )}
                >
                  {mode === "test" && turn.role === "assistant" ? (
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                      <Bot className="h-3.5 w-3.5" />
                      Nest
                    </div>
                  ) : null}
                  {turn.text}
                </div>
              )}

              {mode === "train"
                ? turn.proposals?.map((proposal) => {
                    const state = turn.proposalStates?.[proposal.id] ?? "pending";
                    if (state === "cancelled") return null;
                    if (state === "undone") {
                      return (
                        <div
                          key={proposal.id}
                          className="mt-2 w-full max-w-[92%] rounded-md border border-gray-200/80 bg-white px-3 py-2 text-xs text-gray-500 shadow-sm"
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
                          className="mt-2 flex w-full max-w-[92%] items-center justify-between gap-2 rounded-md border border-gray-200/80 bg-white px-3 py-2 shadow-sm"
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
                          className="mt-2 w-full max-w-[92%] rounded-md border border-gray-200/80 bg-white px-3 py-2 text-xs text-gray-700 shadow-sm"
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
                  })
                : null}
            </div>
          ))}

          {sending ? (
            <p className="text-xs">
              <ShimmerLabel>
                {mode === "train"
                  ? "Checking Nest settings…"
                  : sendingElapsedSec >= 8
                    ? `Nest is typing… ${sendingElapsedSec}s`
                    : "Nest is typing…"}
              </ShimmerLabel>
            </p>
          ) : null}
          {mode === "train" && applyingId ? (
            <p className="text-xs">
              <ShimmerLabel>Saving to Nest…</ShimmerLabel>
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white px-3 py-3">
          {mode === "test" && testTurns.length > 0 ? (
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[11px] text-gray-400">Test chat — uses Nest settings, not sent to customers</p>
              <button
                type="button"
                onClick={resetTestChat}
                disabled={sending}
                className="text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-50"
              >
                New test
              </button>
            </div>
          ) : null}
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
            placeholder={
              mode === "train"
                ? "e.g. We don’t do same-day repairs…"
                : "Ask Nest like a customer…"
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

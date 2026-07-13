"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NestLogo } from "@/components/genie/nest-logo";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
import type {
  PromptCoachProposal,
  PromptCoachUndoSnapshot,
} from "@/lib/nest/prompt-coach-types";
import type { NestProductionTestTrace } from "@/lib/nest/nest-workspace-types";
import { cn } from "@/lib/utils";
import { ConfirmActionDialog } from "./workspace-dialogs";
import { BusyLabel, CollapsiblePanel } from "./workspace-ui";

function ChatTypingIndicator() {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5"
      aria-label="Nest is typing"
      role="status"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${index * 150}ms` }}
        />
      ))}
    </div>
  );
}

function TestAnswerSourcePanel({
  sources,
}: {
  sources: Array<{ title: string; excerpt: string }>;
}) {
  if (sources.length === 0) return null;

  return (
    <details className="group w-full max-w-3xl rounded-md border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-medium text-gray-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span>Why Nest answered this way</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-gray-100 px-3.5 py-3">
        <p className="text-xs text-gray-500">
          These store facts were used to shape the reply.
        </p>
        {sources.map((source) => (
          <div
            key={`${source.title}-${source.excerpt.slice(0, 24)}`}
            className="rounded-md bg-gray-50 px-3 py-2.5"
          >
            <p className="text-xs font-medium text-gray-700">{source.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
              {source.excerpt}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

type ChatMode = "learn" | "test";
type ProposalState = "pending" | "applied" | "cancelled" | "error" | "undone";

type ChatTurn = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  proposals?: PromptCoachProposal[];
  proposalStates?: Record<string, ProposalState>;
  proposalErrors?: Record<string, string>;
  undoByProposal?: Record<string, PromptCoachUndoSnapshot>;
  trace?: NestProductionTestTrace;
};

type ProposalReview = {
  turnId: string;
  proposal: PromptCoachProposal;
};

const LEARN_STARTERS = [
  "Our workshop closes at 6 pm, not 5 pm",
  "Stop promising same-day repairs",
  "Add our service booking policy",
  "Nest quoted the wrong service price",
] as const;

const TEST_STARTERS = [
  "What are your opening hours?",
  "Do you offer same-day repairs?",
  "How much is a general service?",
  "Can I book a bike fit this week?",
] as const;

const LEARN_PROGRESS = [
  "Reading your current Nest knowledge",
  "Checking for contradictions",
  "Planning the safest update",
  "Preparing changes for your review",
] as const;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function responseData(
  response: Response,
): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function ProposalCard({
  turn,
  proposal,
  state,
  busy,
  onApply,
  onReview,
  onCancel,
  onUndo,
}: {
  turn: ChatTurn;
  proposal: PromptCoachProposal;
  state: ProposalState;
  busy: boolean;
  onApply: () => void;
  onReview: () => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  if (state === "cancelled") return null;
  if (state === "applied" || state === "undone") {
    return (
      <div className="mt-2 flex w-full flex-col gap-2 rounded-md border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-gray-600">
          {state === "applied" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {state === "applied" ? "Applied" : "Undone"} — {proposal.summary}
        </p>
        {state === "applied" && turn.undoByProposal?.[proposal.id] ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onUndo}
            disabled={busy}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 w-full">
      <CollapsiblePanel
        title={proposal.summary}
        description={
          proposal.status === "ready"
            ? "Nest has prepared a change for your approval."
            : "This change overlaps existing information and needs review."
        }
        badge={proposal.status === "ready" ? "Proposed" : proposal.status}
        defaultOpen
      >
        <div className="space-y-3">
          {proposal.currentSnippet ? (
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Current
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                {proposal.currentSnippet}
              </p>
            </div>
          ) : null}
          {proposal.proposedSnippet ? (
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Proposed
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                {proposal.proposedSnippet}
              </p>
            </div>
          ) : null}
          {proposal.mergedValue?.trim() ? (
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Complete saved wording
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                {proposal.mergedValue}
              </p>
            </div>
          ) : null}
          {state === "error" ? (
            <p
              role="alert"
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
            >
              {turn.proposalErrors?.[proposal.id] ||
                "Could not apply this change."}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={busy}
            >
              Dismiss
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={
                proposal.status === "ready" ? onApply : onReview
              }
              disabled={busy}
              className="bg-gray-900 text-white hover:bg-gray-800"
            >
              {busy ? (
                <BusyLabel>Applying…</BusyLabel>
              ) : proposal.status === "ready" ? (
                "Apply change"
              ) : (
                "Review change"
              )}
            </Button>
          </div>
        </div>
      </CollapsiblePanel>
    </div>
  );
}

export function ChatWorkspace({
  mode,
  onDataChanged,
  initialPrompt = "",
  onTeachNest,
  refreshing = false,
}: {
  mode: ChatMode;
  onDataChanged: () => Promise<void>;
  initialPrompt?: string;
  onTeachNest?: (prompt: string) => void;
  refreshing?: boolean;
}) {
  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [input, setInput] = React.useState(initialPrompt);
  const [sending, setSending] = React.useState(false);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);
  const [undoingId, setUndoingId] = React.useState<string | null>(null);
  const [testChatId, setTestChatId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reviewing, setReviewing] = React.useState<ProposalReview | null>(null);
  const [progressIndex, setProgressIndex] = React.useState(0);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const hasStarted = turns.length > 0 || sending;

  const stopGeneration = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  }, []);

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  React.useEffect(() => {
    if (!sending || mode !== "learn") return;
    const interval = window.setInterval(() => {
      setProgressIndex((current) =>
        Math.min(current + 1, LEARN_PROGRESS.length - 1),
      );
    }, 1400);
    return () => window.clearInterval(interval);
  }, [mode, sending]);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [turns, sending, applyingId, undoingId]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || sending || applyingId || undoingId) return;
    const history = turns
      .filter((turn) => turn.role === "user" || turn.role === "assistant")
      .map((turn) => ({
        role: turn.role as "user" | "assistant",
        text: turn.text,
      }));

    setInput("");
    setError(null);
    setTurns((current) => [
      ...current,
      { id: newId(), role: "user", text: message },
    ]);
    setProgressIndex(0);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);

    try {
      const response = await fetch(
        mode === "learn"
          ? "/api/store/nest-prompt-coach"
          : "/api/store/nest-test-chat",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify(
            mode === "learn"
              ? {
                  action: "chat",
                  message,
                  chatHistory: history,
                }
              : {
                  message,
                  history,
                  ...(testChatId ? { chatId: testChatId } : {}),
                },
          ),
        },
      );
      const data = await responseData(response);
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : mode === "learn"
              ? "Could not reach Nest Prompt Coach."
              : "Could not reach Nest.",
        );
      }

      if (
        mode === "test" &&
        typeof data.chatId === "string" &&
        data.chatId.trim()
      ) {
        setTestChatId(data.chatId.trim());
      }

      const proposals =
        mode === "learn" && Array.isArray(data.proposals)
          ? (data.proposals as PromptCoachProposal[])
          : [];
      const proposalStates = Object.fromEntries(
        proposals.map((proposal) => [proposal.id, "pending" as const]),
      );
      const followUp =
        mode === "learn" && typeof data.followUp === "string"
          ? data.followUp.trim()
          : "";
      const reply =
        typeof data.reply === "string" && data.reply.trim()
          ? `${data.reply.trim()}${followUp ? ` ${followUp}` : ""}`
          : "Nest did not return a reply.";

      setTurns((current) => [
        ...current,
        {
          id: newId(),
          role: "assistant",
          text: reply,
          proposals,
          proposalStates,
          proposalErrors: {},
          undoByProposal: {},
          trace:
            mode === "test" &&
            data.trace &&
            typeof data.trace === "object"
              ? (data.trace as NestProductionTestTrace)
              : undefined,
        },
      ]);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        return;
      }
      const messageText =
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.";
      setInput(message);
      setError(messageText);
      setTurns((current) => [
        ...current,
        { id: newId(), role: "system", text: messageText },
      ]);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setSending(false);
    }
  }

  function updateProposal(
    turnId: string,
    proposalId: string,
    update: (turn: ChatTurn) => ChatTurn,
  ) {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId &&
        turn.proposals?.some((proposal) => proposal.id === proposalId)
          ? update(turn)
          : turn,
      ),
    );
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
      const response = await fetch("/api/store/nest-prompt-coach", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "apply",
          proposals: [proposal],
          force,
        }),
      });
      const data = await responseData(response);
      const applied = Array.isArray(data.applied)
        ? (data.applied[0] as
            | {
                ok?: boolean;
                error?: string;
                undo?: PromptCoachUndoSnapshot;
              }
            | undefined)
        : undefined;
      if (!response.ok || !applied?.ok) {
        throw new Error(
          applied?.error ||
            (typeof data.error === "string"
              ? data.error
              : "Could not apply this change."),
        );
      }
      updateProposal(turnId, proposal.id, (turn) => ({
        ...turn,
        proposalStates: {
          ...turn.proposalStates,
          [proposal.id]: "applied",
        },
        undoByProposal: applied.undo
          ? {
              ...turn.undoByProposal,
              [proposal.id]: applied.undo,
            }
          : turn.undoByProposal,
      }));
      await onDataChanged();
    } catch (caught) {
      const messageText =
        caught instanceof Error ? caught.message : "Could not apply this change.";
      updateProposal(turnId, proposal.id, (turn) => ({
        ...turn,
        proposalStates: {
          ...turn.proposalStates,
          [proposal.id]: "error",
        },
        proposalErrors: {
          ...turn.proposalErrors,
          [proposal.id]: messageText,
        },
      }));
      throw caught;
    } finally {
      setApplyingId(null);
    }
  }

  async function undoProposal(
    turnId: string,
    proposal: PromptCoachProposal,
  ) {
    const turn = turns.find((entry) => entry.id === turnId);
    const undo = turn?.undoByProposal?.[proposal.id];
    if (!undo || applyingId || undoingId) return;

    setUndoingId(proposal.id);
    setError(null);
    try {
      const response = await fetch("/api/store/nest-prompt-coach", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "undo", undo }),
      });
      const data = await responseData(response);
      if (!response.ok || data.ok === false) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : typeof data.reply === "string"
              ? data.reply
              : "Could not undo this change.",
        );
      }
      updateProposal(turnId, proposal.id, (entry) => {
        const nextUndo = { ...entry.undoByProposal };
        delete nextUndo[proposal.id];
        return {
          ...entry,
          proposalStates: {
            ...entry.proposalStates,
            [proposal.id]: "undone",
          },
          undoByProposal: nextUndo,
        };
      });
      await onDataChanged();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not undo this change.",
      );
    } finally {
      setUndoingId(null);
    }
  }

  function cancelProposal(turnId: string, proposalId: string) {
    updateProposal(turnId, proposalId, (turn) => ({
      ...turn,
      proposalStates: {
        ...turn.proposalStates,
        [proposalId]: "cancelled",
      },
    }));
  }

  function resetTest() {
    setTurns([]);
    setInput("");
    setError(null);
    setTestChatId(null);
  }

  const starters = mode === "learn" ? LEARN_STARTERS : TEST_STARTERS;
  const busy = sending || Boolean(applyingId) || Boolean(undoingId);

  return (
    <section
      aria-label={mode === "learn" ? "Learn" : "Test"}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {mode === "test" && hasStarted ? (
        <div className="absolute right-4 top-14 z-30 sm:right-5">
          <button
            type="button"
            onClick={resetTest}
            disabled={sending}
            className="flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
            aria-label="Start a new test"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New test
          </button>
        </div>
      ) : null}

      {!hasStarted ? (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-12 sm:py-14">
          {mode === "learn" ? (
            <div className="text-center">
              <NestLogo className="mx-auto h-12 w-12" />
              <h1 className="mt-4 text-xl font-medium tracking-tight text-gray-800 sm:text-[1.375rem]">
                What should Nest learn?
              </h1>
              <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
                Describe a wrong answer or a new store rule. Nothing changes
                until you approve the exact update.
              </p>
            </div>
          ) : (
            <div className="text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#ffde59] text-gray-900">
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
              </span>
              <h1 className="mt-4 text-xl font-medium tracking-tight text-gray-800 sm:text-[1.375rem]">
                Test Nest
              </h1>
              <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
                Ask a question exactly as a customer would. This uses the same
                production path as your live store chatbot.
              </p>
            </div>
          )}
          <div className="flex w-full min-w-0 max-w-full flex-col gap-4">
            <div className="flex flex-wrap justify-center gap-2">
              {starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void send(starter)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-left text-xs leading-relaxed text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  {starter}
                </button>
              ))}
            </div>
            <HomeV2ChatInput
              value={input}
              isRunning={sending}
              onChange={setInput}
              onSubmit={() => void send(input)}
              onStop={stopGeneration}
              placeholder={
                mode === "learn"
                  ? "Tell Nest what to learn or fix…"
                  : "Ask a customer question…"
              }
              showDisclaimer={false}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            ref={scrollerRef}
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-16"
            aria-live="polite"
          >
            <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
              {turns.map((turn, turnIndex) => (
                <div
                  key={turn.id}
                  className={cn(
                    "flex w-full flex-col",
                    turn.role === "user" ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      turn.role === "user" &&
                        "w-fit max-w-[86%] rounded-[24px] bg-blue-600 px-4 py-2 text-white shadow-sm sm:max-w-[78%]",
                      turn.role === "assistant" &&
                        mode === "learn" &&
                        "w-full max-w-3xl bg-transparent py-1",
                      turn.role === "assistant" &&
                        mode === "test" &&
                        "w-fit max-w-[85%] rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm",
                      turn.role === "system" &&
                        "w-full max-w-full rounded-md border border-gray-200 bg-white px-3.5 py-2.5 text-gray-700",
                    )}
                  >
                    <p
                      className={cn(
                        "whitespace-pre-wrap text-sm leading-relaxed",
                        turn.role === "user" ? "text-white" : "text-gray-700",
                      )}
                    >
                      {turn.text}
                    </p>
                  </div>

                  {mode === "test" && turn.role === "assistant" ? (
                    <div className="mt-2 w-full max-w-3xl space-y-2.5 self-start">
                      {turn.trace?.promptSources?.length ? (
                        <TestAnswerSourcePanel sources={turn.trace.promptSources} />
                      ) : null}
                      {onTeachNest ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-md"
                          onClick={() => {
                            const customerTurn = [...turns.slice(0, turnIndex)]
                              .reverse()
                              .find((entry) => entry.role === "user");
                            onTeachNest(
                              `A customer asked: “${customerTurn?.text || "See the test conversation"}”\n\nNest replied: “${turn.text}”\n\nPlease help me improve this answer. Check the current facts and propose the exact change before saving anything.`,
                            );
                          }}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Teach Nest from this reply
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {mode === "learn"
                    ? turn.proposals?.map((proposal) => (
                        <div
                          key={proposal.id}
                          className="w-full max-w-3xl self-start"
                        >
                          <ProposalCard
                            turn={turn}
                            proposal={proposal}
                            state={
                              turn.proposalStates?.[proposal.id] ?? "pending"
                            }
                            busy={
                              applyingId === proposal.id ||
                              undoingId === proposal.id
                            }
                            onApply={() =>
                              void applyProposal(turn.id, proposal, false).catch(
                                () => undefined,
                              )
                            }
                            onReview={() =>
                              setReviewing({ turnId: turn.id, proposal })
                            }
                            onCancel={() =>
                              cancelProposal(turn.id, proposal.id)
                            }
                            onUndo={() => void undoProposal(turn.id, proposal)}
                          />
                        </div>
                      ))
                    : null}
                </div>
              ))}

              {sending ? (
                mode === "learn" ? (
                  <div className="flex w-full max-w-3xl items-start gap-2 py-2">
                    <Sparkles className="mt-0.5 h-4 w-4 text-gray-400" />
                    <div>
                      <p
                        className={cn(
                          genieProgressShimmerClassName,
                          "text-[15px] leading-snug",
                        )}
                        style={genieProgressShimmerStyle}
                      >
                        {LEARN_PROGRESS[progressIndex]}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        Comparing the request with existing facts and instructions
                      </p>
                    </div>
                  </div>
                ) : (
                  <ChatTypingIndicator />
                )
              ) : null}
            </div>
          </div>

          <div className="relative z-20 shrink-0 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent px-5 pb-4 pt-6">
            <div className="mx-auto w-full max-w-3xl">
              {error ? (
                <p
                  role="alert"
                  className="mb-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
                >
                  {error}
                </p>
              ) : null}
              <HomeV2ChatInput
                compact
                value={input}
                isRunning={sending}
                onChange={setInput}
                onSubmit={() => void send(input)}
                onStop={stopGeneration}
                placeholder={
                  mode === "learn"
                    ? "Tell Nest what to learn or fix…"
                    : "Ask a customer question…"
                }
                showDisclaimer={false}
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(reviewing)}
        onOpenChange={(open) => {
          if (!open) setReviewing(null);
        }}
        title="Apply this change anyway?"
        description="The coach found existing information that may overlap or conflict. Review both versions before forcing the save."
        confirmLabel="Apply anyway"
        busyLabel="Applying…"
        onConfirm={async () => {
          if (!reviewing) return;
          await applyProposal(
            reviewing.turnId,
            reviewing.proposal,
            true,
          );
        }}
      >
        {reviewing ? (
          <div className="space-y-3">
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Conflict
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-700">
                {reviewing.proposal.conflictingLine ||
                  reviewing.proposal.currentSnippet ||
                  "Existing knowledge may give a different answer."}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Proposed
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                {reviewing.proposal.proposedSnippet ||
                  reviewing.proposal.mergedValue ||
                  reviewing.proposal.summary}
              </p>
            </div>
          </div>
        ) : null}
      </ConfirmActionDialog>
    </section>
  );
}

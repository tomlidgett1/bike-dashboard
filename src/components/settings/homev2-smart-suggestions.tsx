"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { NestPickupSuggestion } from "@/lib/nest/pickup-suggestions";
import { hideNestPickupSuggestion } from "@/lib/nest/pickup-suggestions-client";
import {
  fetchGmailResponseSuggestions,
  hideGmailResponseSuggestion,
  type GmailSuggestionsResponse,
} from "@/lib/composio/gmail-response-suggestions-client";
import type { GmailResponseSuggestion } from "@/lib/composio/gmail-response-suggestions";
import type { GmailConnectPayload } from "@/lib/types/genie-agent";
import { GmailConnectCard } from "@/components/genie/gmail-connect-card";
import {
  GmailResponseConfirmDialog,
  GmailResponseSuggestionCard,
} from "@/components/settings/gmail-response-suggestion-ui";
import {
  NestPickupConfirmDialog,
  NestPickupSuggestionCard,
} from "@/components/settings/nest-pickup-suggestion-ui";

type SuggestionsResponse = {
  suggestions?: NestPickupSuggestion[];
  lightspeedConnected?: boolean;
  nestConfigured?: boolean;
  error?: string;
};

const POLL_MS = 5 * 60 * 1000;

const SUGGESTION_EXIT_TRANSITION = {
  duration: 0.4,
  ease: [0.04, 0.62, 0.23, 0.98] as const,
};

async function fetchSuggestions(): Promise<SuggestionsResponse> {
  const res = await fetch("/api/store/homev2-suggestions", { cache: "no-store" });
  const data = (await res.json()) as SuggestionsResponse;
  if (!res.ok) {
    throw new Error(data.error || "Could not load suggestions.");
  }
  return data;
}

function suggestionKey(suggestion: NestPickupSuggestion): string {
  return suggestion.workorderId || suggestion.id;
}

function gmailSuggestionKey(suggestion: GmailResponseSuggestion): string {
  return suggestion.messageId || suggestion.id;
}

export function HomeV2SmartSuggestions() {
  const [suggestions, setSuggestions] = React.useState<NestPickupSuggestion[]>([]);
  const [gmailSuggestions, setGmailSuggestions] = React.useState<GmailResponseSuggestion[]>([]);
  const [gmailState, setGmailState] = React.useState<GmailSuggestionsResponse["gmail"] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [hidingWorkorderId, setHidingWorkorderId] = React.useState<string | null>(null);
  const [hidingGmailMessageId, setHidingGmailMessageId] = React.useState<string | null>(null);
  const [activeSuggestion, setActiveSuggestion] = React.useState<NestPickupSuggestion | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [activeGmailSuggestion, setActiveGmailSuggestion] = React.useState<GmailResponseSuggestion | null>(null);
  const [gmailDialogOpen, setGmailDialogOpen] = React.useState(false);
  const [showAddGmailCard, setShowAddGmailCard] = React.useState(false);

  const gmailConnectPayload = React.useMemo((): GmailConnectPayload | null => {
    if (!gmailState?.configured || !gmailState.connectUrl) return null;
    if (!gmailState.connected) {
      return { url: gmailState.connectUrl, reason: "status", can_add_more: true };
    }
    if (showAddGmailCard) {
      return {
        url: gmailState.connectUrl,
        reason: "add_account",
        accounts: gmailState.accounts,
        can_add_more: true,
      };
    }
    return null;
  }, [gmailState, showAddGmailCard]);

  const showGmailConnectCard = Boolean(gmailConnectPayload);
  const showAddGmailPrompt = Boolean(
    gmailState?.configured && gmailState.connected && gmailState.connectUrl && !showAddGmailCard,
  );

  const initialLoad = React.useRef(true);

  const load = React.useCallback(async (options?: { silent?: boolean }) => {
    if (options?.silent && (hidingWorkorderId || hidingGmailMessageId)) return;

    const [nestResult, gmailResult] = await Promise.allSettled([
      fetchSuggestions(),
      fetchGmailResponseSuggestions(),
    ]);

    let nextLoadError: string | null = null;

    if (nestResult.status === "fulfilled") {
      setSuggestions(Array.isArray(nestResult.value.suggestions) ? nestResult.value.suggestions : []);
    } else if (!options?.silent) {
      setSuggestions([]);
      nextLoadError = nestResult.reason instanceof Error
        ? nestResult.reason.message
        : "Could not load suggestions.";
    }

    if (gmailResult.status === "fulfilled") {
      setGmailSuggestions(Array.isArray(gmailResult.value.suggestions) ? gmailResult.value.suggestions : []);
      setGmailState(gmailResult.value.gmail ?? null);
    } else if (!options?.silent) {
      setGmailSuggestions([]);
      setGmailState(null);
      if (!nextLoadError) {
        nextLoadError = gmailResult.reason instanceof Error
          ? gmailResult.reason.message
          : "Could not load Gmail suggestions.";
      }
    }

    if (!options?.silent) {
      setLoadError(nextLoadError);
    } else if (nestResult.status === "fulfilled" || gmailResult.status === "fulfilled") {
      setLoadError(null);
    }

    if (initialLoad.current) {
      initialLoad.current = false;
      setLoading(false);
    }
  }, [hidingGmailMessageId, hidingWorkorderId]);

  React.useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  async function handleHide(suggestion: NestPickupSuggestion) {
    const workorderId = suggestionKey(suggestion);
    if (!workorderId || hidingWorkorderId) return;

    setActionError(null);
    setHidingWorkorderId(workorderId);

    const previous = suggestions;
    setSuggestions((current) =>
      current.filter((item) => suggestionKey(item) !== workorderId),
    );

    try {
      await hideNestPickupSuggestion({
        ...suggestion,
        id: workorderId,
        workorderId,
      });
    } catch (err) {
      setSuggestions(previous);
      setActionError(err instanceof Error ? err.message : "Could not hide suggestion.");
    } finally {
      setHidingWorkorderId(null);
    }
  }

  async function handleGmailHide(suggestion: GmailResponseSuggestion) {
    const messageId = gmailSuggestionKey(suggestion);
    if (!messageId || hidingGmailMessageId) return;

    setActionError(null);
    setHidingGmailMessageId(messageId);

    const previous = gmailSuggestions;
    setGmailSuggestions((current) =>
      current.filter((item) => gmailSuggestionKey(item) !== messageId),
    );

    try {
      await hideGmailResponseSuggestion(suggestion);
    } catch (err) {
      setGmailSuggestions(previous);
      setActionError(err instanceof Error ? err.message : "Could not hide Gmail suggestion.");
    } finally {
      setHidingGmailMessageId(null);
    }
  }

  async function handleSent(suggestion: NestPickupSuggestion) {
    const workorderId = suggestionKey(suggestion);
    setSuggestions((current) =>
      current.filter((item) => suggestionKey(item) !== workorderId),
    );
    setActiveSuggestion(null);
    try {
      await hideNestPickupSuggestion({
        ...suggestion,
        id: workorderId,
        workorderId,
      });
    } catch {
      // Sent successfully; hiding is best-effort so the card does not reappear.
    }
  }

  function handleGmailDrafted(suggestion: GmailResponseSuggestion) {
    const messageId = gmailSuggestionKey(suggestion);
    setGmailSuggestions((current) =>
      current.filter((item) => gmailSuggestionKey(item) !== messageId),
    );
    setActiveGmailSuggestion(null);
  }

  const hasVisibleSuggestions =
    suggestions.length > 0
    || gmailSuggestions.length > 0
    || showGmailConnectCard
    || showAddGmailPrompt;

  if (loading && !hasVisibleSuggestions) {
    return (
      <div className="mt-6 flex w-full max-w-3xl items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking finished work orders and inbox…
      </div>
    );
  }

  if (loadError && !hasVisibleSuggestions) return null;
  if (!hasVisibleSuggestions) return null;

  return (
    <>
      <div className="mt-6 w-full max-w-3xl">
        <p className="mb-2 text-center text-xs font-medium text-gray-500">Smart suggestions</p>

        {actionError ? (
          <div className="mb-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-center text-xs text-red-600">
            {actionError}
          </div>
        ) : null}

        <div className="space-y-2">
          {showGmailConnectCard && gmailConnectPayload ? (
            <GmailConnectCard
              payload={gmailConnectPayload}
              onConnected={() => {
                setShowAddGmailCard(false);
                void load({ silent: true });
              }}
            />
          ) : null}

          {showAddGmailPrompt ? (
            <button
              type="button"
              onClick={() => setShowAddGmailCard(true)}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50"
            >
              <span>
                <span className="font-semibold text-gray-900">Gmail</span>
                <span className="text-gray-400"> · </span>
                Add another mailbox
              </span>
              <span className="text-xs font-medium text-gray-500">Open card</span>
            </button>
          ) : null}

          <AnimatePresence initial={false} mode="popLayout">
            {gmailSuggestions.map((suggestion) => {
              const key = gmailSuggestionKey(suggestion);
              return (
                <motion.div
                  key={`gmail-${key}`}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, scale: 0.98 }}
                  transition={SUGGESTION_EXIT_TRANSITION}
                  className="overflow-hidden"
                >
                  <GmailResponseSuggestionCard
                    suggestion={suggestion}
                    onOpen={(item) => {
                      setActiveGmailSuggestion(item);
                      setGmailDialogOpen(true);
                    }}
                    onHide={(item) => void handleGmailHide(item)}
                    hideLabel={hidingGmailMessageId === key ? "Hiding…" : "Hide"}
                  />
                </motion.div>
              );
            })}

            {suggestions.map((suggestion) => {
              const key = suggestionKey(suggestion);
              return (
                <motion.div
                  key={key}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, scale: 0.98 }}
                  transition={SUGGESTION_EXIT_TRANSITION}
                  className="overflow-hidden"
                >
                  <NestPickupSuggestionCard
                    suggestion={suggestion}
                    onOpen={(item) => {
                      setActiveSuggestion(item);
                      setDialogOpen(true);
                    }}
                    onHide={(item) => void handleHide(item)}
                    hideLabel={hidingWorkorderId === key ? "Hiding…" : "Hide"}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <NestPickupConfirmDialog
        suggestion={activeSuggestion}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSent={handleSent}
      />

      <GmailResponseConfirmDialog
        suggestion={activeGmailSuggestion}
        open={gmailDialogOpen}
        onOpenChange={setGmailDialogOpen}
        onDrafted={handleGmailDrafted}
      />
    </>
  );
}

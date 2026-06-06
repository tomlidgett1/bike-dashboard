"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { NestPickupSuggestion } from "@/lib/nest/pickup-suggestions";
import { hideNestPickupSuggestion } from "@/lib/nest/pickup-suggestions-client";
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

export function HomeV2SmartSuggestions() {
  const [suggestions, setSuggestions] = React.useState<NestPickupSuggestion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [hidingWorkorderId, setHidingWorkorderId] = React.useState<string | null>(null);
  const [activeSuggestion, setActiveSuggestion] = React.useState<NestPickupSuggestion | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const initialLoad = React.useRef(true);

  const load = React.useCallback(async (options?: { silent?: boolean }) => {
    if (options?.silent && hidingWorkorderId) return;

    try {
      const data = await fetchSuggestions();
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      setLoadError(null);
    } catch (err) {
      if (!options?.silent) {
        setLoadError(err instanceof Error ? err.message : "Could not load suggestions.");
      }
      if (!options?.silent) {
        setSuggestions([]);
      }
    } finally {
      if (initialLoad.current) {
        initialLoad.current = false;
        setLoading(false);
      }
    }
  }, [hidingWorkorderId]);

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

  if (loading && suggestions.length === 0) {
    return (
      <div className="mt-6 flex w-full max-w-3xl items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking finished work orders…
      </div>
    );
  }

  if (loadError || suggestions.length === 0) return null;

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
          <AnimatePresence initial={false} mode="popLayout">
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
    </>
  );
}

"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { SettingsSection } from "@/components/dashboard/settings-primitives";
import type { HiddenNestPickupSuggestion, NestPickupSuggestion } from "@/lib/nest/pickup-suggestions";
import {
  fetchHiddenNestPickupSuggestions,
  hideNestPickupSuggestion,
  restoreNestPickupSuggestion,
} from "@/lib/nest/pickup-suggestions-client";
import {
  NestHiddenPickupSuggestionRow,
  NestPickupConfirmDialog,
} from "@/components/settings/nest-pickup-suggestion-ui";

export function NestHiddenPickupSuggestionsPanel() {
  const [suggestions, setSuggestions] = React.useState<HiddenNestPickupSuggestion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);
  const [activeSuggestion, setActiveSuggestion] = React.useState<NestPickupSuggestion | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const data = await fetchHiddenNestPickupSuggestions();
      setSuggestions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load hidden suggestions.");
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleRestore(suggestion: NestPickupSuggestion) {
    if (restoringId) return;
    setRestoringId(suggestion.id);
    try {
      await restoreNestPickupSuggestion(suggestion.workorderId);
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore suggestion.");
    } finally {
      setRestoringId(null);
    }
  }

  async function handleSent(suggestion: NestPickupSuggestion) {
    setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    setActiveSuggestion(null);
    try {
      await hideNestPickupSuggestion(suggestion);
    } catch {
      // Already hidden; keep off the list.
    }
  }

  if (loading) {
    return (
      <SettingsSection
        title="Hidden pickup suggestions"
        description="Suggestions you dismissed on HomeV2. Restore them to show again, or send the pickup message from here."
        className="mb-6"
      >
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading hidden suggestions…
        </div>
      </SettingsSection>
    );
  }

  if (suggestions.length === 0 && !error) {
    return null;
  }

  return (
    <>
      <SettingsSection
        title="Hidden pickup suggestions"
        description="Suggestions you dismissed on HomeV2. Restore them to show again, or send the pickup message from here."
        className="mb-6"
      >
        {error ? (
          <div className="mb-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        ) : null}

        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <NestHiddenPickupSuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              restoring={restoringId === suggestion.id}
              onOpen={(item) => {
                setActiveSuggestion(item);
                setDialogOpen(true);
              }}
              onRestore={(item) => void handleRestore(item)}
            />
          ))}
        </div>
      </SettingsSection>

      <NestPickupConfirmDialog
        suggestion={activeSuggestion}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSent={handleSent}
      />
    </>
  );
}

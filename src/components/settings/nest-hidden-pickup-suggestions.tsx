"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { BentoInboxEmptyState } from "@/components/settings/bento-inbox-item-actions";
import { NestSettingsBentoShell } from "@/components/settings/nest-settings-bento-shell";
import type { BentoShellVariant } from "@/components/settings/bento-variant-styles";
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

export function NestHiddenPickupSuggestionsPanel({
  variant = "light-beige-floating",
  className,
}: {
  variant?: BentoShellVariant;
  className?: string;
}) {
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

  return (
    <>
      <NestSettingsBentoShell
        title="Hidden pickup suggestions"
        description="Suggestions you dismissed on Home. Restore them to show again, or send the pickup message from here."
        variant={variant}
        className={className}
        icon={
          <span className="mt-0.5 flex h-5 w-5 shrink-0 overflow-hidden rounded-full">
            <Image src="/ls.png" alt="" width={20} height={20} className="h-full w-full object-cover" />
          </span>
        }
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading hidden suggestions…
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-100 bg-white px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        ) : suggestions.length === 0 ? (
          <BentoInboxEmptyState message="No hidden pickup suggestions" />
        ) : (
          <div className="-mx-1 space-y-2">
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
        )}
      </NestSettingsBentoShell>

      <NestPickupConfirmDialog
        suggestion={activeSuggestion}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSent={handleSent}
      />
    </>
  );
}

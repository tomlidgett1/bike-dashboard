"use client";

import * as React from "react";
import { ExternalLink, EyeOff, Loader2, MailPlus, X } from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import {
  NEST_OVERLAY_INNER_RADIUS_CLASS,
  NEST_PICKUP_SUGGESTION_CARD_CLASS,
} from "@/components/settings/nest-pickup-suggestion-ui";
import {
  createGmailResponseDraft,
  type GmailSuggestionsResponse,
} from "@/lib/composio/gmail-response-suggestions-client";
import type { GmailResponseSuggestion } from "@/lib/composio/gmail-response-suggestions";
import { cn } from "@/lib/utils";

function senderDisplayName(suggestion: GmailResponseSuggestion): string {
  return suggestion.senderName || suggestion.senderEmail || "Customer";
}

function suggestionLabel(suggestion: GmailResponseSuggestion): string {
  const label = suggestion.label.trim();
  if (label) return label;
  return `Reply to ${senderDisplayName(suggestion)}`;
}

export function GmailResponseSuggestionCard({
  suggestion,
  onOpen,
  onHide,
  hideLabel = "Hide",
}: {
  suggestion: GmailResponseSuggestion;
  onOpen: (suggestion: GmailResponseSuggestion) => void;
  onHide?: (suggestion: GmailResponseSuggestion) => void;
  hideLabel?: string;
}) {
  return (
    <div className={NEST_PICKUP_SUGGESTION_CARD_CLASS}>
      <button
        type="button"
        onClick={() => onOpen(suggestion)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
          <GmailLogo className="h-[13px] max-w-[16px]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
          <span className="font-semibold text-gray-900">{senderDisplayName(suggestion)}</span>
          <span className="text-gray-400"> · </span>
          {suggestionLabel(suggestion)}
        </span>
      </button>
      {onHide ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onHide(suggestion);
          }}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          aria-label={`${hideLabel} suggestion`}
        >
          <EyeOff className="h-3 w-3" />
          {hideLabel}
        </button>
      ) : null}
    </div>
  );
}

export function GmailResponseConfirmDialog({
  suggestion,
  open,
  onOpenChange,
  onDrafted,
}: {
  suggestion: GmailResponseSuggestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDrafted: (suggestion: GmailResponseSuggestion) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !suggestion) return;
    setDraft(suggestion.responseDraft);
    setError(null);
    setSending(false);
  }, [open, suggestion]);

  async function createDraft() {
    if (!suggestion || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await createGmailResponseDraft(suggestion, draft.trim());
      onDrafted({ ...suggestion, responseDraft: draft.trim() });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create Gmail draft.");
    } finally {
      setSending(false);
    }
  }

  if (!open || !suggestion) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={() => !sending && onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gmail-response-dialog-title"
        className={cn(
          "relative z-10 w-full max-w-xl overflow-hidden border border-gray-200 bg-white animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
          "rounded-t-3xl sm:rounded-3xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
              <GmailLogo />
            </span>
            <div>
              <h3 id="gmail-response-dialog-title" className="text-sm font-medium text-gray-900">
                Create Gmail draft
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                To {suggestion.senderEmail}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={sending}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50",
              NEST_OVERLAY_INNER_RADIUS_CLASS,
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 pb-5">
          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-medium text-gray-900">{senderDisplayName(suggestion)}</span>
              {suggestion.dateLabel ? <span className="text-gray-400">{suggestion.dateLabel}</span> : null}
            </div>
            <p className="mt-1 truncate text-xs font-medium text-gray-700">
              {suggestion.subject || "(No subject)"}
            </p>
            {suggestion.snippet ? (
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-500">
                {suggestion.snippet}
              </p>
            ) : null}
          </div>

          {suggestion.reason ? (
            <p className="text-xs leading-relaxed text-gray-500">{suggestion.reason}</p>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-900">Draft response</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={8}
              disabled={sending}
              className={cn(
                "w-full border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900",
                NEST_OVERLAY_INNER_RADIUS_CLASS,
                "outline-none transition-colors shadow-none",
                "focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100",
                "min-h-[180px] resize-none leading-relaxed disabled:opacity-60",
              )}
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={sending}
            className={cn(
              "inline-flex h-9 items-center justify-center px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50",
              NEST_OVERLAY_INNER_RADIUS_CLASS,
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void createDraft()}
            disabled={sending || !draft.trim()}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 bg-gray-900 px-3.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50",
              NEST_OVERLAY_INNER_RADIUS_CLASS,
            )}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailPlus className="h-3.5 w-3.5" />}
            Create draft
          </button>
        </div>
      </div>
    </div>
  );
}

export function GmailConnectSuggestionCard({
  gmail,
}: {
  gmail: NonNullable<GmailSuggestionsResponse["gmail"]>;
}) {
  const [opening, setOpening] = React.useState(false);

  function openConnect() {
    const url = gmail.connectUrl?.trim();
    if (!url) return;
    setOpening(true);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => setOpening(false), 600);
  }

  if (!gmail.configured || gmail.connected || !gmail.connectUrl) return null;

  return (
    <div className={NEST_PICKUP_SUGGESTION_CARD_CLASS}>
      <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
          <GmailLogo className="h-[13px] max-w-[16px]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
          <span className="font-semibold text-gray-900">Gmail</span>
          <span className="text-gray-400"> · </span>
          Connect inbox for reply suggestions
        </span>
      </div>
      <button
        type="button"
        onClick={openConnect}
        disabled={opening}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
      >
        {opening ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
        Connect
      </button>
    </div>
  );
}

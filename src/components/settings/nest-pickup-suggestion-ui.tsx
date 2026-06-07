"use client";

import * as React from "react";
import Image from "next/image";
import { EyeOff, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NestPickupSuggestion } from "@/lib/nest/pickup-suggestions";

export const NEST_OVERLAY_RADIUS_CLASS = "rounded-3xl";
export const NEST_OVERLAY_INNER_RADIUS_CLASS = "rounded-2xl";

export const NEST_PICKUP_SUGGESTION_CARD_CLASS = cn(
  "flex w-full items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors",
  "hover:border-gray-300 hover:bg-gray-50",
);

export function NestPickupSuggestionLabel({ suggestion }: { suggestion: NestPickupSuggestion }) {
  const customerName = suggestion.customerName.trim();
  const label = suggestion.label;

  if (!customerName) {
    return <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{label}</span>;
  }

  const nameIndex = label.indexOf(customerName);
  if (nameIndex === -1) {
    return <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{label}</span>;
  }

  return (
    <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
      {label.slice(0, nameIndex)}
      <span className="font-semibold text-gray-900">{customerName}</span>
      {label.slice(nameIndex + customerName.length)}
    </span>
  );
}

async function startNestMessage(
  mobile: string,
  content: string,
  customerName?: string,
): Promise<void> {
  const res = await fetch("/api/store/nest-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "start_message",
      mobile,
      content,
      customerName,
    }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not send Nest message.");
  }
}

export function NestPickupSuggestionCard({
  suggestion,
  onOpen,
  onHide,
  hideLabel = "Hide",
}: {
  suggestion: NestPickupSuggestion;
  onOpen: (suggestion: NestPickupSuggestion) => void;
  onHide?: (suggestion: NestPickupSuggestion) => void;
  hideLabel?: string;
}) {
  return (
    <div className={NEST_PICKUP_SUGGESTION_CARD_CLASS}>
      <button
        type="button"
        onClick={() => onOpen(suggestion)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Image
          src="/nest-logo.png"
          alt=""
          width={20}
          height={20}
          className="shrink-0 rounded-md"
          aria-hidden
        />
        <NestPickupSuggestionLabel suggestion={suggestion} />
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

export function NestPickupConfirmDialog({
  suggestion,
  open,
  onOpenChange,
  onSent,
}: {
  suggestion: NestPickupSuggestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (suggestion: NestPickupSuggestion) => void;
}) {
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !suggestion) return;
    setMessage(suggestion.messageDraft);
    setError(null);
    setSending(false);
  }, [open, suggestion]);

  async function send() {
    if (!suggestion?.mobile || !message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await startNestMessage(suggestion.mobile, message.trim(), suggestion.customerName);
      onSent(suggestion);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
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
        aria-labelledby="nest-pickup-dialog-title"
        className={cn(
          "relative z-10 w-full max-w-lg overflow-hidden border border-gray-200 bg-white animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
          "rounded-t-3xl sm:rounded-3xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="flex items-start gap-3">
            <Image
              src="/nest-logo.png"
              alt="Nest"
              width={28}
              height={28}
              className="rounded-full"
            />
            <div>
              <h3 id="nest-pickup-dialog-title" className="text-sm font-medium text-gray-900">
                Send via Nest
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Confirm the pickup message for {suggestion.customerName}
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
          {error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : null}

          {!suggestion.canSend ? (
            <p className="text-xs text-gray-500">
              No mobile number on file in Lightspeed for this customer.
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              Sending to <span className="font-medium text-gray-700">{suggestion.mobile}</span>
            </p>
          )}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-900">Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              disabled={sending || !suggestion.canSend}
              className={cn(
                "w-full border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900",
                NEST_OVERLAY_INNER_RADIUS_CLASS,
                "outline-none transition-colors shadow-none",
                "focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100",
                "min-h-[120px] resize-none leading-relaxed disabled:opacity-60",
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
            onClick={() => void send()}
            disabled={sending || !suggestion.canSend || !message.trim()}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 bg-gray-900 px-3.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50",
              NEST_OVERLAY_INNER_RADIUS_CLASS,
            )}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Send message
          </button>
        </div>
      </div>
    </div>
  );
}

export function NestHiddenPickupSuggestionRow({
  suggestion,
  onOpen,
  onRestore,
  restoring = false,
}: {
  suggestion: NestPickupSuggestion & { hiddenAt?: string };
  onOpen: (suggestion: NestPickupSuggestion) => void;
  onRestore: (suggestion: NestPickupSuggestion) => void;
  restoring?: boolean;
}) {
  const hiddenLabel = suggestion.hiddenAt
    ? new Date(suggestion.hiddenAt).toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className={NEST_PICKUP_SUGGESTION_CARD_CLASS}>
      <button
        type="button"
        onClick={() => onOpen(suggestion)}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
      >
        <NestPickupSuggestionLabel suggestion={suggestion} />
        {hiddenLabel ? (
          <span className="text-xs text-gray-500">Hidden {hiddenLabel}</span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={() => onRestore(suggestion)}
        disabled={restoring}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        {restoring ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RotateCcw className="h-3 w-3" />
        )}
        Restore
      </button>
    </div>
  );
}

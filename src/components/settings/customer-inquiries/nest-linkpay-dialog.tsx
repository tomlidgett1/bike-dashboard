"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPaymentLinkMessage } from "@/lib/nest/sms-link-format";

function formatAud(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

export function NestLinkPayDialog({
  open,
  onOpenChange,
  chatId,
  onDraftMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  /** Puts the Agent Pay checkout link into the compose input for staff to edit (does not send). */
  onDraftMessage: (content: string) => void;
}) {
  const [amountText, setAmountText] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [creditBalance, setCreditBalance] = React.useState<number | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const amountRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setAmountText("");
    setDescription("");
    setError(null);
    window.setTimeout(() => amountRef.current?.focus(), 50);

    let cancelled = false;
    void fetch(`/api/store/linkpay-requests?chatId=${encodeURIComponent(chatId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { creditBalance?: number } | null) => {
        if (cancelled || !data) return;
        setCreditBalance(typeof data.creditBalance === "number" ? data.creditBalance : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, chatId]);

  const amount = Number.parseFloat(amountText);
  const amountValid = Number.isFinite(amount) && amount >= 1 && amount <= 10000;

  async function submit() {
    if (!amountValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/store/linkpay-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          amount: Math.round(amount * 100) / 100,
          description: description.trim(),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not create the LinkPay checkout link.");
      }
      onDraftMessage(
        buildPaymentLinkMessage({
          amount,
          description: description.trim(),
          url: data.url,
          formatAmount: formatAud,
        }),
      );
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the LinkPay checkout link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={() => !submitting && onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white p-5 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">LinkPay</h3>
            <p className="mt-1 text-sm text-gray-500">
              Creates a Linq Agent Pay checkout card and drops it into your message box so
              you can edit before sending. On iPhone it opens as an Apple Pay App Clip;
              everywhere else it opens a web checkout. Once paid, the amount is deposited
              onto their Lightspeed credit account.
              {creditBalance != null && creditBalance > 0
                ? ` Current Yellow Jersey credit: ${formatAud(creditBalance)}.`
                : ""}
            </p>
          </div>
          <Image
            src="/linkpay.svg"
            alt="LinkPay"
            width={28}
            height={28}
            className="mt-0.5 h-7 w-7 shrink-0 opacity-90"
            unoptimized
          />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-4 space-y-3"
        >
          <div>
            <label htmlFor="linkpay-amount" className="text-xs font-medium text-gray-700">
              Amount (AUD)
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                $
              </span>
              <Input
                id="linkpay-amount"
                ref={amountRef}
                type="number"
                inputMode="decimal"
                min={1}
                max={10000}
                step="0.01"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                placeholder="0.00"
                className="h-9 rounded-md pl-7 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="linkpay-description" className="text-xs font-medium text-gray-700">
              What&apos;s it for <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <Input
              id="linkpay-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. deposit on the Trek Domane"
              maxLength={200}
              className="mt-1 h-9 rounded-md text-sm"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="rounded-md"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-md" disabled={!amountValid || submitting}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {submitting ? "Creating link…" : "Add to message"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

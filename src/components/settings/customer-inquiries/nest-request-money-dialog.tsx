"use client";

import * as React from "react";
import { Check, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PaymentRequestSummary = {
  id: string;
  amount: number;
  description: string | null;
  status: "pending" | "paid" | "canceled";
  createdAt: string;
};

function formatAud(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

function buildRequestMessage(amount: number, description: string, url: string) {
  const forPart = description ? ` for ${description}` : "";
  return `Here's a secure payment link${forPart} — ${formatAud(amount)}: ${url}\n\nOnce paid, it's added to your store credit in Lightspeed.`;
}

export function NestRequestMoneyDialog({
  open,
  onOpenChange,
  chatId,
  onSendMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  onSendMessage: (content: string) => Promise<void>;
}) {
  const [amountText, setAmountText] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [recent, setRecent] = React.useState<PaymentRequestSummary[]>([]);
  const [creditBalance, setCreditBalance] = React.useState<number | null>(null);
  const amountRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setAmountText("");
    setDescription("");
    setError(null);
    window.setTimeout(() => amountRef.current?.focus(), 50);

    let cancelled = false;
    void fetch(`/api/store/payment-requests?chatId=${encodeURIComponent(chatId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { requests?: PaymentRequestSummary[]; creditBalance?: number } | null) => {
        if (cancelled || !data) return;
        setRecent(data.requests ?? []);
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
      const res = await fetch("/api/store/payment-requests", {
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
        throw new Error(data.error || "Could not create the payment link.");
      }
      await onSendMessage(buildRequestMessage(amount, description.trim(), data.url));
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the payment link.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={() => !submitting && onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white p-5 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
      >
        <h3 className="text-base font-semibold text-gray-900">Request money</h3>
        <p className="mt-1 text-sm text-gray-500">
          Texts the customer a secure Stripe link. Once paid, the amount is deposited
          onto their Lightspeed credit account.
          {creditBalance != null && creditBalance > 0
            ? ` Current Yellow Jersey credit: ${formatAud(creditBalance)}.`
            : ""}
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-4 space-y-3"
        >
          <div>
            <label htmlFor="request-money-amount" className="text-xs font-medium text-gray-700">
              Amount (AUD)
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                $
              </span>
              <Input
                id="request-money-amount"
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
            <label htmlFor="request-money-description" className="text-xs font-medium text-gray-700">
              What&apos;s it for <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <Input
              id="request-money-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. deposit on the Trek Domane"
              maxLength={200}
              className="mt-1 h-9 rounded-md text-sm"
            />
          </div>

          {error ? <p className="text-xs text-gray-600">{error}</p> : null}

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
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>

        {recent.length > 0 ? (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-500">Recent requests</p>
            <ul className="mt-1.5 space-y-1">
              {recent.map((request) => (
                <li
                  key={request.id}
                  className="flex items-center justify-between gap-2 text-sm text-gray-700"
                >
                  <span className="truncate">
                    {formatAud(request.amount)}
                    {request.description ? (
                      <span className="text-gray-400"> — {request.description}</span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
                    {request.status === "paid" ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Paid
                      </>
                    ) : request.status === "canceled" ? (
                      "Cancelled"
                    ) : (
                      "Awaiting payment"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

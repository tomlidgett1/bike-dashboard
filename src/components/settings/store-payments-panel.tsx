"use client";

import * as React from "react";
import {
  AlertCircle,
  Banknote,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  FloatingCard,
  FloatingCardPageBody,
  FloatingCardPageHeader,
} from "@/components/layout/floating-card-page";
import {
  StoreSettingsPageHeader,
  storeSettingsHeaderActionClass,
} from "@/components/settings/actions-page-header";
import { Button } from "@/components/ui/button";
import { floatingCardPageHeaderNudgeClass } from "@/lib/layout/floating-card-page";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

type PaymentEvent = {
  id: string;
  type: string;
  message: string;
  actor: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type PaymentRequestRow = {
  id: string;
  amount: number;
  description: string | null;
  status: "pending" | "paid" | "canceled";
  createdAt: string;
  paidAt: string | null;
  customerName: string | null;
  customerHandle: string | null;
  nestChatId: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  lightspeedSaleId: string | null;
  lightspeedCreditAccountId: string | null;
  lightspeedCustomerId: string | null;
  lightspeedWorkorderId: string | null;
  lightspeedSyncedAt: string | null;
  lightspeedSyncStatus: "pending" | "synced" | "failed" | "skipped";
  lightspeedSyncError: string | null;
  url: string;
  events?: PaymentEvent[];
};

function formatAud(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne",
  }).format(new Date(parsed));
}

function statusLabel(status: PaymentRequestRow["status"]) {
  if (status === "paid") return "Paid";
  if (status === "canceled") return "Cancelled";
  return "Awaiting payment";
}

function lightspeedLabel(status: PaymentRequestRow["lightspeedSyncStatus"]) {
  if (status === "synced") return "Credit in Lightspeed";
  if (status === "failed") return "Lightspeed failed";
  if (status === "skipped") return "Lightspeed skipped";
  return "Lightspeed pending";
}

export function StorePaymentsPanel() {
  const [requests, setRequests] = React.useState<PaymentRequestRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/store/payment-requests?includeEvents=1&limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load payments.");
      setRequests(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payments.");
      setRequests((prev) => prev ?? []);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function retryLightspeed(id: string) {
    setSyncingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/store/payment-requests/${id}/sync-lightspeed`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lightspeed sync failed.");
      await load();
      setExpandedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lightspeed sync failed.");
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <>
      <FloatingCardPageHeader>
        <StoreSettingsPageHeader
          title="Payments"
          icon={Banknote}
          hideCompose
          className={cn(floatingCardPageHeaderNudgeClass, "!static !pb-0")}
          trailingActions={
            <button
              type="button"
              className={storeSettingsHeaderActionClass()}
              onClick={() => void load()}
            >
              <RefreshCw className="size-[15px]" />
              Refresh
            </button>
          }
        />
      </FloatingCardPageHeader>

      <FloatingCardPageBody>
        <FloatingCard>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-t-xl border-b border-border/60 bg-gray-50 px-4 py-3 md:px-5">
            <p className="text-sm text-gray-600">
              Full audit trail for Nest payment requests — Stripe checkout through to Lightspeed.
            </p>
          </div>

          {error ? (
            <div className="mx-4 mt-4 rounded-md border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          {requests === null ? (
            <div className="flex min-h-0 flex-1 items-center justify-center py-20">
              <div
                role="status"
                aria-label="Loading payments"
                className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500"
              />
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white">
                <Banknote className="h-5 w-5 text-gray-400" />
              </span>
              <p className="mt-4 text-sm font-medium text-gray-900">No payment requests yet</p>
              <p className="mt-1 max-w-xs text-sm text-gray-500">
                When you request money from a Nest conversation, every step will show up here.
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
              {requests.map((request) => {
                const open = expandedId === request.id;
                return (
                  <div key={request.id} className="bg-white">
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : request.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 md:px-5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white">
                        <Banknote className="h-4 w-4 text-gray-500" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {request.customerName || request.customerHandle || "Customer"}
                          </p>
                          <span className="shrink-0 text-sm font-medium text-gray-900">
                            {formatAud(request.amount)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {statusLabel(request.status)}
                          {request.description ? ` · ${request.description}` : ""}
                          {` · ${formatWhen(request.paidAt || request.createdAt)}`}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            {request.status === "paid" ? (
                              <span className="inline-flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                Paid
                              </span>
                            ) : (
                              statusLabel(request.status)
                            )}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                              request.lightspeedSyncStatus === "synced"
                                ? "border-gray-200 bg-gray-50 text-gray-700"
                                : request.lightspeedSyncStatus === "failed"
                                  ? "border-gray-300 bg-white text-gray-700"
                                  : "border-gray-200 bg-white text-gray-500",
                            )}
                          >
                            {lightspeedLabel(request.lightspeedSyncStatus)}
                          </span>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
                          open && "rotate-180",
                        )}
                      />
                    </button>

                    <AnimatePresence>
                      {open ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: 0.4,
                            ease: [0.04, 0.62, 0.23, 0.98],
                          }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-4 md:px-5">
                            <div className="mb-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                              <p>
                                <span className="font-medium text-gray-800">Request ID:</span>{" "}
                                {request.id}
                              </p>
                              <p>
                                <span className="font-medium text-gray-800">Mobile:</span>{" "}
                                {request.customerHandle || "—"}
                              </p>
                              <p>
                                <span className="font-medium text-gray-800">Stripe PI:</span>{" "}
                                {request.stripePaymentIntentId || "—"}
                              </p>
                              <p>
                                <span className="font-medium text-gray-800">Lightspeed sale:</span>{" "}
                                {request.lightspeedSaleId || "—"}
                              </p>
                              <p>
                                <span className="font-medium text-gray-800">Credit account:</span>{" "}
                                {request.lightspeedCreditAccountId || "—"}
                              </p>
                            </div>

                            {request.status === "paid" &&
                            request.lightspeedSyncStatus !== "synced" ? (
                              <div className="mb-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-md"
                                  disabled={syncingId === request.id}
                                  onClick={() => void retryLightspeed(request.id)}
                                >
                                  {syncingId === request.id ? (
                                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="mr-1.5 h-4 w-4" />
                                  )}
                                  Sync to Lightspeed
                                </Button>
                                {request.lightspeedSyncError ? (
                                  <p className="mt-2 text-xs text-gray-600">
                                    {request.lightspeedSyncError}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}

                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                              Audit log
                            </p>
                            {(request.events?.length ?? 0) === 0 ? (
                              <p className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-gray-500">
                                No detailed events recorded for this request yet.
                              </p>
                            ) : (
                              <ol className="space-y-2">
                                {request.events?.map((event) => (
                                  <li
                                    key={event.id}
                                    className="rounded-md border border-gray-200 bg-white px-3 py-2.5"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-sm text-gray-900">{event.message}</p>
                                        <p className="mt-0.5 text-[11px] text-gray-500">
                                          {event.type.replaceAll("_", " ")} · {event.actor}
                                        </p>
                                      </div>
                                      <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                                        {formatWhen(event.createdAt)}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </FloatingCard>
      </FloatingCardPageBody>
    </>
  );
}

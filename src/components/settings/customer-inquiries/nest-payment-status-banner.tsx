"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { LightspeedMark } from "@/components/settings/customer-inquiries/parts";
import { Button } from "@/components/ui/button";
import { lightspeedSaleUrl } from "@/lib/services/lightspeed/web-urls";
import { cn } from "@/lib/utils";

export type NestChatPaymentRequest = {
  id: string;
  amount: number;
  description: string | null;
  status: "pending" | "paid" | "canceled";
  createdAt: string;
  paidAt: string | null;
  url: string;
  lightspeedSaleId?: string | null;
  lightspeedCreditAccountId?: string | null;
  lightspeedCustomerId?: string | null;
  lightspeedSyncedAt?: string | null;
  lightspeedSyncStatus?: "pending" | "synced" | "failed" | "skipped";
  lightspeedSyncError?: string | null;
};

const INITIAL_VISIBLE = 2;

function formatAud(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne",
  }).format(new Date(parsed));
}

function StripeMark({ className }: { className?: string }) {
  return (
    <Image
      src="/stripe.svg"
      alt=""
      width={48}
      height={20}
      className={cn("h-3 w-auto object-contain opacity-80", className)}
      unoptimized
    />
  );
}

function PaymentRow({
  request,
  syncing,
  onRetry,
}: {
  request: NestChatPaymentRequest;
  syncing: boolean;
  onRetry: () => void;
}) {
  const paid = request.status === "paid";
  const syncStatus = request.lightspeedSyncStatus ?? "pending";
  const paidWhen = formatWhen(request.paidAt);
  const syncedWhen = formatWhen(request.lightspeedSyncedAt);
  const saleHref =
    paid && syncStatus === "synced" && request.lightspeedSaleId
      ? lightspeedSaleUrl(request.lightspeedSaleId)
      : null;

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {paid ? (
            <Check className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" aria-hidden />
          )}
          <span className="shrink-0 text-xs font-medium text-gray-900">
            {formatAud(request.amount)}
          </span>
          {request.description ? (
            <span className="truncate text-xs text-gray-400">{request.description}</span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-[14px] text-[10px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <StripeMark />
            {paid ? (paidWhen ? paidWhen : "Paid") : "Link sent"}
          </span>
          {paid ? (
            saleHref ? (
              <a
                href={saleHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                <LightspeedMark className="h-3 w-3" />
                <span>{syncedWhen ? syncedWhen : "Open in Lightspeed"}</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1">
                <LightspeedMark className="h-3 w-3" />
                {syncStatus === "failed" ? (
                  "Sync failed"
                ) : syncStatus === "skipped" ? (
                  "Skipped"
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Syncing…
                  </span>
                )}
              </span>
            )
          ) : null}
        </div>
      </div>

      {paid && (syncStatus === "failed" || syncStatus === "skipped") ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 rounded-md px-1.5 text-[10px] text-gray-500"
          disabled={syncing}
          onClick={onRetry}
        >
          {syncing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      ) : null}
    </div>
  );
}

/** Compact Stripe payments badge for the conversation header. */
export function NestPaymentStatusBanner({
  chatId,
  className,
}: {
  chatId: string;
  className?: string;
}) {
  const [requests, setRequests] = React.useState<NestChatPaymentRequest[] | null>(null);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(
        `/api/store/payment-requests?chatId=${encodeURIComponent(chatId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        requests?: NestChatPaymentRequest[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not load payments.");
      setRequests(data.requests ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payments.");
      setRequests((prev) => prev ?? []);
    }
  }, [chatId]);

  React.useEffect(() => {
    setOpen(false);
    setShowAll(false);
  }, [chatId]);

  React.useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function retryLightspeed(id: string) {
    setSyncingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/store/payment-requests/${id}/sync-lightspeed`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Lightspeed sync failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lightspeed sync failed.");
    } finally {
      setSyncingId(null);
    }
  }

  const visible = (requests ?? []).filter((request) => {
    if (request.status === "paid") return true;
    if (request.status !== "pending") return false;
    const created = Date.parse(request.createdAt);
    if (Number.isNaN(created)) return false;
    return Date.now() - created < 48 * 60 * 60 * 1000;
  });

  if (requests === null) return null;
  if (visible.length === 0 && !error) return null;

  const paidCount = visible.filter((request) => request.status === "paid").length;
  const awaitingCount = visible.length - paidCount;
  const listed = showAll ? visible : visible.slice(0, INITIAL_VISIBLE);
  const hiddenCount = Math.max(0, visible.length - INITIAL_VISIBLE);

  const summary =
    visible.length === 0
      ? null
      : paidCount > 0 && awaitingCount === 0
        ? paidCount === 1
          ? "Paid"
          : `${paidCount} paid`
        : awaitingCount > 0 && paidCount === 0
          ? awaitingCount === 1
            ? "Awaiting"
            : `${awaitingCount} awaiting`
          : `${paidCount} paid · ${awaitingCount} awaiting`;

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      {visible.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "inline-flex h-7 max-w-[11rem] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 text-left shadow-sm transition-colors hover:bg-gray-50",
            open && "bg-gray-50",
          )}
          aria-expanded={open}
          title={summary ? `${visible.length} payments · ${summary}` : "Payments"}
        >
          <StripeMark className="h-3" />
          <span className="truncate text-[11px] font-medium text-gray-800">
            {visible.length === 1 ? "1 payment" : `${visible.length} payments`}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-gray-400 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      ) : null}

      <AnimatePresence>
        {open && visible.length > 0 ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="absolute right-0 top-full z-40 mt-1.5 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            <div className="border-b border-gray-100 px-2.5 py-1.5">
              <p className="text-[11px] font-medium text-gray-800">
                {visible.length === 1 ? "1 payment" : `${visible.length} payments`}
              </p>
              {summary ? <p className="text-[10px] text-gray-400">{summary}</p> : null}
            </div>
            <div>
              {listed.map((request) => (
                <PaymentRow
                  key={request.id}
                  request={request}
                  syncing={syncingId === request.id}
                  onRetry={() => void retryLightspeed(request.id)}
                />
              ))}
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAll((value) => !value)}
                  className="w-full border-t border-gray-50 px-2.5 py-1.5 text-left text-[11px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                >
                  {showAll ? "Show less" : `Show ${hiddenCount} more`}
                </button>
              ) : null}
            </div>
            {error ? (
              <div className="border-t border-gray-100 px-2.5 py-1.5 text-[10px] text-gray-600">
                <span className="inline-flex items-start gap-1">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                  {error}
                </span>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

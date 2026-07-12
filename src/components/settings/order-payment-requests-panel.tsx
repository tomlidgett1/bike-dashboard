"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  ChevronDown,
  ExternalLink,
  Loader2,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function buildNestEnquiryUrl(chatId: string) {
  const params = new URLSearchParams({ chatId });
  return `/settings/store/customer-inquiries?${params.toString()}`;
}

type PaymentEvent = {
  id: string;
  type: string;
  message: string;
  actor: string;
  createdAt: string;
};

export type PaymentRequestRow = {
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
  lightspeedSyncStatus?: "pending" | "synced" | "failed" | "skipped";
  lightspeedSaleId?: string | null;
  lightspeedSyncError?: string | null;
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

function statusDotClass(status: PaymentRequestRow["status"]) {
  if (status === "paid") return "bg-emerald-500";
  if (status === "pending") return "bg-amber-500";
  return "bg-gray-400";
}

function isPhoneLike(value: string | null | undefined) {
  if (!value?.trim()) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8;
}

function resolveCustomerDisplay(request: PaymentRequestRow) {
  const name = request.customerName?.trim() || null;
  const handle = request.customerHandle?.trim() || null;

  if (name && !isPhoneLike(name)) {
    return {
      name,
      subtitle: handle && handle !== name ? handle : null,
    };
  }

  if (handle && !isPhoneLike(handle)) {
    return { name: handle, subtitle: null };
  }

  return {
    name: name || handle || "Customer",
    subtitle: handle && name !== handle ? handle : null,
  };
}

function PaymentStatusIndicator({ status }: { status: PaymentRequestRow["status"] }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-700">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDotClass(status))} />
      {statusLabel(status)}
    </span>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 break-all text-sm text-gray-900">{value}</p>
    </div>
  );
}

function PaymentRequestDetails({ request }: { request: PaymentRequestRow }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailField label="Payment link" value={request.url} />
        <DetailField label="Request ID" value={request.id} />
        <DetailField label="Mobile" value={request.customerHandle || "—"} />
        <DetailField label="Stripe session" value={request.stripeSessionId || "—"} />
        <DetailField label="Stripe payment intent" value={request.stripePaymentIntentId || "—"} />
        <DetailField label="Requested" value={formatWhen(request.createdAt)} />
        <DetailField label="Paid" value={formatWhen(request.paidAt)} />
        {request.status === "paid" && request.lightspeedSaleId ? (
          <DetailField label="Lightspeed sale" value={request.lightspeedSaleId} />
        ) : null}
      </div>

      {(request.events?.length ?? 0) > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Activity
          </p>
          <ol className="space-y-2">
            {request.events?.map((event) => (
              <li
                key={event.id}
                className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{event.message}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {event.type.replaceAll("_", " ")} · {event.actor}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                  {formatWhen(event.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function PaymentRequestRowContent({
  request,
  expanded,
  onToggle,
}: {
  request: PaymentRequestRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const customer = resolveCustomerDisplay(request);

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white">
          <Banknote className="h-4 w-4 text-gray-500" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{customer.name}</p>
              {customer.subtitle ? (
                <p className="truncate text-xs text-muted-foreground">{customer.subtitle}</p>
              ) : null}
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {request.description?.trim() || "Payment request"}
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
              {formatAud(request.amount)}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <PaymentStatusIndicator status={request.status} />
            <span className="text-xs text-muted-foreground">{formatWhen(request.createdAt)}</span>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {expanded ? (
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
            <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4">
              <PaymentRequestDetails request={request} />
              {request.nestChatId ? (
                <Link
                  href={buildNestEnquiryUrl(request.nestChatId)}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open enquiry
                </Link>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function OrderPaymentRequestsPanel({
  requests,
  loading,
}: {
  requests: PaymentRequestRow[];
  loading: boolean;
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-gray-200 bg-white py-16 text-center">
        <Banknote className="mb-3 h-8 w-8 text-gray-300" />
        <p className="text-sm font-medium text-gray-900">No payment requests yet</p>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Stripe deposits and payment links sent from customer inquiries will appear here.
        </p>
      </div>
    );
  }

  const toggleExpanded = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => {
              const customer = resolveCustomerDisplay(request);
              const expanded = expandedId === request.id;

              return (
                <React.Fragment key={request.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpanded(request.id)}
                  >
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{customer.name}</p>
                        {customer.subtitle ? (
                          <p className="truncate text-xs text-muted-foreground">{customer.subtitle}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm text-gray-700">
                      {request.description?.trim() || "Payment request"}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusIndicator status={request.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatWhen(request.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatWhen(request.paidAt)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatAud(request.amount)}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {request.nestChatId ? (
                          <Link
                            href={buildNestEnquiryUrl(request.nestChatId)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                            title="Open enquiry"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        ) : null}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-gray-400 transition-transform duration-200",
                            expanded && "rotate-180",
                          )}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="p-0">
                      <AnimatePresence>
                        {expanded ? (
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
                            <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4">
                              <PaymentRequestDetails request={request} />
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y divide-gray-100 sm:hidden">
        {requests.map((request) => (
          <div key={request.id} className="bg-white">
            <PaymentRequestRowContent
              request={request}
              expanded={expandedId === request.id}
              onToggle={() => toggleExpanded(request.id)}
            />
          </div>
        ))}
      </div>
    </>
  );
}

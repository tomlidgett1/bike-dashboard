"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  EyeOff,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchCustomerInquiries,
  fetchCustomerInquiry,
  mintCustomerInquiriesGmailConnectUrl,
  refreshCustomerInquiries,
  regenerateCustomerInquiryDraft,
  sendCustomerInquiryReply,
  updateCustomerInquiry,
  type CustomerInquiryDetail,
  type CustomerInquiriesResponse,
} from "@/lib/customer-inquiries/client";
import type {
  CustomerInquiryListItem,
  CustomerInquiryStatus,
} from "@/lib/customer-inquiries/types";

type StatusFilter = CustomerInquiryStatus | "all";

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "draft_ready", label: "Ready" },
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "sent", label: "Sent" },
  { id: "ignored", label: "Ignored" },
];

const INTENT_LABELS: Record<string, string> = {
  technical_question: "Technical",
  service_booking: "Service",
  stock_check: "Stock",
  quote_request: "Quote",
  warranty: "Warranty",
  order_status: "Order",
  general_reply: "General",
};

function statusLabel(status: CustomerInquiryStatus): string {
  if (status === "draft_ready") return "Ready";
  if (status === "processing") return "Processing";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function senderName(
  item: Pick<CustomerInquiryListItem, "sender_name" | "sender_email">,
): string {
  return item.sender_name?.trim() || item.sender_email || "Customer";
}

function initials(name: string): string {
  const parts = name
    .replace(/[<>"]/g, "")
    .replace(/\(.+?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

function enquirySummary(item: CustomerInquiryListItem): string {
  const preview = firstLine(item.body_preview || item.snippet);
  if (preview) return preview.slice(0, 160);
  const subject = item.subject?.trim();
  if (subject && !/^re:/i.test(subject)) return subject;
  return "Customer enquiry";
}

function relativeTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function fullTime(value: string | null): string {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function intentLabel(intent: string | null | undefined): string | null {
  if (!intent) return null;
  return INTENT_LABELS[intent] ?? null;
}

export function StoreCustomerInquiriesPanel() {
  const [filter, setFilter] = React.useState<StatusFilter>("draft_ready");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [gmailState, setGmailState] = React.useState<CustomerInquiriesResponse["gmail"]>(undefined);
  const [inquiries, setInquiries] = React.useState<CustomerInquiryListItem[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<CustomerInquiryDetail | null>(null);
  const [draft, setDraft] = React.useState("");
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [citationsOpen, setCitationsOpen] = React.useState(true);
  const [lightspeedOpen, setLightspeedOpen] = React.useState(true);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = React.useState(false);

  const loadList = React.useCallback(async (status: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomerInquiries(status);
      setInquiries(data.inquiries ?? []);
      setGmailState(data.gmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load enquiries.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadList(filter);
  }, [filter, loadList]);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDraft("");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setActionMessage(null);

    void fetchCustomerInquiry(selectedId)
      .then(({ inquiry }) => {
        if (cancelled) return;
        setDetail(inquiry);
        setDraft(inquiry.draft_body);
      })
      .catch((err) => {
        if (cancelled) return;
        setActionMessage(err instanceof Error ? err.message : "Could not load enquiry.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const data = await refreshCustomerInquiries();
      setInquiries(data.inquiries ?? []);
      setGmailState(data.gmail);
      if (selectedId) {
        const { inquiry } = await fetchCustomerInquiry(selectedId);
        setDetail(inquiry);
        setDraft(inquiry.draft_body);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh enquiries.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleConnectGmail() {
    setConnecting(true);
    setError(null);
    try {
      const url = await mintCustomerInquiriesGmailConnectUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Gmail connection.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleIgnore() {
    if (!selectedId || !detail) return;
    try {
      const { inquiry } = await updateCustomerInquiry(selectedId, { status: "ignored" });
      setDetail(inquiry);
      setInquiries((rows) =>
        rows.map((row) => (row.id === inquiry.id ? { ...row, status: inquiry.status } : row)),
      );
      setActionMessage("Enquiry ignored.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Could not ignore enquiry.");
    }
  }

  async function handleRegenerate() {
    if (!selectedId) return;
    setRegenerating(true);
    setActionMessage(null);
    try {
      const { inquiry } = await regenerateCustomerInquiryDraft(selectedId);
      setDetail(inquiry);
      setDraft(inquiry.draft_body);
      setInquiries((rows) =>
        rows.map((row) =>
          row.id === inquiry.id
            ? {
                ...row,
                status: inquiry.status,
                draft_body: inquiry.draft_body,
                updated_at: inquiry.updated_at,
              }
            : row,
        ),
      );
      setActionMessage("Draft regenerated.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Could not regenerate draft.");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSend() {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    setActionMessage(null);
    try {
      const { message, inquiry } = await sendCustomerInquiryReply(selectedId, draft.trim());
      setDetail(inquiry);
      setDraft(inquiry.draft_body);
      setInquiries((rows) =>
        rows.map((row) =>
          row.id === inquiry.id
            ? {
                ...row,
                status: inquiry.status,
                draft_body: inquiry.draft_body,
                updated_at: inquiry.updated_at,
              }
            : row,
        ),
      );
      setSendConfirmOpen(false);
      setActionMessage(message);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Could not send reply.");
    } finally {
      setSending(false);
    }
  }

  const gmailConnected = gmailState?.connected === true;
  const gmailConfigured = gmailState?.configured !== false;
  const lightspeedContext = detail?.lightspeed_context as
    | {
        matched?: boolean;
        customer_name?: string | null;
        customer_email?: string | null;
        customer_phone?: string | null;
        bikes?: Array<{ label: string | null; serial: string | null }>;
        recent_workorders?: Array<{ id: string; title: string | null; status: string | null }>;
        summary?: string | null;
      }
    | undefined;

  if (gmailConfigured && !gmailConnected) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#f6f6f4] p-6">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 ring-1 ring-black/[0.06]">
            <GmailLogo />
          </span>
          <p className="mt-4 text-base font-medium text-gray-900">Connect your store inbox</p>
          <p className="mx-auto mt-1 text-sm text-gray-500">
            Sync customer enquiries and draft replies in your shop voice.
          </p>
          {error ? <p className="mt-3 text-xs text-gray-500">{error}</p> : null}
          <Button
            type="button"
            className="mt-5 rounded-md"
            onClick={() => void handleConnectGmail()}
            disabled={connecting}
          >
            {connecting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-4 w-4" />
            )}
            Connect Gmail
          </Button>
        </div>
      </div>
    );
  }

  if (!gmailConfigured) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#f6f6f4] p-6">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          Gmail integration is not configured for this environment.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-white">
      {/* LEFT — enquiry list */}
      <aside
        className={cn(
          "min-h-0 w-full flex-col border-r border-gray-200 lg:flex lg:w-[372px] lg:shrink-0",
          selectedId ? "hidden lg:flex" : "flex",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2.5 pt-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Enquiries</h2>
            {!loading ? (
              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
                {inquiries.length}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md px-2.5"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <div className="shrink-0 px-4 pb-3">
          <div className="flex items-center gap-0.5 overflow-x-auto rounded-md bg-gray-100 p-0.5">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  filter === item.id
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="mx-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <span>{error}</span>
              </div>
            </div>
          ) : inquiries.length === 0 ? (
            <div className="mx-2 mt-6 flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 ring-1 ring-black/[0.05]">
                <Inbox className="h-5 w-5 text-gray-400" />
              </span>
              <p className="mt-3 text-sm font-medium text-gray-900">Nothing here yet</p>
              <p className="mt-1 text-[12.5px] text-gray-500">
                New emails appear after each sync.
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {inquiries.map((item) => {
                const name = senderName(item);
                const time = relativeTime(item.received_at);
                const selected = item.id === selectedId;
                const isReady = item.status === "draft_ready";
                const muted = item.status === "sent" || item.status === "ignored";
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        selected ? "bg-gray-100" : "hover:bg-gray-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                          muted ? "bg-gray-100 text-gray-400" : "bg-gray-200/70 text-gray-700",
                        )}
                      >
                        {initials(name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "truncate text-[13px] font-semibold",
                              muted ? "text-gray-500" : "text-gray-900",
                            )}
                          >
                            {name}
                          </p>
                          <span className="shrink-0 text-[11px] text-gray-400">{time}</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-[12.5px] text-gray-500">
                            {enquirySummary(item)}
                          </p>
                          {isReady ? (
                            <span className="shrink-0 rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              Ready
                            </span>
                          ) : item.status !== "new" ? (
                            <span className="shrink-0 text-[10px] font-medium text-gray-400">
                              {statusLabel(item.status)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* RIGHT — detail */}
      <section
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col bg-[#f6f6f4]",
          selectedId ? "flex" : "hidden lg:flex",
        )}
      >
        {!selectedId ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.05]">
              <Mail className="h-5 w-5 text-gray-400" />
            </span>
            <p className="mt-4 text-sm font-medium text-gray-900">Select an enquiry</p>
            <p className="mt-1 max-w-xs text-[13px] text-gray-500">
              Pick a customer on the left to see their message, Lightspeed history, and the AI
              drafted reply. Nothing sends until you approve.
            </p>
          </div>
        ) : detailLoading || !detail ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading enquiry…
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white/80 px-4 py-2.5 backdrop-blur-sm lg:hidden">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Enquiries
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8 lg:py-7">
              <AnimatePresence mode="wait">
                <motion.div
                  key={detail.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                  className="mx-auto max-w-2xl space-y-3"
                >
                  <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="flex items-start gap-3.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-200/70 text-sm font-semibold text-gray-700">
                        {initials(senderName(detail))}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-gray-900">
                              {senderName(detail)}
                            </p>
                            <p className="truncate text-[13px] text-gray-500">
                              {detail.sender_email}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600">
                            {statusLabel(detail.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {fullTime(detail.received_at)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-md bg-gray-50 p-4">
                      {detail.subject ? (
                        <p className="mb-1.5 text-[13px] font-medium text-gray-900">
                          {detail.subject}
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
                        {detail.body_preview || detail.snippet}
                      </p>
                    </div>
                  </div>

                  {lightspeedContext ? (
                    <div className="rounded-xl border border-gray-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setLightspeedOpen((open) => !open)}
                        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                          Lightspeed
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                              lightspeedContext.matched
                                ? "bg-gray-900 text-white"
                                : "border border-gray-200 bg-white text-gray-400",
                            )}
                          >
                            {lightspeedContext.matched ? "Matched" : "No match"}
                          </span>
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-gray-400 transition-transform duration-200",
                            lightspeedOpen && "rotate-180",
                          )}
                        />
                      </button>
                      <AnimatePresence>
                        {lightspeedOpen ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-gray-100 px-5 pb-5 pt-3 text-[13px] text-gray-700">
                              {lightspeedContext.matched ? (
                                <div className="space-y-3">
                                  {lightspeedContext.summary ? (
                                    <p className="leading-relaxed">{lightspeedContext.summary}</p>
                                  ) : null}
                                  {lightspeedContext.customer_phone ? (
                                    <p className="text-xs text-gray-500">
                                      Phone: {lightspeedContext.customer_phone}
                                    </p>
                                  ) : null}
                                  {lightspeedContext.bikes?.length ? (
                                    <div>
                                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                                        Bikes
                                      </p>
                                      <ul className="mt-1.5 space-y-1">
                                        {lightspeedContext.bikes.map((bike, idx) => (
                                          <li key={`${bike.serial ?? bike.label ?? idx}`}>
                                            {bike.label || "Bike"}
                                            {bike.serial ? ` · ${bike.serial}` : ""}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                  {lightspeedContext.recent_workorders?.length ? (
                                    <div>
                                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                                        Recent workorders
                                      </p>
                                      <ul className="mt-1.5 space-y-1">
                                        {lightspeedContext.recent_workorders.map((workorder) => (
                                          <li key={workorder.id}>
                                            {workorder.title || `Workorder ${workorder.id}`}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <p>
                                  {lightspeedContext.summary ||
                                    "No matching Lightspeed customer found for this sender."}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  ) : null}

                  {detail.citations?.length ? (
                    <div className="rounded-xl border border-gray-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setCitationsOpen((open) => !open)}
                        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
                      >
                        <span className="text-sm font-medium text-gray-900">
                          Sources ({detail.citations.length})
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-gray-400 transition-transform duration-200",
                            citationsOpen && "rotate-180",
                          )}
                        />
                      </button>
                      <AnimatePresence>
                        {citationsOpen ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                            className="overflow-hidden"
                          >
                            <ul className="space-y-2 border-t border-gray-100 px-5 pb-5 pt-3">
                              {detail.citations.map((citation) => (
                                <li key={citation.url}>
                                  <a
                                    href={citation.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-[13px] text-gray-700 hover:text-gray-900"
                                  >
                                    <span className="truncate">
                                      {citation.title || citation.url}
                                    </span>
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Suggested reply</p>
                        {detail.reasoning ? (
                          <p className="mt-0.5 text-[12px] leading-relaxed text-gray-500">
                            {detail.reasoning}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-md"
                        onClick={() => void handleRegenerate()}
                        disabled={regenerating || detail.status === "sent"}
                      >
                        {regenerating ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Regenerate
                      </Button>
                    </div>

                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      disabled={detail.status === "sent" || detail.status === "ignored"}
                      rows={10}
                      className="mt-3 w-full rounded-md border border-gray-200 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-gray-800 outline-none transition-colors focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
                      placeholder="Draft reply will appear once processing completes."
                    />

                    {detail.error_message ? (
                      <div className="mt-3 rounded-xl bg-white p-3 text-[12px] text-gray-600 ring-1 ring-gray-200">
                        {detail.error_message}
                      </div>
                    ) : null}
                    {actionMessage ? (
                      <p className="mt-3 text-[12px] text-gray-600">{actionMessage}</p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        className="rounded-md"
                        onClick={() => setSendConfirmOpen(true)}
                        disabled={
                          sending ||
                          !draft.trim() ||
                          detail.status === "sent" ||
                          detail.status === "ignored" ||
                          detail.status === "processing"
                        }
                      >
                        <Send className="mr-1.5 h-4 w-4" />
                        Send reply
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-md"
                        onClick={() => void handleIgnore()}
                        disabled={detail.status === "sent" || detail.status === "ignored"}
                      >
                        <EyeOff className="mr-1.5 h-4 w-4" />
                        Ignore
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </section>

      {sendConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
            onClick={() => !sending && setSendConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white p-5 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
          >
            <h3 className="text-base font-semibold text-gray-900">Send this reply?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This sends your edited draft to {detail?.sender_email}. Nothing goes out until you
              confirm.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                onClick={() => setSendConfirmOpen(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-md"
                onClick={() => void handleSend()}
                disabled={sending || !draft.trim()}
              >
                {sending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                Send now
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ExternalLink,
  EyeOff,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { PageHeader } from "@/components/dashboard";
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
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "draft_ready", label: "Draft ready" },
  { id: "sent", label: "Sent" },
  { id: "ignored", label: "Ignored" },
  { id: "error", label: "Error" },
];

function statusLabel(status: CustomerInquiryStatus): string {
  if (status === "draft_ready") return "Draft ready";
  if (status === "processing") return "Processing";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatReceivedAt(value: string | null): string {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function senderName(item: Pick<CustomerInquiryListItem, "sender_name" | "sender_email">): string {
  return item.sender_name?.trim() || item.sender_email || "Customer";
}

export function StoreCustomerInquiriesPanel() {
  const [filter, setFilter] = React.useState<StatusFilter>("all");
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
  const [citationsOpen, setCitationsOpen] = React.useState(false);
  const [lightspeedOpen, setLightspeedOpen] = React.useState(false);
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
      setError(err instanceof Error ? err.message : "Could not load inquiries.");
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
        setActionMessage(err instanceof Error ? err.message : "Could not load inquiry.");
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
      setError(err instanceof Error ? err.message : "Could not refresh inquiries.");
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
      setActionMessage("Inquiry ignored.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Could not ignore inquiry.");
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
            ? { ...row, status: inquiry.status, draft_body: inquiry.draft_body, updated_at: inquiry.updated_at }
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
        matched?: boolean
        customer_name?: string | null
        customer_email?: string | null
        customer_phone?: string | null
        bikes?: Array<{ label: string | null; serial: string | null }>
        recent_workorders?: Array<{ id: string; title: string | null; status: string | null }>
        summary?: string | null
      }
    | undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-4 lg:px-6">
        <PageHeader
          title="Customer inquiries"
          description="Inbound Gmail enquiries sync every two minutes. Review drafts, edit replies, and send only when you are ready."
          actions={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md"
                onClick={() => void handleRefresh()}
                disabled={refreshing || !gmailConnected}
              >
                {refreshing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Refresh now
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 w-full flex-col border-b border-gray-200 lg:w-[360px] lg:border-b-0 lg:border-r">
          <div className="border-b border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit overflow-x-auto">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
                    filter === item.id
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-3">
            {!gmailConfigured ? (
              <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">
                Gmail integration is not configured for this environment.
              </div>
            ) : !gmailConnected ? (
              <div className="rounded-md border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white ring-1 ring-black/[0.06]">
                    <GmailLogo />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Connect Gmail</p>
                    <p className="text-xs text-gray-500">
                      Link your store inbox to sync customer enquiries and draft replies.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="mt-3 rounded-md"
                  onClick={() => void handleConnectGmail()}
                  disabled={connecting}
                >
                  {connecting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
                  Connect Gmail
                </Button>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading inquiries…
              </div>
            ) : error ? (
              <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  <span>{error}</span>
                </div>
              </div>
            ) : inquiries.length === 0 ? (
              <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">
                No inquiries in this view yet. New customer emails will appear here after the next sync.
              </div>
            ) : (
              <div className="space-y-2">
                {inquiries.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "w-full rounded-md border bg-white p-3 text-left transition-colors",
                      selectedId === item.id
                        ? "border-gray-300 shadow-sm"
                        : "border-gray-200 hover:border-gray-300",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {senderName(item)}
                        </p>
                        <p className="truncate text-xs text-gray-500">{item.subject || "(No subject)"}</p>
                      </div>
                      <span className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-gray-600">{item.snippet}</p>
                    <p className="mt-2 text-[11px] text-gray-400">{formatReceivedAt(item.received_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          {!selectedId ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500">
              Select an inquiry to review the message, context, and draft reply.
            </div>
          ) : detailLoading ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading inquiry…
            </div>
          ) : detail ? (
            <div className="space-y-4 p-4 lg:p-6">
              <div className="rounded-md border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{senderName(detail)}</p>
                    <p className="text-xs text-gray-500">{detail.sender_email}</p>
                    <h2 className="mt-2 text-base font-semibold text-gray-900">
                      {detail.subject || "(No subject)"}
                    </h2>
                    <p className="mt-1 text-xs text-gray-400">{formatReceivedAt(detail.received_at)}</p>
                  </div>
                  <span className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                    {statusLabel(detail.status)}
                  </span>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">
                  {detail.body_preview || detail.snippet}
                </p>
              </div>

              {lightspeedContext ? (
                <div className="rounded-md border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setLightspeedOpen((open) => !open)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-medium text-gray-900">Lightspeed context</span>
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
                        <div className="border-t border-gray-200 px-4 pb-4 pt-2 text-sm text-gray-700">
                          {lightspeedContext.matched ? (
                            <div className="space-y-2">
                              <p>{lightspeedContext.summary}</p>
                              {lightspeedContext.customer_phone ? (
                                <p className="text-xs text-gray-500">
                                  Phone: {lightspeedContext.customer_phone}
                                </p>
                              ) : null}
                              {lightspeedContext.bikes?.length ? (
                                <div>
                                  <p className="text-xs font-medium text-gray-500">Bikes</p>
                                  <ul className="mt-1 space-y-1">
                                    {lightspeedContext.bikes.map((bike, index) => (
                                      <li key={`${bike.serial ?? bike.label ?? index}`} className="text-sm">
                                        {bike.label || "Bike"}
                                        {bike.serial ? ` · ${bike.serial}` : ""}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {lightspeedContext.recent_workorders?.length ? (
                                <div>
                                  <p className="text-xs font-medium text-gray-500">Recent workorders</p>
                                  <ul className="mt-1 space-y-1">
                                    {lightspeedContext.recent_workorders.map((workorder) => (
                                      <li key={workorder.id} className="text-sm">
                                        {workorder.title || `Workorder ${workorder.id}`}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <p>{lightspeedContext.summary || "No matching Lightspeed customer found."}</p>
                          )}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}

              {detail.citations?.length ? (
                <div className="rounded-md border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setCitationsOpen((open) => !open)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-medium text-gray-900">
                      Official sources ({detail.citations.length})
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
                        <ul className="space-y-2 border-t border-gray-200 px-4 pb-4 pt-2">
                          {detail.citations.map((citation) => (
                            <li key={citation.url}>
                              <a
                                href={citation.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
                              >
                                <span className="truncate">{citation.title || citation.url}</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}

              <div className="rounded-md border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Draft reply</p>
                    {detail.reasoning ? (
                      <p className="mt-1 text-xs text-gray-500">{detail.reasoning}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md"
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
                  rows={12}
                  className="mt-3 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none ring-0 focus:border-gray-300"
                  placeholder="Draft reply will appear here once processing completes."
                />

                {detail.error_message ? (
                  <p className="mt-3 text-xs text-gray-600">{detail.error_message}</p>
                ) : null}

                {actionMessage ? (
                  <p className="mt-3 text-xs text-gray-600">{actionMessage}</p>
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
            </div>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
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
              className="relative z-10 w-full max-w-lg overflow-hidden rounded-md border border-gray-200 bg-white p-5 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
            >
              <h3 className="text-base font-semibold text-gray-900">Send this reply?</h3>
              <p className="mt-2 text-sm text-gray-600">
                This will send the edited draft to {detail?.sender_email}. Nothing is sent until you confirm.
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
                  {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  Send now
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

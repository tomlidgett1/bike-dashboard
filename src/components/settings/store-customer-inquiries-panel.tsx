"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
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
  { id: "draft_ready", label: "Ready" },
  { id: "new", label: "New" },
  { id: "sent", label: "Sent" },
  { id: "ignored", label: "Ignored" },
];

function statusLabel(status: CustomerInquiryStatus): string {
  if (status === "draft_ready") return "Ready";
  if (status === "processing") return "Processing";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function senderName(item: Pick<CustomerInquiryListItem, "sender_name" | "sender_email">): string {
  return item.sender_name?.trim() || item.sender_email || "Customer";
}

function enquirySummary(item: CustomerInquiryListItem): string {
  const preview = firstLine(item.body_preview || item.snippet);
  if (preview) return preview.slice(0, 140);
  const subject = item.subject?.trim();
  if (subject && !/^re:/i.test(subject)) return subject;
  return "Customer enquiry";
}

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
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
      setSelectedId(null);
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

  const customerMessage = detail
    ? firstLine(detail.body_preview || detail.snippet) || detail.subject || "Customer enquiry"
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7f5]">
      <header className="shrink-0 border-b border-gray-200/80 bg-white/80 px-4 py-4 backdrop-blur-sm lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">Customer enquiries</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Draft replies from your inbox. Nothing sends until you approve it.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-md shrink-0"
            onClick={() => void handleRefresh()}
            disabled={refreshing || !gmailConnected}
          >
            {refreshing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-10 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {!gmailConfigured ? (
            <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
              Gmail integration is not configured for this environment.
            </div>
          ) : !gmailConnected ? (
            <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white ring-1 ring-black/[0.06]">
                <GmailLogo />
              </span>
              <p className="mt-4 text-base font-medium text-gray-900">Connect your store inbox</p>
              <p className="mt-1 text-sm text-gray-500">
                Sync customer enquiries and draft replies in your shop voice.
              </p>
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
          ) : (
            <>
              <div className="flex justify-center">
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                  {STATUS_FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setFilter(item.id);
                        setSelectedId(null);
                      }}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
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

              {loading ? (
                <div className="mt-16 flex items-center justify-center text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading enquiries…
                </div>
              ) : error ? (
                <div className="mt-10 rounded-md border border-gray-200 bg-white p-5 text-sm text-gray-700">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                    <span>{error}</span>
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {!selectedId ? (
                    <motion.div
                      key="pills"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
                      className="mt-12"
                    >
                      {inquiries.length === 0 ? (
                        <p className="text-center text-sm text-gray-500">
                          No enquiries in this view. New customer emails appear here after sync.
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          {inquiries.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSelectedId(item.id)}
                              className="group max-w-sm rounded-full border border-gray-200 bg-white px-5 py-3 text-left shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {senderName(item)}
                                </span>
                                {item.status !== "draft_ready" ? (
                                  <span className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500">
                                    {statusLabel(item.status)}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
                                {enquirySummary(item)}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="detail"
                      initial={{ opacity: 0, y: 24, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 16, scale: 0.98 }}
                      transition={{ duration: 0.35, ease: [0.04, 0.62, 0.23, 0.98] }}
                      className="mt-8"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </button>

                      {detailLoading || !detail ? (
                        <div className="flex items-center justify-center rounded-md border border-gray-200 bg-white py-20 text-sm text-gray-500">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading enquiry…
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="rounded-md border border-gray-200 bg-white p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-base font-semibold text-gray-900">
                                  {senderName(detail)}
                                </p>
                                <p className="text-sm text-gray-500">{detail.sender_email}</p>
                              </div>
                              <span className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600">
                                {statusLabel(detail.status)}
                              </span>
                            </div>
                            <p className="mt-4 text-sm font-medium text-gray-800">{customerMessage}</p>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                              {detail.body_preview || detail.snippet}
                            </p>
                          </div>

                          {lightspeedContext ? (
                            <div className="rounded-md border border-gray-200 bg-white">
                              <button
                                type="button"
                                onClick={() => setLightspeedOpen((open) => !open)}
                                className="flex w-full items-center justify-between px-5 py-4 text-left"
                              >
                                <span className="text-sm font-medium text-gray-900">Lightspeed</span>
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
                                    transition={{
                                      duration: 0.4,
                                      ease: [0.04, 0.62, 0.23, 0.98],
                                    }}
                                    className="overflow-hidden"
                                  >
                                    <div className="border-t border-gray-100 px-5 pb-5 pt-1 text-sm text-gray-700">
                                      {lightspeedContext.matched ? (
                                        <div className="space-y-3">
                                          <p>{lightspeedContext.summary}</p>
                                          {lightspeedContext.customer_phone ? (
                                            <p className="text-xs text-gray-500">
                                              Phone: {lightspeedContext.customer_phone}
                                            </p>
                                          ) : null}
                                          {lightspeedContext.bikes?.length ? (
                                            <div>
                                              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                                                Bikes
                                              </p>
                                              <ul className="mt-1.5 space-y-1">
                                                {lightspeedContext.bikes.map((bike, index) => (
                                                  <li key={`${bike.serial ?? bike.label ?? index}`}>
                                                    {bike.label || "Bike"}
                                                    {bike.serial ? ` · ${bike.serial}` : ""}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          ) : null}
                                          {lightspeedContext.recent_workorders?.length ? (
                                            <div>
                                              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
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
                                        <p>{lightspeedContext.summary || "No matching Lightspeed customer."}</p>
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
                                className="flex w-full items-center justify-between px-5 py-4 text-left"
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
                                    transition={{
                                      duration: 0.4,
                                      ease: [0.04, 0.62, 0.23, 0.98],
                                    }}
                                    className="overflow-hidden"
                                  >
                                    <ul className="space-y-2 border-t border-gray-100 px-5 pb-5 pt-2">
                                      {detail.citations.map((citation) => (
                                        <li key={citation.url}>
                                          <a
                                            href={citation.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
                                          >
                                            <span className="truncate">
                                              {citation.title || citation.url}
                                            </span>
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

                          <div className="rounded-md border border-gray-200 bg-white p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-gray-900">Suggested reply</p>
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
                              rows={10}
                              className="mt-4 w-full rounded-md border border-gray-200 bg-white px-3 py-3 text-sm leading-relaxed text-gray-800 outline-none focus:border-gray-300"
                              placeholder="Draft reply will appear once processing completes."
                            />

                            {detail.error_message ? (
                              <p className="mt-3 text-xs text-gray-600">{detail.error_message}</p>
                            ) : null}
                            {actionMessage ? (
                              <p className="mt-3 text-xs text-gray-600">{actionMessage}</p>
                            ) : null}

                            <div className="mt-5 flex flex-wrap items-center gap-2">
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
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </>
          )}
        </div>
      </main>

      <AnimatePresence>
        {sendConfirmOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <button
              type="button"
              aria-label="Close dialog"
              className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
              onClick={() => !sending && setSendConfirmOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative z-10 w-full max-w-lg rounded-md border border-gray-200 bg-white p-5 sm:mx-4"
            >
              <h3 className="text-base font-semibold text-gray-900">Send this reply?</h3>
              <p className="mt-2 text-sm text-gray-600">
                This sends your edited draft to {detail?.sender_email}. Nothing goes out until you confirm.
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
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

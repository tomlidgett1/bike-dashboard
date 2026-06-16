"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Pencil, RefreshCw, Send, Sparkles } from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import {
  enquirySummary,
  relativeTime,
  senderName,
} from "@/components/settings/customer-inquiries/parts";
import { stripReplyLinks } from "@/components/settings/customer-inquiries/use-inquiries-controller";
import {
  getBentoShellStyles,
  bentoCardShellClassName,
  bentoOuterWrapClassName,
  type BentoShellVariant,
} from "@/components/settings/bento-variant-styles";
import {
  BentoInboxDismissButton,
  BentoInboxEmptyState,
  BentoInboxPrimaryButton,
} from "@/components/settings/bento-inbox-item-actions";
import {
  fetchCustomerInquiries,
  fetchCustomerInquiry,
  mintCustomerInquiriesGmailConnectUrl,
  reviseCustomerInquiryDraft,
  sendCustomerInquiryReply,
  updateCustomerInquiry,
  type CustomerInquiryDetail,
  type CustomerInquiriesResponse,
} from "@/lib/customer-inquiries/client";
import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import { cn } from "@/lib/utils";

type OverivewoTestBentoVariant = BentoShellVariant;

const MARKETING_PREVIEW_ENQUIRIES: CustomerInquiryListItem[] = [
  {
    id: "mk-enq-1",
    sender_name: "Emma Walsh",
    sender_email: "emma@example.com",
    lightspeed_customer_name: null,
    subject: "Orbea pickup today?",
    snippet: "Hi! Is my Orbea ready for pickup this afternoon?",
    body_preview: "Hi! Is my Orbea ready for pickup this afternoon?",
    received_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    intent: "order_status",
    priority: "normal",
    status: "draft_ready",
    draft_body:
      "Hi Emma — yes, your Orbea is ready. We're here until 5:30pm today if that suits.",
    thread_message_count: 1,
    updated_at: new Date().toISOString(),
  },
  {
    id: "mk-enq-2",
    sender_name: "Marcus Chen",
    sender_email: "marcus@example.com",
    lightspeed_customer_name: null,
    subject: "Giro helmet in matte black?",
    snippet: "Do you have the Giro Fixture MIPS in matte black, size M?",
    body_preview: "Do you have the Giro Fixture MIPS in matte black, size M?",
    received_at: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
    intent: "stock_check",
    priority: "normal",
    status: "draft_ready",
    draft_body:
      "Hi Marcus — we have one Giro matte black in M on the shelf. I can hold it under your name until close.",
    thread_message_count: 1,
    updated_at: new Date().toISOString(),
  },
  {
    id: "mk-enq-3",
    sender_name: "Hannah Brooks",
    sender_email: "hannah@example.com",
    lightspeed_customer_name: null,
    subject: "Saturday collection",
    snippet: "Thanks for the service update — can I collect Saturday morning?",
    body_preview: "Thanks for the service update — can I collect Saturday morning?",
    received_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    intent: "service_booking",
    priority: "normal",
    status: "draft_ready",
    draft_body:
      "Hi Hannah — Saturday works. We'll have it on the stand from 9am. See you then!",
    thread_message_count: 1,
    updated_at: new Date().toISOString(),
  },
];

const SLIDE_TRANSITION = { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] as const };
const DISMISS_DELAY_MS = 400;

function inquiryCustomerBody(
  detail: CustomerInquiryDetail | null,
  fallback: CustomerInquiryListItem,
): string {
  const latest =
    detail?.thread_messages?.find((message) => message.is_latest_customer && message.role === "customer") ??
    detail?.thread_messages?.filter((message) => message.role === "customer").at(-1);

  return (
    latest?.body?.trim() ||
    detail?.body_preview?.trim() ||
    fallback.body_preview?.trim() ||
    fallback.snippet?.trim() ||
    "—"
  );
}

function EnquiryListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[88px] animate-pulse rounded-[18px] border border-black/[0.05] bg-white/70"
        />
      ))}
    </div>
  );
}

function EnquiryListItem({
  enquiry,
  listItemBorder,
  onRespond,
  onDismiss,
  ignoring,
}: {
  enquiry: CustomerInquiryListItem;
  listItemBorder: string;
  onRespond: (enquiry: CustomerInquiryListItem) => void;
  onDismiss: (enquiry: CustomerInquiryListItem) => void;
  ignoring?: boolean;
}) {
  const name = senderName(enquiry);

  return (
    <div
      className={cn(
        "group relative flex w-full items-start gap-2.5 rounded-[18px] border bg-white p-3 shadow-sm transition-opacity duration-200",
        listItemBorder,
        ignoring && "pointer-events-none opacity-40",
      )}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#faf7f2] ring-1 ring-black/[0.06]">
        <GmailLogo className="h-[18px] w-auto max-w-[22px] opacity-90" />
      </span>

      <div className="min-w-0 flex-1 pr-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] font-semibold text-gray-900">{name}</p>
          {enquiry.received_at ? (
            <span className="shrink-0 text-[10px] text-gray-400">{relativeTime(enquiry.received_at)}</span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[12px] font-medium text-gray-950">{enquiry.subject}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-900">{enquirySummary(enquiry)}</p>
      </div>

      <BentoInboxPrimaryButton
        label="Respond"
        onClick={() => onRespond(enquiry)}
        ignoring={ignoring}
      />

      <BentoInboxDismissButton onDismiss={() => onDismiss(enquiry)} ignoring={ignoring} />
    </div>
  );
}

function ReplyFace({
  enquiry,
  customerBody,
  listItemBorder,
  replyText,
  onReplyChange,
  onBack,
  onSend,
  onRevise,
  sending,
  revising,
  detailLoading,
}: {
  enquiry: CustomerInquiryListItem;
  customerBody: string;
  listItemBorder: string;
  replyText: string;
  onReplyChange: (value: string) => void;
  onBack: () => void;
  onSend: () => void;
  onRevise: (instruction: string) => Promise<void>;
  sending: boolean;
  revising: boolean;
  detailLoading: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [editTab, setEditTab] = React.useState<"manual" | "ai">("manual");
  const [aiPrompt, setAiPrompt] = React.useState("");

  const name = senderName(enquiry);
  const subject = enquiry.subject?.trim() || "Customer enquiry";
  const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;

  async function handleApplyAi() {
    if (!aiPrompt.trim() || revising) return;
    await onRevise(aiPrompt.trim());
    setAiPrompt("");
    setEditTab("manual");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={sending}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          aria-label="Back to enquiries"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-gray-900">{name}</p>
          <p className="truncate text-[11px] text-gray-500">{enquiry.sender_email}</p>
        </div>
        <GmailLogo className="h-[18px] w-auto max-w-[22px] shrink-0 opacity-90" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.35, ease: [0.04, 0.62, 0.23, 0.98] }}
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border bg-white shadow-sm",
          listItemBorder,
        )}
      >
        {!editing ? (
          <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Subject</p>
            <p className="mt-0.5 text-[12px] font-medium text-gray-800">{replySubject}</p>
          </div>
        ) : null}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-3 py-3",
            editing && "flex flex-col",
          )}
        >
          {!editing ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Their message</p>
              {detailLoading ? (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading thread…
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-gray-900">{customerBody}</p>
              )}

              <div className="my-3 h-px bg-gray-100" />
            </>
          ) : null}

          <div className={cn("flex items-center justify-between gap-2", editing && "shrink-0")}>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Your reply</p>
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={sending || detailLoading}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={sending || revising}
                className="text-[10px] font-medium text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-40"
              >
                Done
              </button>
            )}
          </div>

          {!editing ? (
            <p className="mt-1.5 line-clamp-6 whitespace-pre-wrap text-[11px] leading-relaxed text-gray-900">
              {replyText.trim() || "No draft yet."}
            </p>
          ) : (
            <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-2">
              <div className="flex shrink-0 items-center bg-gray-100 p-0.5 rounded-md w-fit">
                <button
                  type="button"
                  onClick={() => setEditTab("manual")}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                    editTab === "manual"
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setEditTab("ai")}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                    editTab === "ai"
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  AI adjust
                </button>
              </div>

              {editTab === "manual" ? (
                <textarea
                  value={replyText}
                  onChange={(event) => onReplyChange(event.target.value)}
                  disabled={sending || detailLoading}
                  className="min-h-[120px] w-full flex-1 resize-none rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 text-[11px] leading-relaxed text-gray-800 outline-none transition-colors focus:border-gray-300 focus:bg-white disabled:opacity-60"
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col rounded-md border border-gray-200 bg-[#fafaf9] p-2.5">
                  <textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    disabled={sending || revising || detailLoading}
                    className="min-h-[100px] w-full flex-1 resize-none rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-gray-800 outline-none transition-colors focus:border-gray-300 disabled:opacity-60"
                    placeholder='e.g. "Make it shorter and confirm we can hold the bike until Saturday."'
                  />
                  <button
                    type="button"
                    onClick={() => void handleApplyAi()}
                    disabled={sending || revising || detailLoading || !aiPrompt.trim() || !replyText.trim()}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
                  >
                    {revising ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Apply instruction
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 p-3">
          <motion.button
            type="button"
            onClick={onSend}
            disabled={sending || revising || detailLoading || !replyText.trim()}
            whileTap={{ scale: 0.97 }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2.5 text-[13px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? (
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                Sending…
              </motion.span>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Customer enquiries footy-card bento — live Gmail inquiries with slide-up reply.
 */
export function OverivewoTestBento({
  className,
  variant = "default",
  marketingPreview = false,
}: {
  className?: string;
  variant?: OverivewoTestBentoVariant;
  marketingPreview?: boolean;
}) {
  const shell = getBentoShellStyles(variant);
  const [loading, setLoading] = React.useState(!marketingPreview);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [gmailState, setGmailState] = React.useState<CustomerInquiriesResponse["gmail"]>(
    marketingPreview ? { configured: true, connected: true } : undefined,
  );
  const [inquiries, setInquiries] = React.useState<CustomerInquiryListItem[]>(
    marketingPreview ? MARKETING_PREVIEW_ENQUIRIES : [],
  );
  const [ignoringId, setIgnoringId] = React.useState<string | null>(null);
  const [showReply, setShowReply] = React.useState(false);
  const [activeEnquiry, setActiveEnquiry] = React.useState<CustomerInquiryListItem | null>(null);
  const [activeDetail, setActiveDetail] = React.useState<CustomerInquiryDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [replyText, setReplyText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [revising, setRevising] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);

  const panelClassName = cn("flex min-h-0 flex-1 flex-col", shell.panelClassName);
  const panelBg = shell.panelBg;

  const load = React.useCallback(async (options?: { refresh?: boolean }) => {
    if (marketingPreview) return;

    if (options?.refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchCustomerInquiries("draft_ready");
      setInquiries(data.inquiries ?? []);
      setGmailState(data.gmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load enquiries.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [marketingPreview]);

  React.useEffect(() => {
    if (marketingPreview) return;
    void load();
  }, [load, marketingPreview]);

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

  async function handleRespond(enquiry: CustomerInquiryListItem) {
    setActiveEnquiry(enquiry);
    setActiveDetail(null);
    setReplyText(stripReplyLinks(enquiry.draft_body || ""));
    setShowReply(true);

    if (marketingPreview) {
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);

    try {
      const { inquiry } = await fetchCustomerInquiry(enquiry.id);
      setActiveDetail(inquiry);
      setReplyText(stripReplyLinks(inquiry.draft_body || enquiry.draft_body || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load enquiry.");
      setShowReply(false);
      setActiveEnquiry(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleBack() {
    if (sending) return;
    setShowReply(false);
    window.setTimeout(() => {
      setActiveEnquiry(null);
      setActiveDetail(null);
      setReplyText("");
      setDetailLoading(false);
    }, DISMISS_DELAY_MS);
  }

  async function handleSend() {
    if (!activeEnquiry || sending || !replyText.trim()) return;

    if (marketingPreview) {
      setInquiries((rows) => rows.filter((row) => row.id !== activeEnquiry.id));
      setShowReply(false);
      window.setTimeout(() => {
        setActiveEnquiry(null);
        setActiveDetail(null);
        setReplyText("");
      }, DISMISS_DELAY_MS);
      return;
    }

    setSending(true);
    setError(null);

    try {
      await sendCustomerInquiryReply(activeEnquiry.id, replyText.trim());
      setInquiries((rows) => rows.filter((row) => row.id !== activeEnquiry.id));
      setSending(false);
      setShowReply(false);
      window.setTimeout(() => {
        setActiveEnquiry(null);
        setActiveDetail(null);
        setReplyText("");
      }, DISMISS_DELAY_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reply.");
      setSending(false);
    }
  }

  async function handleRevise(instruction: string) {
    if (!activeEnquiry || revising || !replyText.trim()) return;

    if (marketingPreview) {
      setReplyText((current) => `${current.trim()}\n\n(${instruction.trim()})`);
      return;
    }

    setRevising(true);
    setError(null);

    try {
      const { inquiry } = await reviseCustomerInquiryDraft(activeEnquiry.id, {
        instruction,
        draft_body: replyText.trim(),
      });
      setActiveDetail(inquiry);
      setReplyText(stripReplyLinks(inquiry.draft_body));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revise draft.");
      throw err;
    } finally {
      setRevising(false);
    }
  }

  async function handleDismiss(enquiry: CustomerInquiryListItem) {
    if (activeEnquiry?.id === enquiry.id) {
      handleBack();
    }

    if (marketingPreview) {
      setInquiries((rows) => rows.filter((row) => row.id !== enquiry.id));
      return;
    }

    setIgnoringId(enquiry.id);
    setError(null);

    try {
      await updateCustomerInquiry(enquiry.id, { status: "ignored" });
      setInquiries((rows) => rows.filter((row) => row.id !== enquiry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ignore enquiry.");
    } finally {
      setIgnoringId(null);
    }
  }

  const gmailConnected = gmailState?.connected === true;
  const gmailConfigured = gmailState?.configured === true;

  const panelContent = (() => {
    if (loading) {
      return <EnquiryListSkeleton />;
    }

    if (error && inquiries.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
          <p className="text-[12px] font-medium text-gray-600">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Try again
          </button>
        </div>
      );
    }

    if (gmailState && gmailConfigured && !gmailConnected) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
            <GmailLogo className="h-6 w-6 opacity-90" />
          </span>
          <p className="text-[12px] font-medium text-gray-950">Connect Gmail to sync customer enquiries</p>
          <p className="mt-1 text-[11px] text-gray-500">Draft replies will appear here once Gmail is linked.</p>
          <button
            type="button"
            onClick={() => void handleConnectGmail()}
            disabled={connecting}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-40"
          >
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Connect Gmail
          </button>
        </div>
      );
    }

    return (
      <ul className="-mx-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-0">
        <AnimatePresence initial={false}>
          {inquiries.length === 0 ? (
            <motion.li
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            >
              <BentoInboxEmptyState message="No open enquiries" />
            </motion.li>
          ) : (
            inquiries.map((enquiry) => (
              <motion.li
                key={enquiry.id}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.28, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="shrink-0"
              >
                <EnquiryListItem
                  enquiry={enquiry}
                  listItemBorder={shell.listItemBorder}
                  onRespond={handleRespond}
                  onDismiss={handleDismiss}
                  ignoring={ignoringId === enquiry.id}
                />
              </motion.li>
            ))
          )}
        </AnimatePresence>
      </ul>
    );
  })();

  const replyContent = activeEnquiry ? (
    <ReplyFace
      enquiry={activeEnquiry}
      customerBody={inquiryCustomerBody(activeDetail, activeEnquiry)}
      listItemBorder={shell.listItemBorder}
      replyText={replyText}
      onReplyChange={setReplyText}
      onBack={handleBack}
      onSend={handleSend}
      onRevise={handleRevise}
      sending={sending}
      revising={revising}
      detailLoading={detailLoading}
    />
  ) : null;

  return (
    <div className={bentoCardShellClassName(className)}>
      <AnimatePresence initial={false}>
        {!showReply ? (
          <motion.div
            key="bento-title"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SLIDE_TRANSITION}
            className="shrink-0 overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Customer Enquiries</h2>
                {!loading ? (
                  <p className="mt-0.5 text-[11px] text-gray-500">{inquiries.length} ready to send</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void load({ refresh: true })}
                  disabled={loading || refreshing}
                  aria-label="Refresh enquiries"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
                >
                  {refreshing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </button>
                <Link
                  href="/settings/store/customer-inquiries"
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]"
                  aria-label="Open customer enquiries"
                >
                  <GmailLogo className="h-[18px] w-auto max-w-[22px] opacity-90" />
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className={bentoOuterWrapClassName(variant)}>
        <div className={cn("relative flex h-full min-h-0 flex-col", panelClassName)}>
          {panelContent}
          {error && inquiries.length > 0 ? (
            <p className="shrink-0 px-1 pt-2 text-[10px] text-red-600">{error}</p>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {showReply && activeEnquiry ? (
          <motion.div
            key={activeEnquiry.id}
            className={cn(
              "absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden rounded-[32px]",
              panelBg,
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SLIDE_TRANSITION}
          >
            <div className="flex min-h-0 flex-1 flex-col p-3">{replyContent}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

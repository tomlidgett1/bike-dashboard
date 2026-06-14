"use client";

import * as React from "react";
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

export type StatusFilter = CustomerInquiryStatus | "all";

export type LightspeedContext = {
  matched?: boolean;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  bikes?: Array<{ label: string | null; serial: string | null }>;
  recent_workorders?: Array<{ id: string; title: string | null; status: string | null }>;
  summary?: string | null;
};

/** Remove URLs / "source:" notes that should never sit in a customer reply. */
export function stripReplyLinks(text: string): string {
  if (!text) return text;
  return text
    .replace(/\(?\bhttps?:\/\/[^\s)]+\)?/gi, "")
    .replace(/^\s*(sources?|references?|citations?)\s*:.*$/gim, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type InquiriesController = ReturnType<typeof useInquiriesController>;

export function useInquiriesController() {
  const [filter, setFilter] = React.useState<StatusFilter>("draft_ready");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [gmailState, setGmailState] =
    React.useState<CustomerInquiriesResponse["gmail"]>(undefined);
  const [inquiries, setInquiries] = React.useState<CustomerInquiryListItem[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<CustomerInquiryDetail | null>(null);
  const [draft, setDraft] = React.useState("");
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
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
        setDraft(stripReplyLinks(inquiry.draft_body));
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

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const data = await refreshCustomerInquiries();
      setInquiries(data.inquiries ?? []);
      setGmailState(data.gmail);
      if (selectedId) {
        const { inquiry } = await fetchCustomerInquiry(selectedId);
        setDetail(inquiry);
        setDraft(stripReplyLinks(inquiry.draft_body));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh enquiries.");
    } finally {
      setRefreshing(false);
    }
  }, [selectedId]);

  const handleConnectGmail = React.useCallback(async () => {
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
  }, []);

  const handleIgnore = React.useCallback(async () => {
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
  }, [selectedId, detail]);

  const handleRegenerate = React.useCallback(async () => {
    if (!selectedId) return;
    setRegenerating(true);
    setActionMessage(null);
    try {
      const { inquiry } = await regenerateCustomerInquiryDraft(selectedId);
      setDetail(inquiry);
      setDraft(stripReplyLinks(inquiry.draft_body));
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
  }, [selectedId]);

  const handleSend = React.useCallback(async () => {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    setActionMessage(null);
    try {
      const { message, inquiry } = await sendCustomerInquiryReply(selectedId, draft.trim());
      setDetail(inquiry);
      setDraft(stripReplyLinks(inquiry.draft_body));
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
  }, [selectedId, draft]);

  const gmailConnected = gmailState?.connected === true;
  const gmailConfigured = gmailState?.configured !== false;
  const gmailAccountEmail = gmailState?.accounts?.[0]?.email_address ?? null;
  const lightspeedContext = (detail?.lightspeed_context as LightspeedContext | undefined) ?? undefined;

  return {
    filter,
    setFilter,
    loading,
    refreshing,
    error,
    gmailState,
    gmailConnected,
    gmailConfigured,
    gmailAccountEmail,
    inquiries,
    selectedId,
    setSelectedId,
    detail,
    detailLoading,
    draft,
    setDraft,
    sending,
    regenerating,
    connecting,
    actionMessage,
    sendConfirmOpen,
    setSendConfirmOpen,
    handleRefresh,
    handleConnectGmail,
    handleIgnore,
    handleRegenerate,
    handleSend,
    lightspeedContext,
  };
}

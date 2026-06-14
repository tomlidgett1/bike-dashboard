"use client";

import * as React from "react";
import {
  fetchCustomerInquiries,
  fetchCustomerInquiry,
  banCustomerInquirySender,
  fetchEmailStyleProfile,
  mintCustomerInquiriesGmailConnectUrl,
  refreshCustomerInquiries,
  regenerateCustomerInquiryDraft,
  reviseCustomerInquiryDraft,
  sendCustomerInquiryReply,
  updateCustomerInquiry,
  updateEmailStyleProfile,
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
  sales_summary?: {
    sale_count: number;
    total_spend: number;
    last_purchase_at: string | null;
    last_purchase_total: number | null;
    last_purchase_summary: string | null;
  } | null;
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
  const [banConfirmOpen, setBanConfirmOpen] = React.useState(false);
  const [banning, setBanning] = React.useState(false);
  const [revising, setRevising] = React.useState(false);
  const [reviseInstruction, setReviseInstruction] = React.useState("");
  const [styleLoading, setStyleLoading] = React.useState(true);
  const [styleSaving, setStyleSaving] = React.useState(false);
  const [greetingStyle, setGreetingStyle] = React.useState("");
  const [signoffStyle, setSignoffStyle] = React.useState("");
  const [styleMessage, setStyleMessage] = React.useState<string | null>(null);

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
    let cancelled = false;
    setStyleLoading(true);
    void fetchEmailStyleProfile()
      .then((profile) => {
        if (cancelled || !profile) return;
        setGreetingStyle(profile.greeting_style ?? "");
        setSignoffStyle(profile.signoff_style ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        setStyleMessage(err instanceof Error ? err.message : "Could not load reply style.");
      })
      .finally(() => {
        if (!cancelled) setStyleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleUnignore = React.useCallback(async () => {
    if (!selectedId || !detail) return;
    try {
      const { inquiry } = await updateCustomerInquiry(selectedId, { status: "draft_ready" });
      setDetail(inquiry);
      setInquiries((rows) =>
        rows.map((row) => (row.id === inquiry.id ? { ...row, status: inquiry.status } : row)),
      );
      setActionMessage("Enquiry restored.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Could not restore enquiry.");
    }
  }, [selectedId, detail]);

  const handleBanSender = React.useCallback(async () => {
    if (!selectedId || !detail) return;
    setBanning(true);
    setActionMessage(null);
    try {
      const { message, inquiry } = await banCustomerInquirySender(selectedId);
      setDetail(inquiry);
      setInquiries((rows) =>
        rows.map((row) => (row.id === inquiry.id ? { ...row, status: inquiry.status } : row)),
      );
      setBanConfirmOpen(false);
      setActionMessage(message);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Could not ban sender.");
    } finally {
      setBanning(false);
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

  const handleReviseDraft = React.useCallback(async () => {
    if (!selectedId || !draft.trim() || !reviseInstruction.trim()) return;
    setRevising(true);
    setActionMessage(null);
    try {
      const { inquiry } = await reviseCustomerInquiryDraft(selectedId, {
        instruction: reviseInstruction.trim(),
        draft_body: draft.trim(),
      });
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
      setReviseInstruction("");
      setActionMessage("Draft updated from your instruction.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Could not revise draft.");
    } finally {
      setRevising(false);
    }
  }, [selectedId, draft, reviseInstruction]);

  const handleSaveStyleProfile = React.useCallback(async () => {
    setStyleSaving(true);
    setStyleMessage(null);
    try {
      const profile = await updateEmailStyleProfile({
        greeting_style: greetingStyle,
        signoff_style: signoffStyle,
      });
      setGreetingStyle(profile?.greeting_style ?? greetingStyle);
      setSignoffStyle(profile?.signoff_style ?? signoffStyle);
      setStyleMessage("Reply style saved.");
    } catch (err) {
      setStyleMessage(err instanceof Error ? err.message : "Could not save reply style.");
    } finally {
      setStyleSaving(false);
    }
  }, [greetingStyle, signoffStyle]);

  const gmailStatusReady = gmailState !== undefined;
  const gmailConnected = gmailState?.connected === true;
  const gmailConfigured = gmailState?.configured === true;
  const gmailAccountEmail = gmailState?.accounts?.[0]?.email_address ?? null;
  const lightspeedContext = (detail?.lightspeed_context as LightspeedContext | undefined) ?? undefined;

  return {
    filter,
    setFilter,
    loading,
    refreshing,
    error,
    gmailState,
    gmailStatusReady,
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
    banConfirmOpen,
    setBanConfirmOpen,
    banning,
    handleRefresh,
    handleConnectGmail,
    handleIgnore,
    handleUnignore,
    handleBanSender,
    handleRegenerate,
    handleReviseDraft,
    handleSend,
    handleSaveStyleProfile,
    revising,
    reviseInstruction,
    setReviseInstruction,
    styleLoading,
    styleSaving,
    greetingStyle,
    setGreetingStyle,
    signoffStyle,
    setSignoffStyle,
    styleMessage,
    lightspeedContext,
  };
}

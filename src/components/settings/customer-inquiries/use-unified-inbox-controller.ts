"use client";

import * as React from "react";
import {
  filterNestCustomerChats,
  sanitiseNestConversationsResponse,
  type NestConversationDetail,
  type NestConversationListItem,
  type NestConversationMessage,
  type NestConversationsResponse,
} from "@/lib/nest/types";
import {
  buildStubNestConversation,
  getCachedNestThread,
  mergeNestThreadFromList,
  setCachedNestThread,
} from "@/lib/nest/thread-cache";
import {
  isNestConversationUnread,
  markNestConversationRead,
  NEST_READ_STATE_EVENT,
  setNestReadMapFromServer,
} from "@/lib/nest/conversation-read-state";
import {
  fetchUnifiedInbox,
  refreshUnifiedInbox,
} from "@/lib/customer-inquiries/unified-inbox-client";
import {
  loadUnifiedInboxFromStorage,
  saveUnifiedInboxToStorage,
} from "@/lib/customer-inquiries/unified-inbox-cache";
import type { CustomerInquiryListItem, CustomerInquiryStatus } from "@/lib/customer-inquiries/types";
import { useInquiriesController } from "./use-inquiries-controller";
import {
  enquirySummary,
  intentLabel,
  relativeTime,
  senderName,
} from "./parts";

export type InboxTab =
  | "all"
  | "needs_reply"
  | "ready"
  | "responded"
  | "ignored"
  | "gmail"
  | "nest";

export type InboxSource = "gmail" | "nest";

export type UnifiedInboxRow = {
  key: string;
  source: InboxSource;
  gmailId?: string;
  nestChatId?: string;
  customerName: string;
  customerContact: string;
  subject: string;
  preview: string;
  receivedAt: string | null;
  statusLabel: string;
  statusTone: "unread" | "ready" | "responded" | "ignored" | "processing" | "error" | "neutral";
  needsReply: boolean;
  isUnread: boolean;
  intentLabel: string | null;
  threadCount: number;
  nestMissedCall: boolean;
  gmailItem?: CustomerInquiryListItem;
  nestItem?: NestConversationListItem;
};

export const INBOX_TABS: Array<{ id: InboxTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_reply", label: "Needs reply" },
  { id: "ready", label: "Ready" },
  { id: "responded", label: "Responded" },
  { id: "ignored", label: "Ignored" },
  { id: "gmail", label: "Gmail" },
  { id: "nest", label: "Nest" },
];

function gmailStatusMeta(status: CustomerInquiryStatus): {
  statusLabel: string;
  statusTone: UnifiedInboxRow["statusTone"];
  needsReply: boolean;
  isUnread: boolean;
} {
  switch (status) {
    case "new":
      return { statusLabel: "New", statusTone: "unread", needsReply: true, isUnread: true };
    case "processing":
      return { statusLabel: "Processing", statusTone: "processing", needsReply: true, isUnread: true };
    case "draft_ready":
      return { statusLabel: "Ready", statusTone: "ready", needsReply: true, isUnread: true };
    case "sent":
      return { statusLabel: "Responded", statusTone: "responded", needsReply: false, isUnread: false };
    case "ignored":
      return { statusLabel: "Ignored", statusTone: "ignored", needsReply: false, isUnread: false };
    case "error":
      return { statusLabel: "Error", statusTone: "error", needsReply: true, isUnread: true };
    default:
      return { statusLabel: status, statusTone: "neutral", needsReply: false, isUnread: false };
  }
}

function nestStatusMeta(chat: NestConversationListItem): {
  statusLabel: string;
  statusTone: UnifiedInboxRow["statusTone"];
  needsReply: boolean;
  isUnread: boolean;
} {
  const unread = isNestConversationUnread(chat);
  const responded = Boolean(chat.hasManualMessages && !unread);
  if (unread) {
    return { statusLabel: "Unread", statusTone: "unread", needsReply: true, isUnread: true };
  }
  if (responded) {
    return { statusLabel: "Responded", statusTone: "responded", needsReply: false, isUnread: false };
  }
  return { statusLabel: "Read", statusTone: "neutral", needsReply: false, isUnread: false };
}

function nestDisplayTitle(chat: NestConversationListItem): string {
  const name = chat.displayName?.trim();
  if (name) return name;
  const title = chat.title?.trim();
  if (title) return title;
  return chat.participantHandle?.trim() || chat.chatId;
}

async function fetchNestList(): Promise<NestConversationListItem[]> {
  const res = await fetch("/api/store/nest-messages?listOnly=1", { cache: "no-store" });
  const data = (await res.json()) as NestConversationsResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not load Nest messages.");
  }
  const sanitised = sanitiseNestConversationsResponse({
    chats: Array.isArray(data.chats) ? data.chats : [],
    selectedChatId: null,
    conversation: null,
  });
  return filterNestCustomerChats(sanitised.chats).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

export async function fetchNestThreadDetail(chatId: string): Promise<NestConversationDetail | null> {
  const cached = getCachedNestThread(chatId);
  if (cached) return cached;

  const search = new URLSearchParams({ chatId, threadOnly: "1" });
  const res = await fetch(`/api/store/nest-messages?${search.toString()}`, { cache: "no-store" });
  const data = (await res.json()) as NestConversationsResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not load conversation.");
  }
  const conversation = data.conversation ?? null;
  if (conversation) setCachedNestThread(conversation);
  return conversation;
}

function gmailRow(item: CustomerInquiryListItem): UnifiedInboxRow {
  const meta = gmailStatusMeta(item.status);
  const name = senderName(item);
  return {
    key: `gmail:${item.id}`,
    source: "gmail",
    gmailId: item.id,
    customerName: name,
    customerContact: item.sender_email,
    subject: item.subject?.trim() || "No subject",
    preview: enquirySummary(item),
    receivedAt: item.received_at,
    intentLabel: intentLabel(item.intent),
    threadCount: item.thread_message_count,
    nestMissedCall: false,
    gmailItem: item,
    ...meta,
  };
}

function nestRow(chat: NestConversationListItem): UnifiedInboxRow {
  const meta = nestStatusMeta(chat);
  const name = nestDisplayTitle(chat);
  return {
    key: `nest:${chat.chatId}`,
    source: "nest",
    nestChatId: chat.chatId,
    customerName: name,
    customerContact: chat.participantHandle?.trim() || "—",
    subject: chat.triggeredByTwilio ? "Missed call" : "Nest message",
    preview: chat.preview?.trim() || "No preview",
    receivedAt: chat.lastMessageAt,
    intentLabel: chat.triggeredByTwilio ? "Missed call" : "SMS",
    threadCount: 0,
    nestMissedCall: Boolean(chat.triggeredByTwilio),
    nestItem: chat,
    ...meta,
  };
}

function matchesTab(row: UnifiedInboxRow, tab: InboxTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "needs_reply":
      return row.needsReply && row.statusTone !== "ignored";
    case "ready":
      return row.source === "gmail" && row.gmailItem?.status === "draft_ready";
    case "responded":
      return row.statusTone === "responded";
    case "ignored":
      return row.statusTone === "ignored";
    case "gmail":
      return row.source === "gmail";
    case "nest":
      return row.source === "nest";
    default:
      return true;
  }
}

export function useUnifiedInboxController() {
  const c = useInquiriesController({ deferListLoad: true });
  const [inboxTab, setInboxTab] = React.useState<InboxTab>("all");
  const [nestChats, setNestChats] = React.useState<NestConversationListItem[]>(() => {
    const cached = loadUnifiedInboxFromStorage();
    return cached?.nestChats ?? [];
  });
  const [nestLoading, setNestLoading] = React.useState(() => !loadUnifiedInboxFromStorage());
  const [nestError, setNestError] = React.useState<string | null>(null);
  const [nestConfigured, setNestConfigured] = React.useState(
    () => loadUnifiedInboxFromStorage()?.nestConfigured ?? true,
  );
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [nestDetail, setNestDetail] = React.useState<NestConversationDetail | null>(null);
  const [nestDetailLoading, setNestDetailLoading] = React.useState(false);
  const [readTick, setReadTick] = React.useState(0);
  const [inboxBootstrapped, setInboxBootstrapped] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (c.filter !== "all") c.setFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load full list once for unified table
  }, []);

  React.useEffect(() => {
    const cached = loadUnifiedInboxFromStorage();
    if (!cached) return;
    c.hydrateInboxList({ inquiries: cached.inquiries, gmail: cached.gmail });
    setNestChats(cached.nestChats);
    setNestConfigured(cached.nestConfigured ?? true);
    setNestReadMapFromServer(cached.nestReadMap);
    setNestLoading(false);
    setInboxBootstrapped(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time local cache hydrate
  }, []);

  const applyUnifiedPayload = React.useCallback(
    (data: Awaited<ReturnType<typeof fetchUnifiedInbox>>) => {
      c.hydrateInboxList({ inquiries: data.inquiries ?? [], gmail: data.gmail });
      setNestChats(data.nestChats ?? []);
      setNestConfigured(data.nestConfigured ?? true);
      if (data.nestReadMap) setNestReadMapFromServer(data.nestReadMap);
      saveUnifiedInboxToStorage({
        inquiries: data.inquiries ?? [],
        nestChats: data.nestChats ?? [],
        nestReadMap: data.nestReadMap ?? {},
        gmail: data.gmail,
        nestConfigured: data.nestConfigured,
        fetchedAt: new Date().toISOString(),
      });
    },
    [c],
  );

  const loadUnifiedInbox = React.useCallback(async () => {
    if (!inboxBootstrapped) setNestLoading(true);
    setNestError(null);
    try {
      const data = await fetchUnifiedInbox();
      applyUnifiedPayload(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load inbox.";
      if (message.includes("not configured")) {
        setNestConfigured(false);
        setNestChats([]);
      } else if (!loadUnifiedInboxFromStorage()) {
        setNestError(message);
      }
    } finally {
      setNestLoading(false);
      setInboxBootstrapped(true);
    }
  }, [applyUnifiedPayload, inboxBootstrapped]);

  React.useEffect(() => {
    void loadUnifiedInbox();
  }, [loadUnifiedInbox]);

  React.useEffect(() => {
    const onReadChange = () => setReadTick((n) => n + 1);
    window.addEventListener(NEST_READ_STATE_EVENT, onReadChange);
    return () => window.removeEventListener(NEST_READ_STATE_EVENT, onReadChange);
  }, []);

  const allRows = React.useMemo(() => {
    void readTick;
    const rows = [
      ...c.inquiries.map(gmailRow),
      ...(nestConfigured ? nestChats.map(nestRow) : []),
    ];
    return rows.sort((a, b) => {
      const aTime = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
      const bTime = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [c.inquiries, nestChats, nestConfigured, readTick]);

  const filteredRows = React.useMemo(
    () => allRows.filter((row) => matchesTab(row, inboxTab)),
    [allRows, inboxTab],
  );

  const tabCounts = React.useMemo(() => {
    const counts: Record<InboxTab, number> = {
      all: allRows.length,
      needs_reply: allRows.filter((r) => matchesTab(r, "needs_reply")).length,
      ready: allRows.filter((r) => matchesTab(r, "ready")).length,
      responded: allRows.filter((r) => matchesTab(r, "responded")).length,
      ignored: allRows.filter((r) => matchesTab(r, "ignored")).length,
      gmail: allRows.filter((r) => r.source === "gmail").length,
      nest: allRows.filter((r) => r.source === "nest").length,
    };
    return counts;
  }, [allRows]);

  const selectedRow = React.useMemo(
    () => allRows.find((row) => row.key === selectedKey) ?? null,
    [allRows, selectedKey],
  );

  React.useEffect(() => {
    if (!selectedRow) {
      c.setSelectedId(null);
      setNestDetail(null);
      return;
    }

    if (selectedRow.source === "gmail" && selectedRow.gmailId) {
      c.setSelectedId(selectedRow.gmailId);
      setNestDetail(null);
      return;
    }

    c.setSelectedId(null);
    if (!selectedRow.nestChatId || !selectedRow.nestItem) return;

    markNestConversationRead(selectedRow.nestItem);
    const listChat = selectedRow.nestItem;
    const cached = getCachedNestThread(listChat.chatId);
    if (cached) {
      setNestDetail(mergeNestThreadFromList(cached, listChat));
    } else {
      setNestDetail(buildStubNestConversation(listChat));
    }

    let cancelled = false;
    setNestDetailLoading(true);
    void fetchNestThreadDetail(listChat.chatId)
      .then((conversation) => {
        if (cancelled || !conversation) return;
        setNestDetail(mergeNestThreadFromList(conversation, listChat));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setNestDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRow, c]);

  const handleRefreshAll = React.useCallback(async () => {
    setRefreshing(true);
    setNestLoading(true);
    setNestError(null);
    try {
      const data = await refreshUnifiedInbox();
      applyUnifiedPayload(data);
    } catch (err) {
      setNestError(err instanceof Error ? err.message : "Could not refresh inbox.");
    } finally {
      setRefreshing(false);
      setNestLoading(false);
    }
  }, [applyUnifiedPayload]);

  const openRow = React.useCallback((row: UnifiedInboxRow) => {
    setSelectedKey(row.key);
  }, []);

  const closePanel = React.useCallback(() => {
    setSelectedKey(null);
  }, []);

  const handleNestMessageSent = React.useCallback((message: NestConversationMessage, chatId: string) => {
    setNestDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev));
    setNestChats((prev) =>
      prev
        .map((chat) =>
          chat.chatId === chatId
            ? {
                ...chat,
                preview: message.content.replace(/\s+/g, " ").trim().slice(0, 180),
                previewRole: message.role,
                lastMessageAt: message.createdAt,
                hasManualMessages: true,
                latestManualMessageAt: message.createdAt,
              }
            : chat,
        )
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()),
    );
  }, []);

  const handleNestStarted = React.useCallback((chatId: string, message: NestConversationMessage) => {
    const listItem: NestConversationListItem = {
      chatId,
      title:
        typeof message.metadata?.customer_name === "string"
          ? message.metadata.customer_name
          : chatId,
      displayName:
        typeof message.metadata?.customer_name === "string" ? message.metadata.customer_name : null,
      participantHandle:
        typeof message.metadata?.recipient_phone_e164 === "string"
          ? message.metadata.recipient_phone_e164
          : null,
      preview: message.content.replace(/\s+/g, " ").trim().slice(0, 180),
      previewRole: message.role,
      lastMessageAt: message.createdAt,
      hasManualMessages: true,
      latestManualMessageAt: message.createdAt,
      source: "customer",
    };
    setNestChats((prev) =>
      [listItem, ...prev.filter((chat) => chat.chatId !== chatId)].sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      ),
    );
    const conversation = {
      chatId,
      title: listItem.title,
      displayName: listItem.displayName,
      participantHandle: listItem.participantHandle,
      source: "customer" as const,
      lastSeen: null,
      messages: [message],
    };
    setCachedNestThread(conversation);
    setNestDetail(conversation);
    setSelectedKey(`nest:${chatId}`);
  }, []);

  const listLoading = c.loading || nestLoading;
  const listError = c.error || nestError;

  return {
    ...c,
    inboxTab,
    setInboxTab,
    tabCounts,
    allRows,
    filteredRows,
    selectedKey,
    selectedRow,
    openRow,
    closePanel,
    nestConfigured,
    nestDetail,
    nestDetailLoading,
    handleRefreshAll,
    handleNestMessageSent,
    handleNestStarted,
    listLoading,
    listError,
    refreshing,
    relativeTime,
  };
}

export type UnifiedInboxController = ReturnType<typeof useUnifiedInboxController>;

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
  isGmailInquiryUnread,
  markGmailInquiryRead,
  GMAIL_INQUIRY_READ_STATE_EVENT,
  setGmailInquiryReadMapFromServer,
} from "@/lib/customer-inquiries/inquiry-read-state";
import {
  isNestConversationUnread,
  markNestConversationRead,
  NEST_READ_STATE_EVENT,
  setNestReadMapFromServer,
} from "@/lib/nest/conversation-read-state";
import {
  fetchUnifiedInbox,
  refreshUnifiedInbox,
  closeInboxCases,
  closeNestCaseOnServer,
  reopenNestCaseOnServer,
  fetchLightspeedContextByPhone,
} from "@/lib/customer-inquiries/unified-inbox-client";
import { resolveNestConversationPhone } from "@/lib/customer-inquiries/lightspeed-phone-directory";
import {
  buildNestClosePayload,
  isNestConversationClosed,
  markNestConversationClosed,
  markNestConversationReopened,
  NEST_CLOSE_STATE_EVENT,
  readNestCloseMap,
  setNestCloseMapFromServer,
} from "@/lib/nest/conversation-close-state";
import {
  loadUnifiedInboxFromStorage,
  saveUnifiedInboxToStorage,
} from "@/lib/customer-inquiries/unified-inbox-cache";
import { inquiryListItemNeedsAction } from "@/lib/customer-inquiries/unified-inbox-needs-action";
import { notifyInboxNeedsActionChanged } from "@/lib/customer-inquiries/inbox-needs-action-events";
import type { CustomerInquiryListItem, CustomerInquiryStatus } from "@/lib/customer-inquiries/types";
import { nestConversationNeedsAction } from "@/lib/nest/types";
import { useInquiriesController, type LightspeedContext } from "./use-inquiries-controller";
import {
  enquirySummary,
  intentLabel,
  relativeTime,
  senderName,
} from "./parts";

export type InboxTab =
  | "needs_action"
  | "all"
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
  needsAction: boolean;
  isUnread: boolean;
  intentLabel: string | null;
  threadCount: number;
  nestMissedCall: boolean;
  gmailItem?: CustomerInquiryListItem;
  nestItem?: NestConversationListItem;
};

export const INBOX_TABS: Array<{ id: InboxTab; label: string }> = [
  { id: "needs_action", label: "Needs Action" },
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "responded", label: "Responded" },
  { id: "ignored", label: "Closed" },
  { id: "gmail", label: "Gmail" },
  { id: "nest", label: "Nest" },
];

function gmailStatusMeta(status: CustomerInquiryStatus): {
  statusLabel: string;
  statusTone: UnifiedInboxRow["statusTone"];
  needsReply: boolean;
} {
  switch (status) {
    case "new":
      return { statusLabel: "New", statusTone: "unread", needsReply: true };
    case "processing":
      return { statusLabel: "Processing", statusTone: "processing", needsReply: true };
    case "draft_ready":
      return { statusLabel: "Ready", statusTone: "ready", needsReply: true };
    case "sent":
      return { statusLabel: "Responded", statusTone: "responded", needsReply: false };
    case "ignored":
      return { statusLabel: "Closed", statusTone: "ignored", needsReply: false };
    case "error":
      return { statusLabel: "Error", statusTone: "error", needsReply: true };
    default:
      return { statusLabel: status, statusTone: "neutral", needsReply: false };
  }
}

function nestStatusMeta(
  chat: NestConversationListItem,
  closedAt?: string | null,
): {
  statusLabel: string;
  statusTone: UnifiedInboxRow["statusTone"];
  needsReply: boolean;
  needsAction: boolean;
  isUnread: boolean;
} {
  const unread = isNestConversationUnread(chat);
  const needsAction = nestConversationNeedsAction(chat, closedAt);
  if (needsAction) {
    return {
      statusLabel: "Needs action",
      statusTone: "unread",
      needsReply: true,
      needsAction: true,
      isUnread: unread,
    };
  }
  if (closedAt) {
    return {
      statusLabel: "Closed",
      statusTone: "ignored",
      needsReply: false,
      needsAction: false,
      isUnread: false,
    };
  }
  if (chat.hasManualMessages) {
    return {
      statusLabel: "Responded",
      statusTone: "responded",
      needsReply: false,
      needsAction: false,
      isUnread: false,
    };
  }
  return {
    statusLabel: "Read",
    statusTone: "neutral",
    needsReply: false,
    needsAction: false,
    isUnread: false,
  };
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

const nestThreadFetchInFlight = new Map<string, Promise<NestConversationDetail | null>>();

export async function fetchNestThreadDetail(chatId: string): Promise<NestConversationDetail | null> {
  const cached = getCachedNestThread(chatId);
  if (cached) return cached;

  const pending = nestThreadFetchInFlight.get(chatId);
  if (pending) return pending;

  const request = (async () => {
    const search = new URLSearchParams({ chatId, threadOnly: "1" });
    const res = await fetch(`/api/store/nest-messages?${search.toString()}`, { cache: "no-store" });
    const data = (await res.json()) as NestConversationsResponse & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Could not load conversation.");
    }
    const conversation = data.conversation ?? null;
    if (conversation) setCachedNestThread(conversation);
    return conversation;
  })().finally(() => {
    nestThreadFetchInFlight.delete(chatId);
  });

  nestThreadFetchInFlight.set(chatId, request);
  return request;
}

function gmailRow(item: CustomerInquiryListItem): UnifiedInboxRow {
  const meta = gmailStatusMeta(item.status);
  const needsAction = inquiryListItemNeedsAction(item);
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
    isUnread: isGmailInquiryUnread(item),
    ...meta,
    needsReply: needsAction,
    needsAction,
  };
}

function nestRow(chat: NestConversationListItem): UnifiedInboxRow {
  const closedAt = readNestCloseMap()[chat.chatId] ?? null;
  const meta = nestStatusMeta(chat, closedAt);
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

function inboxRowSearchHaystack(row: UnifiedInboxRow): string {
  const parts = [
    row.customerName,
    row.customerContact,
    row.subject,
    row.preview,
    row.intentLabel,
    row.statusLabel,
    row.gmailItem?.sender_name,
    row.gmailItem?.sender_email,
    row.gmailItem?.subject,
    row.gmailItem?.snippet,
    row.gmailItem?.body_preview,
    row.gmailItem?.lightspeed_customer_name,
    row.nestItem?.displayName,
    row.nestItem?.title,
    row.nestItem?.participantHandle,
    row.nestItem?.preview,
    row.nestItem?.chatId,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function matchesSearch(row: UnifiedInboxRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return inboxRowSearchHaystack(row).includes(q);
}

function matchesTab(row: UnifiedInboxRow, tab: InboxTab): boolean {
  switch (tab) {
    case "needs_action":
      return row.needsAction;
    case "all":
      return true;
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
  const [inboxTab, setInboxTab] = React.useState<InboxTab>("needs_action");
  const [searchQuery, setSearchQuery] = React.useState("");
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
  const [closingCases, setClosingCases] = React.useState(false);
  const [closingSelectedCase, setClosingSelectedCase] = React.useState(false);
  const [nestLightspeedContext, setNestLightspeedContext] = React.useState<
    LightspeedContext | undefined
  >(undefined);
  const [nestLightspeedLoading, setNestLightspeedLoading] = React.useState(false);
  const nestLightspeedCacheRef = React.useRef<
    Map<string, { phone: string; context: LightspeedContext }>
  >(new Map());

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
    setGmailInquiryReadMapFromServer(cached.gmailReadMap ?? {});
    setNestCloseMapFromServer(cached.nestCloseMap ?? {});
    setNestLoading(false);
    setInboxBootstrapped(true);
    notifyInboxNeedsActionChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time local cache hydrate
  }, []);

  const hydrateInboxList = c.hydrateInboxList;

  const applyUnifiedPayload = React.useCallback(
    (data: Awaited<ReturnType<typeof fetchUnifiedInbox>>) => {
      hydrateInboxList({ inquiries: data.inquiries ?? [], gmail: data.gmail });
      setNestChats(data.nestChats ?? []);
      setNestConfigured(data.nestConfigured ?? true);
      if (data.nestReadMap) setNestReadMapFromServer(data.nestReadMap);
      if (data.gmailReadMap) setGmailInquiryReadMapFromServer(data.gmailReadMap);
      if (data.nestCloseMap) setNestCloseMapFromServer(data.nestCloseMap);
      saveUnifiedInboxToStorage({
        inquiries: data.inquiries ?? [],
        nestChats: data.nestChats ?? [],
        nestReadMap: data.nestReadMap ?? {},
        gmailReadMap: data.gmailReadMap ?? {},
        nestCloseMap: data.nestCloseMap ?? {},
        gmail: data.gmail,
        nestConfigured: data.nestConfigured,
        fetchedAt: new Date().toISOString(),
      });
      notifyInboxNeedsActionChanged();
    },
    [hydrateInboxList],
  );

  const loadUnifiedInbox = React.useCallback(async () => {
    const hadCache = Boolean(loadUnifiedInboxFromStorage());
    if (!hadCache) setNestLoading(true);
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
  }, [applyUnifiedPayload]);

  const inboxFetchedRef = React.useRef(false);
  React.useEffect(() => {
    if (inboxFetchedRef.current) return;
    inboxFetchedRef.current = true;
    void loadUnifiedInbox();
  }, [loadUnifiedInbox]);

  React.useEffect(() => {
    const onStateChange = () => setReadTick((n) => n + 1);
    window.addEventListener(NEST_READ_STATE_EVENT, onStateChange);
    window.addEventListener(GMAIL_INQUIRY_READ_STATE_EVENT, onStateChange);
    window.addEventListener(NEST_CLOSE_STATE_EVENT, onStateChange);
    return () => {
      window.removeEventListener(NEST_READ_STATE_EVENT, onStateChange);
      window.removeEventListener(GMAIL_INQUIRY_READ_STATE_EVENT, onStateChange);
      window.removeEventListener(NEST_CLOSE_STATE_EVENT, onStateChange);
    };
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
    () => allRows.filter((row) => matchesTab(row, inboxTab) && matchesSearch(row, searchQuery)),
    [allRows, inboxTab, searchQuery],
  );

  const searchActive = searchQuery.trim().length > 0;

  const tabCounts = React.useMemo(() => {
    const counts: Record<InboxTab, number> = {
      needs_action: allRows.filter((r) => r.needsAction).length,
      all: allRows.length,
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

  const markedSelectionRef = React.useRef<string | null>(null);

  const setSelectedId = c.setSelectedId;
  const setSelectedIdRef = React.useRef(setSelectedId);
  setSelectedIdRef.current = setSelectedId;

  const nestThreadLoadKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!selectedKey) {
      markedSelectionRef.current = null;
      return;
    }
    if (markedSelectionRef.current === selectedKey) return;

    const row = allRows.find((item) => item.key === selectedKey);
    if (!row) return;

    markedSelectionRef.current = selectedKey;
    if (row.source === "gmail" && row.gmailItem) {
      markGmailInquiryRead(row.gmailItem);
      return;
    }
    if (row.source === "nest" && row.nestItem) {
      markNestConversationRead(row.nestItem);
    }
  }, [selectedKey, allRows]);

  React.useEffect(() => {
    if (!selectedRow) {
      nestThreadLoadKeyRef.current = null;
      setSelectedIdRef.current(null);
      setNestDetail(null);
      setNestDetailLoading(false);
      return;
    }

    if (selectedRow.source === "gmail" && selectedRow.gmailId) {
      nestThreadLoadKeyRef.current = null;
      setSelectedIdRef.current(selectedRow.gmailId);
      setNestDetail(null);
      setNestDetailLoading(false);
      return;
    }

    if (selectedRow.source !== "nest" || !selectedRow.nestChatId) {
      return;
    }

    setSelectedIdRef.current(null);
    const chatId = selectedRow.nestChatId;
    const listChat =
      nestChats.find((chat) => chat.chatId === chatId) ?? selectedRow.nestItem;
    if (!listChat) return;

    const alreadyLoaded = nestThreadLoadKeyRef.current === selectedKey;

    if (alreadyLoaded) {
      setNestDetail((prev) => {
        if (!prev || prev.chatId !== chatId) return prev;
        return mergeNestThreadFromList(prev, listChat);
      });
      return;
    }

    nestThreadLoadKeyRef.current = selectedKey;

    const cached = getCachedNestThread(chatId);
    if (cached) {
      setNestDetail(mergeNestThreadFromList(cached, listChat));
      setNestDetailLoading(false);
    } else {
      setNestDetail(buildStubNestConversation(listChat));
      setNestDetailLoading(true);
    }

    let cancelled = false;

    void fetchNestThreadDetail(chatId)
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
  }, [selectedKey, selectedRow?.source, selectedRow?.nestChatId, selectedRow?.gmailId, nestChats]);

  const handleRefreshAll = React.useCallback(async () => {
    setRefreshing(true);
    setNestError(null);
    try {
      const data = await refreshUnifiedInbox();
      applyUnifiedPayload(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not refresh inbox.";
      setNestError(message);
      try {
        const fallback = await fetchUnifiedInbox();
        applyUnifiedPayload(fallback);
      } catch {
        // Keep the refresh error message above.
      }
    } finally {
      setRefreshing(false);
    }
  }, [applyUnifiedPayload]);

  const openRow = React.useCallback((row: UnifiedInboxRow) => {
    setSelectedKey(row.key);
  }, []);

  const closePanel = React.useCallback(() => {
    setSelectedKey(null);
  }, []);

  const syncNestListPreview = React.useCallback(
    (chatId: string, message: NestConversationMessage) => {
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
    },
    [],
  );

  const handleNestMessageOptimistic = React.useCallback(
    (message: NestConversationMessage, chatId: string) => {
      setNestDetail((prev) => {
        const base =
          prev ??
          (() => {
            const chat = nestChats.find((item) => item.chatId === chatId);
            return chat ? buildStubNestConversation(chat) : null;
          })();
        if (!base) return prev;
        return { ...base, messages: [...base.messages, message] };
      });
      syncNestListPreview(chatId, message);
    },
    [nestChats, syncNestListPreview],
  );

  const handleNestMessageConfirmed = React.useCallback(
    (tempId: number, message: NestConversationMessage, chatId: string) => {
      setNestDetail((prev) => {
        const base =
          prev ??
          (() => {
            const chat = nestChats.find((item) => item.chatId === chatId);
            return chat ? buildStubNestConversation(chat) : null;
          })();
        if (!base) return prev;
        const hasTemp = base.messages.some((item) => item.id === tempId);
        const messages = hasTemp
          ? base.messages.map((item) => (item.id === tempId ? message : item))
          : [...base.messages, message];
        const next = { ...base, messages };
        setCachedNestThread(next);
        return next;
      });
      syncNestListPreview(chatId, message);
    },
    [nestChats, syncNestListPreview],
  );

  const handleNestMessageFailed = React.useCallback((tempId: number, chatId: string) => {
    setNestDetail((prev) => {
      if (!prev || prev.chatId !== chatId) return prev;
      return { ...prev, messages: prev.messages.filter((item) => item.id !== tempId) };
    });
  }, []);

  const handleNestMessageSent = React.useCallback(
    (message: NestConversationMessage, chatId: string) => {
      handleNestMessageConfirmed(-1, message, chatId);
    },
    [handleNestMessageConfirmed],
  );

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

  const needsActionCount = tabCounts.needs_action;

  const handleCloseSelectedCase = React.useCallback(async () => {
    if (!selectedRow) return;
    setClosingSelectedCase(true);
    setNestError(null);
    try {
      if (selectedRow.source === "gmail") {
        await c.handleIgnore();
        closePanel();
        return;
      }
      if (selectedRow.source === "nest" && selectedRow.nestItem) {
        const closedAt = new Date().toISOString();
        markNestConversationClosed(selectedRow.nestItem, closedAt);
        await closeNestCaseOnServer(selectedRow.nestItem.chatId, closedAt);
        closePanel();
      }
    } catch (err) {
      setNestError(err instanceof Error ? err.message : "Could not close case.");
    } finally {
      setClosingSelectedCase(false);
    }
  }, [selectedRow, c, closePanel]);

  const handleReopenSelectedNestCase = React.useCallback(async () => {
    if (!selectedRow || selectedRow.source !== "nest" || !selectedRow.nestChatId) return;
    setClosingSelectedCase(true);
    setNestError(null);
    try {
      markNestConversationReopened(selectedRow.nestChatId);
      await reopenNestCaseOnServer(selectedRow.nestChatId);
    } catch (err) {
      setNestError(err instanceof Error ? err.message : "Could not reopen case.");
    } finally {
      setClosingSelectedCase(false);
    }
  }, [selectedRow]);

  const handleCloseAllNeedsAction = React.useCallback(async () => {
    const targets = allRows.filter((row) => row.needsAction);
    if (targets.length === 0) return;

    setClosingCases(true);
    setNestError(null);
    try {
      const gmailIds = targets
        .filter((row) => row.source === "gmail" && row.gmailId)
        .map((row) => row.gmailId as string);
      const nestChats = targets
        .filter((row) => row.source === "nest" && row.nestItem)
        .map((row) => row.nestItem as NestConversationListItem);
      const nestCloses = buildNestClosePayload(nestChats);

      for (const chat of nestChats) {
        const closedAt = nestCloses.find((item) => item.chatId === chat.chatId)?.closedAt;
        if (closedAt) markNestConversationClosed(chat, closedAt);
      }

      const data = await closeInboxCases({ gmailIds, nestCloses });
      applyUnifiedPayload(data);
      if (selectedKey && targets.some((row) => row.key === selectedKey)) {
        closePanel();
      }
    } catch (err) {
      setNestError(err instanceof Error ? err.message : "Could not close all cases.");
    } finally {
      setClosingCases(false);
    }
  }, [allRows, applyUnifiedPayload, closePanel, selectedKey]);

  const selectedNestClosed =
    selectedRow?.source === "nest" &&
    selectedRow.nestItem &&
    isNestConversationClosed(selectedRow.nestItem);

  const selectedNestPhone = React.useMemo(() => {
    if (!selectedRow?.nestItem) return null;
    return resolveNestConversationPhone(selectedRow.nestItem, nestDetail?.messages);
  }, [selectedRow, nestDetail?.messages]);

  React.useEffect(() => {
    setNestLightspeedContext(undefined);
    setNestLightspeedLoading(false);
  }, [selectedKey]);

  const ensureNestLightspeedContext = React.useCallback(async () => {
    if (!selectedRow || selectedRow.source !== "nest" || !selectedRow.nestChatId) return;

    const chatId = selectedRow.nestChatId;
    const phone = selectedRow.nestItem
      ? resolveNestConversationPhone(selectedRow.nestItem, nestDetail?.messages)
      : null;

    const cached = nestLightspeedCacheRef.current.get(chatId);
    if (cached) {
      const phoneMatches = phone && cached.phone === phone;
      const staleNoPhone =
        !cached.context.matched &&
        Boolean(phone) &&
        typeof cached.context.summary === "string" &&
        cached.context.summary.includes("No mobile number");
      if (phoneMatches && !staleNoPhone) {
        setNestLightspeedContext(cached.context);
        return;
      }
      nestLightspeedCacheRef.current.delete(chatId);
    }

    if (!phone) {
      const empty: LightspeedContext = {
        matched: false,
        summary: nestDetailLoading
          ? "Loading conversation to resolve mobile number…"
          : "No mobile number found for this Nest conversation.",
      };
      if (!nestDetailLoading) {
        nestLightspeedCacheRef.current.set(chatId, { phone: "", context: empty });
      }
      setNestLightspeedContext(empty);
      return;
    }

    setNestLightspeedLoading(true);
    try {
      const context = (await fetchLightspeedContextByPhone(phone)) as LightspeedContext;
      nestLightspeedCacheRef.current.set(chatId, { phone, context });
      setNestLightspeedContext(context);
    } catch (error) {
      const fallback: LightspeedContext = {
        matched: false,
        summary:
          error instanceof Error
            ? error.message
            : "Lightspeed lookup unavailable for this mobile number.",
      };
      setNestLightspeedContext(fallback);
    } finally {
      setNestLightspeedLoading(false);
    }
  }, [nestDetail?.messages, nestDetailLoading, selectedRow]);

  const listLoading = c.loading || nestLoading;
  const listError = c.error || nestError;

  return {
    ...c,
    inboxTab,
    setInboxTab,
    searchQuery,
    setSearchQuery,
    searchActive,
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
    handleNestMessageOptimistic,
    handleNestMessageConfirmed,
    handleNestMessageFailed,
    handleNestMessageSent,
    handleNestStarted,
    listLoading,
    listError,
    refreshing,
    relativeTime,
    needsActionCount,
    closingCases,
    closingSelectedCase,
    handleCloseSelectedCase,
    handleCloseAllNeedsAction,
    handleReopenSelectedNestCase,
    selectedNestClosed,
    selectedNestPhone,
    nestLightspeedContext,
    nestLightspeedLoading,
    ensureNestLightspeedContext,
  };
}

export type UnifiedInboxController = ReturnType<typeof useUnifiedInboxController>;

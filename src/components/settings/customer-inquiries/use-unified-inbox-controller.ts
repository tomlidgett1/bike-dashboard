"use client";

import * as React from "react";
import {
  deriveNestChannel,
  deriveNestChannelFromMessages,
  filterNestCustomerChats,
  sanitiseNestConversationsResponse,
  type NestConversationDetail,
  type NestConversationListItem,
  type NestConversationMessage,
  type NestConversationsResponse,
} from "@/lib/nest/types";
import type { InboxChannel } from "./channel-meta";
import {
  buildStubNestConversation,
  getCachedNestThread,
  mergeNestThreadFromList,
  setCachedNestThread,
} from "@/lib/nest/thread-cache";
import {
  isGmailInquiryUnread,
  markGmailInquiryRead,
  gmailInquiryReadAnchor,
  GMAIL_INQUIRY_READ_STATE_EVENT,
  setGmailInquiryReadMapFromServer,
  readGmailInquiryLastReadMap,
} from "@/lib/customer-inquiries/inquiry-read-state";
import {
  isNestConversationUnread,
  markNestConversationRead,
  nestConversationReadAnchor,
  NEST_READ_STATE_EVENT,
  setNestReadMapFromServer,
  readNestLastReadMap,
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
import type {
  InstagramConversationItem,
  InstagramInboxMessage,
  InstagramInboxState,
} from "@/lib/customer-inquiries/instagram-types";
import {
  fetchInstagramInbox,
  mintInstagramConnectUrl,
  sendInstagramReplyOnServer,
} from "@/lib/customer-inquiries/instagram-inbox-client";
import {
  INSTAGRAM_READ_STATE_EVENT,
  instagramConversationReadAnchor,
  isInstagramConversationUnread,
  markAllInstagramConversationsRead,
  markInstagramConversationRead,
} from "@/lib/customer-inquiries/instagram-read-state";
import { mergeGmailAndNestReadMaps } from "@/lib/customer-inquiries/unified-inbox-unread";
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
import {
  Inbox,
  Instagram,
  Letter,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { NestLogo } from "@/components/genie/nest-logo";

type InboxTabIcon = React.ComponentType<{ className?: string }>;

// JSX is not allowed in a .ts module — build these icons with createElement.
function GmailInboxTabIcon() {
  return React.createElement(GmailLogo, {
    className: "h-3 w-auto max-w-4 shrink-0 object-contain",
  });
}

function NestInboxTabIcon() {
  return React.createElement(NestLogo, {
    className: "h-3 w-3 shrink-0 rounded-full object-cover",
  });
}

export type InboxStatusTab = "all" | "unread";

export type InboxSourceTab = "all" | "gmail" | "instagram" | "nest";

export type InboxSource = "gmail" | "instagram" | "nest";

export type UnifiedInboxRow = {
  key: string;
  source: InboxSource;
  gmailId?: string;
  nestChatId?: string;
  instagramConversationId?: string;
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
  channel: InboxChannel;
  gmailItem?: CustomerInquiryListItem;
  nestItem?: NestConversationListItem;
  instagramItem?: InstagramConversationItem;
};

export const INBOX_STATUS_TABS: Array<{ id: InboxStatusTab; label: string; icon: InboxTabIcon }> = [
  { id: "all", label: "All", icon: Inbox },
  { id: "unread", label: "Unread", icon: Letter },
];

export const INBOX_SOURCE_OPTIONS: Array<{ id: InboxSourceTab; label: string; icon: InboxTabIcon }> = [
  { id: "all", label: "All sources", icon: Inbox },
  { id: "gmail", label: "Gmail", icon: GmailInboxTabIcon },
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "nest", label: "Nest", icon: NestInboxTabIcon },
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

export async function fetchNestThreadDetail(
  chatId: string,
  options?: { force?: boolean },
): Promise<NestConversationDetail | null> {
  if (!options?.force) {
    const cached = getCachedNestThread(chatId);
    if (cached) return cached;
  }

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
    channel: "email",
    gmailItem: item,
    isUnread: isGmailInquiryUnread(item),
    ...meta,
    needsReply: needsAction,
    needsAction,
  };
}

const NEST_CHANNEL_SUBJECTS: Record<Exclude<InboxChannel, "email" | "instagram">, string> = {
  website_chat: "Website chat",
  missed_call: "Missed call",
  store_outreach: "Store message",
};

function nestRow(chat: NestConversationListItem): UnifiedInboxRow {
  const closedAt = readNestCloseMap()[chat.chatId] ?? null;
  const meta = nestStatusMeta(chat, closedAt);
  const name = nestDisplayTitle(chat);
  const channel = chat.channel ?? deriveNestChannel(chat);
  return {
    key: `nest:${chat.chatId}`,
    source: "nest",
    nestChatId: chat.chatId,
    customerName: name,
    customerContact: chat.participantHandle?.trim() || "—",
    subject: NEST_CHANNEL_SUBJECTS[channel],
    preview: chat.preview?.trim() || "No preview",
    receivedAt: chat.lastMessageAt,
    intentLabel: null,
    threadCount: 0,
    nestMissedCall: channel === "missed_call",
    channel,
    nestItem: chat,
    ...meta,
  };
}

function instagramDisplayName(conversation: InstagramConversationItem): string {
  const username = conversation.participant_username?.trim();
  if (username) return `@${username}`;
  return "Instagram customer";
}

function instagramRow(conversation: InstagramConversationItem): UnifiedInboxRow {
  const unread = isInstagramConversationUnread(conversation);
  const awaitingReply = conversation.preview_role === "customer";
  const name = instagramDisplayName(conversation);
  return {
    key: `instagram:${conversation.conversation_id}`,
    source: "instagram",
    instagramConversationId: conversation.conversation_id,
    customerName: name,
    customerContact: name,
    subject: "Instagram DM",
    preview: conversation.preview || "No preview",
    receivedAt: conversation.updated_at,
    statusLabel: awaitingReply ? "Needs reply" : "Responded",
    statusTone: awaitingReply ? "unread" : "responded",
    needsReply: awaitingReply,
    needsAction: unread,
    isUnread: unread,
    intentLabel: null,
    threadCount: conversation.messages.length,
    nestMissedCall: false,
    channel: "instagram",
    instagramItem: conversation,
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
    row.instagramItem?.participant_username,
    row.instagramItem?.preview,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function matchesSearch(row: UnifiedInboxRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return inboxRowSearchHaystack(row).includes(q);
}

function matchesStatusTab(row: UnifiedInboxRow, tab: InboxStatusTab): boolean {
  if (tab === "unread") return row.isUnread;
  return true;
}

function matchesSourceTab(row: UnifiedInboxRow, tab: InboxSourceTab): boolean {
  return tab === "all" || row.source === tab;
}

export function useUnifiedInboxController() {
  const c = useInquiriesController({ deferListLoad: true });
  const [statusTab, setStatusTab] = React.useState<InboxStatusTab>("all");
  const [sourceTab, setSourceTab] = React.useState<InboxSourceTab>("all");
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
  const [instagramChats, setInstagramChats] = React.useState<InstagramConversationItem[]>([]);
  const [instagramState, setInstagramState] = React.useState<InstagramInboxState | undefined>(
    undefined,
  );
  const [instagramConnecting, setInstagramConnecting] = React.useState(false);
  const [instagramSending, setInstagramSending] = React.useState(false);

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

      // Persist the merged high-water marks (server ∪ local) so a refresh never
      // reloads a stale cache that drops a read the server has not caught up on yet.
      const { gmailReadMap, nestReadMap } = mergeGmailAndNestReadMaps({
        gmailReadMap: data.gmailReadMap ?? {},
        nestReadMap: data.nestReadMap ?? {},
        localGmailReadMap: readGmailInquiryLastReadMap(),
        localNestReadMap: readNestLastReadMap(),
      });

      saveUnifiedInboxToStorage({
        inquiries: data.inquiries ?? [],
        nestChats: data.nestChats ?? [],
        nestReadMap,
        gmailReadMap,
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

  const loadInstagramInbox = React.useCallback(async (options?: { forceRefresh?: boolean }) => {
    try {
      const data = await fetchInstagramInbox(options);
      setInstagramState({
        configured: data.configured,
        connected: data.connected,
        accounts: data.accounts,
      });
      setInstagramChats(data.conversations);
    } catch {
      // Instagram is an optional channel — never block the rest of the inbox.
    }
  }, []);

  const instagramFetchedRef = React.useRef(false);
  React.useEffect(() => {
    if (instagramFetchedRef.current) return;
    instagramFetchedRef.current = true;
    void loadInstagramInbox();
  }, [loadInstagramInbox]);

  // Same background cadence as the unified inbox poll below.
  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void loadInstagramInbox();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadInstagramInbox]);

  React.useEffect(() => {
    const onStateChange = () => setReadTick((n) => n + 1);
    window.addEventListener(NEST_READ_STATE_EVENT, onStateChange);
    window.addEventListener(GMAIL_INQUIRY_READ_STATE_EVENT, onStateChange);
    window.addEventListener(NEST_CLOSE_STATE_EVENT, onStateChange);
    window.addEventListener(INSTAGRAM_READ_STATE_EVENT, onStateChange);
    return () => {
      window.removeEventListener(NEST_READ_STATE_EVENT, onStateChange);
      window.removeEventListener(GMAIL_INQUIRY_READ_STATE_EVENT, onStateChange);
      window.removeEventListener(NEST_CLOSE_STATE_EVENT, onStateChange);
      window.removeEventListener(INSTAGRAM_READ_STATE_EVENT, onStateChange);
    };
  }, []);

  const allRows = React.useMemo(() => {
    void readTick;
    const rows = [
      ...c.inquiries.map(gmailRow),
      ...(nestConfigured ? nestChats.map(nestRow) : []),
      ...instagramChats.map(instagramRow),
    ];
    return rows.sort((a, b) => {
      const aTime = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
      const bTime = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [c.inquiries, nestChats, nestConfigured, instagramChats, readTick]);

  const filteredRows = React.useMemo(
    () =>
      allRows.filter(
        (row) =>
          matchesStatusTab(row, statusTab) &&
          matchesSourceTab(row, sourceTab) &&
          matchesSearch(row, searchQuery),
      ),
    [allRows, statusTab, sourceTab, searchQuery],
  );

  const searchActive = searchQuery.trim().length > 0;

  const statusCounts = React.useMemo(() => {
    const sourceRows = allRows.filter((row) => matchesSourceTab(row, sourceTab));
    const counts: Record<InboxStatusTab, number> = {
      all: sourceRows.length,
      unread: sourceRows.filter((row) => row.isUnread).length,
    };
    return counts;
  }, [allRows, sourceTab]);

  const sourceCounts = React.useMemo(() => {
    const statusRows = allRows.filter((row) => matchesStatusTab(row, statusTab));
    const counts: Record<InboxSourceTab, number> = {
      all: statusRows.length,
      gmail: statusRows.filter((row) => row.source === "gmail").length,
      instagram: statusRows.filter((row) => row.source === "instagram").length,
      nest: statusRows.filter((row) => row.source === "nest").length,
    };
    return counts;
  }, [allRows, statusTab]);

  const selectedRow = React.useMemo(
    () => allRows.find((row) => row.key === selectedKey) ?? null,
    [allRows, selectedKey],
  );

  const markedSelectionRef = React.useRef<{ key: string; anchor: string } | null>(null);

  const setSelectedId = c.setSelectedId;
  const setSelectedIdRef = React.useRef(setSelectedId);
  setSelectedIdRef.current = setSelectedId;

  const nestThreadLoadKeyRef = React.useRef<string | null>(null);

  const nestDetailRef = React.useRef<NestConversationDetail | null>(null);
  React.useEffect(() => {
    nestDetailRef.current = nestDetail;
  }, [nestDetail]);

  /**
   * Replace the open thread with a fresh server copy, keeping any optimistic
   * messages (negative ids) the server hasn't confirmed yet.
   */
  const applyFreshNestThread = React.useCallback(
    (conversation: NestConversationDetail, listChat?: NestConversationListItem) => {
      const prev = nestDetailRef.current;
      let next = mergeNestThreadFromList(conversation, listChat);
      if (prev && prev.chatId === conversation.chatId) {
        const pending = prev.messages.filter(
          (message) =>
            message.id < 0 &&
            !next.messages.some(
              (serverMessage) =>
                serverMessage.role === message.role && serverMessage.content === message.content,
            ),
        );
        if (pending.length > 0) {
          next = { ...next, messages: [...next.messages, ...pending] };
        }
      }
      setCachedNestThread(next);
      setNestDetail((current) =>
        current && current.chatId !== conversation.chatId ? current : next,
      );
    },
    [],
  );

  // Mark the open conversation read whenever its unread anchor advances (list
  // refresh, thread load, photo message sync, etc.). Idempotent on the client
  // and server — never moves last_read_at backwards.
  React.useEffect(() => {
    if (!selectedKey) {
      markedSelectionRef.current = null;
      return;
    }

    const row = allRows.find((item) => item.key === selectedKey);
    if (!row) return;

    let anchor: string | null = null;
    if (row.source === "gmail" && row.gmailItem) {
      anchor = gmailInquiryReadAnchor(row.gmailItem);
    } else if (row.source === "instagram" && row.instagramItem) {
      anchor = instagramConversationReadAnchor(row.instagramItem);
    } else if (row.source === "nest" && row.nestItem) {
      anchor = nestConversationReadAnchor(row.nestItem);

      // Prefer the latest customer message from the open thread when available —
      // list metadata can lag (especially for image-only inbound messages).
      if (nestDetail && nestDetail.chatId === row.nestChatId) {
        for (let i = nestDetail.messages.length - 1; i >= 0; i--) {
          const message = nestDetail.messages[i];
          if (message.role !== "user") continue;
          const messageAt = message.createdAt;
          if (!anchor || new Date(messageAt).getTime() > new Date(anchor).getTime()) {
            anchor = messageAt;
          }
          break;
        }
      }
    }

    if (!anchor) return;

    const previous = markedSelectionRef.current;
    if (
      previous &&
      previous.key === selectedKey &&
      new Date(previous.anchor).getTime() >= new Date(anchor).getTime()
    ) {
      return;
    }

    markedSelectionRef.current = { key: selectedKey, anchor };
    if (row.source === "gmail" && row.gmailItem) {
      markGmailInquiryRead(row.gmailItem, anchor);
      return;
    }
    if (row.source === "instagram" && row.instagramItem) {
      markInstagramConversationRead(row.instagramItem, anchor);
      return;
    }
    if (row.source === "nest" && row.nestItem) {
      markNestConversationRead(row.nestItem, anchor);
    }
  }, [selectedKey, allRows, nestDetail]);

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

    if (selectedRow.source === "instagram") {
      nestThreadLoadKeyRef.current = null;
      setSelectedIdRef.current(null);
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

    // Always revalidate against the server so incoming customer replies show
    // up even when a stale thread is cached.
    void fetchNestThreadDetail(chatId, { force: true })
      .then((conversation) => {
        if (cancelled || !conversation) return;
        applyFreshNestThread(conversation, listChat);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setNestDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedKey,
    selectedRow?.source,
    selectedRow?.nestChatId,
    selectedRow?.gmailId,
    nestChats,
    applyFreshNestThread,
  ]);

  const selectedNestChatId =
    selectedRow?.source === "nest" ? (selectedRow.nestChatId ?? null) : null;

  // Poll the open Nest conversation so customer replies appear without a
  // manual refresh — mirrors the dedicated Nest messages page.
  React.useEffect(() => {
    if (!selectedNestChatId) return;
    const chatId = selectedNestChatId;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void fetchNestThreadDetail(chatId, { force: true })
        .then((conversation) => {
          if (conversation) applyFreshNestThread(conversation);
        })
        .catch(() => {});
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [selectedNestChatId, applyFreshNestThread]);

  // Keep the list fresh in the background so new enquiries and replies
  // surface without hitting Refresh.
  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      fetchUnifiedInbox()
        .then(applyUnifiedPayload)
        .catch(() => {});
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [applyUnifiedPayload]);

  const handleRefreshAll = React.useCallback(async () => {
    setRefreshing(true);
    setNestError(null);
    void loadInstagramInbox({ forceRefresh: true });
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
  }, [applyUnifiedPayload, loadInstagramInbox]);

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
          : base.messages.some((item) => item.id === message.id)
            ? base.messages
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
      channel: "store_outreach",
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

  const handleConnectInstagram = React.useCallback(async () => {
    setInstagramConnecting(true);
    setNestError(null);
    try {
      const url = await mintInstagramConnectUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setNestError(
        err instanceof Error ? err.message : "Could not start Instagram connection.",
      );
    } finally {
      setInstagramConnecting(false);
    }
  }, []);

  const patchInstagramConversation = React.useCallback(
    (
      conversationId: string,
      updater: (conversation: InstagramConversationItem) => InstagramConversationItem,
    ) => {
      setInstagramChats((prev) =>
        prev.map((item) => (item.conversation_id === conversationId ? updater(item) : item)),
      );
    },
    [],
  );

  const handleInstagramSend = React.useCallback(
    async (conversation: InstagramConversationItem, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!conversation.participant_id) {
        throw new Error(
          "This conversation has no reply recipient yet — open it in Instagram to reply.",
        );
      }

      const tempId = `local:${Date.now()}`;
      const sentAt = new Date().toISOString();
      const optimistic: InstagramInboxMessage = {
        id: tempId,
        role: "shop",
        text: trimmed,
        from_id: null,
        from_username: null,
        created_at: sentAt,
        has_attachments: false,
      };
      patchInstagramConversation(conversation.conversation_id, (item) => ({
        ...item,
        preview: trimmed.replace(/\s+/g, " ").slice(0, 180),
        preview_role: "shop",
        updated_at: sentAt,
        messages: [...item.messages, optimistic],
      }));

      setInstagramSending(true);
      try {
        const result = await sendInstagramReplyOnServer({
          conversationId: conversation.conversation_id,
          connectedAccountId: conversation.connected_account_id,
          recipientId: conversation.participant_id,
          text: trimmed,
        });
        if (result.message_id) {
          patchInstagramConversation(conversation.conversation_id, (item) => ({
            ...item,
            messages: item.messages.map((message) =>
              message.id === tempId ? { ...message, id: result.message_id! } : message,
            ),
          }));
        }
      } catch (error) {
        patchInstagramConversation(conversation.conversation_id, (item) => ({
          ...item,
          messages: item.messages.filter((message) => message.id !== tempId),
        }));
        throw error;
      } finally {
        setInstagramSending(false);
      }
    },
    [patchInstagramConversation],
  );

  const needsActionCount = React.useMemo(
    () => allRows.filter((row) => row.needsAction).length,
    [allRows],
  );

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
      if (selectedRow.source === "instagram" && selectedRow.instagramItem) {
        // Instagram threads have no server-side case state — clearing the
        // unread mark is what removes them from "needs action".
        markInstagramConversationRead(selectedRow.instagramItem);
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

      const instagramTargets = targets
        .filter((row) => row.source === "instagram" && row.instagramItem)
        .map((row) => row.instagramItem as InstagramConversationItem);
      markAllInstagramConversationsRead(instagramTargets);

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

  // The list-level channel is a heuristic until the thread is cached; once the
  // open conversation's messages are loaded, classify from the first message.
  const selectedChannel: InboxChannel | null = React.useMemo(() => {
    if (!selectedRow) return null;
    if (selectedRow.source === "gmail") return "email";
    if (!selectedRow.nestItem) return selectedRow.channel;
    if (
      nestDetail &&
      nestDetail.chatId === selectedRow.nestChatId &&
      nestDetail.messages.length > 0
    ) {
      return deriveNestChannelFromMessages(selectedRow.nestItem, nestDetail.messages);
    }
    return selectedRow.channel;
  }, [selectedRow, nestDetail]);

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
    statusTab,
    setStatusTab,
    sourceTab,
    setSourceTab,
    searchQuery,
    setSearchQuery,
    searchActive,
    statusCounts,
    sourceCounts,
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
    selectedChannel,
    nestLightspeedContext,
    nestLightspeedLoading,
    ensureNestLightspeedContext,
    instagramChats,
    instagramConfigured: instagramState?.configured === true,
    instagramConnected: instagramState?.connected === true,
    instagramStatusReady: instagramState !== undefined,
    instagramConnecting,
    instagramSending,
    handleConnectInstagram,
    handleInstagramSend,
  };
}

export type UnifiedInboxController = ReturnType<typeof useUnifiedInboxController>;

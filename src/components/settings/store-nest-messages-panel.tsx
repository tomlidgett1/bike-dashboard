"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Inbox,
  Loader2,
  PhoneMissed,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NestPageHeader, storeSettingsHeaderActionClass, storeSettingsPageChromeClass, storeSettingsPageHeaderNudgeClass } from "@/components/settings/actions-page-header";
import {
  filterNestInboxChats,
  filterNestMissedCallChats,
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
  prefetchNestThread,
  setCachedNestThread,
} from "@/lib/nest/thread-cache";
import { NestAutoServicePanel } from "@/components/settings/nest-auto-service-panel";
import { NestHiddenPickupSuggestionsPanel } from "@/components/settings/nest-hidden-pickup-suggestions";
import { NestMessageTemplatesBento } from "@/components/settings/nest-message-templates-bento";
import { NestPickupSuggestionsDropdown } from "@/components/settings/nest-pickup-suggestions-dropdown";
import {
  NEST_OVERLAY_INNER_RADIUS_CLASS,
  NEST_OVERLAY_RADIUS_CLASS,
} from "@/components/settings/nest-pickup-suggestion-ui";
import {
  isNestConversationUnread,
  markNestConversationRead,
} from "@/lib/nest/conversation-read-state";
import { NestThreadMessage, sameMessageGroup } from "@/components/settings/nest-chat-messages";
import { NestComposePill } from "@/components/settings/nest-compose-pill";

type NestPanelTab = "inbox" | "missed_calls" | "auto" | "settings";
type NestConversationTab = "inbox" | "missed_calls" | "auto";

function NestSectionTabs({
  activeTab,
  onChange,
  inboxUnreadCount,
  missedCallsUnreadCount,
}: {
  activeTab: NestConversationTab | null;
  onChange: (tab: NestConversationTab) => void;
  inboxUnreadCount: number;
  missedCallsUnreadCount: number;
}) {
  const tabs: {
    id: NestConversationTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    unreadCount?: number;
  }[] = [
    { id: "inbox", label: "Inbox", icon: Inbox, unreadCount: inboxUnreadCount },
    {
      id: "missed_calls",
      label: "Missed calls",
      icon: PhoneMissed,
      unreadCount: missedCallsUnreadCount,
    },
    { id: "auto", label: "Auto", icon: Sparkles },
  ];

  return (
    <div className="flex items-center rounded-full bg-gray-100 p-0.5 w-fit">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Icon className="h-3 w-3" />
            {tab.label}
            {typeof tab.unreadCount === "number" && tab.unreadCount > 0 ? (
              <span className="rounded-md bg-gray-200 px-1.5 py-0 text-[10px] font-medium text-gray-700">
                {tab.unreadCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function formatListTime(iso: string): string {
  const when = new Date(iso);
  const now = new Date();
  if (when.toDateString() === now.toDateString()) {
    return when.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  }
  const daysAgo = Math.abs(now.getTime() - when.getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo < 7) {
    return when.toLocaleDateString("en-AU", { weekday: "short" });
  }
  return when.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function sortChats(chats: NestConversationListItem[]): NestConversationListItem[] {
  return [...chats].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function isLikelyPhoneLabel(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return phoneDigits(value).length >= 8;
}

function nestConversationDisplayTitle(
  chat: Pick<NestConversationListItem, "chatId" | "displayName" | "title" | "participantHandle">,
): string {
  const name = chat.displayName?.trim();
  if (name && !isLikelyPhoneLabel(name)) return name;
  const title = chat.title?.trim();
  if (title && !isLikelyPhoneLabel(title)) return title;
  return chat.participantHandle?.trim() || chat.chatId;
}

async function fetchNestConversations(params: {
  chatId?: string;
  listOnly?: boolean;
  threadOnly?: boolean;
}): Promise<NestConversationsResponse & { lightspeedConnected?: boolean }> {
  const search = new URLSearchParams();
  if (params.chatId) search.set("chatId", params.chatId);
  if (params.listOnly) search.set("listOnly", "1");
  if (params.threadOnly) search.set("threadOnly", "1");

  const res = await fetch(`/api/store/nest-messages?${search.toString()}`, { cache: "no-store" });
  const data = (await res.json()) as NestConversationsResponse & {
    error?: string;
    configured?: boolean;
    lightspeedConnected?: boolean;
  };

  if (!res.ok) {
    throw new Error(data.error || "Could not load Nest messages.");
  }

  return {
    ...sanitiseNestConversationsResponse({
      chats: Array.isArray(data.chats) ? data.chats : [],
      selectedChatId: typeof data.selectedChatId === "string" ? data.selectedChatId : null,
      conversation:
        data.conversation && typeof data.conversation === "object"
          ? (data.conversation as NestConversationDetail)
          : null,
    }),
    lightspeedConnected: data.lightspeedConnected !== false,
  };
}

async function fetchNestThread(chatId: string): Promise<NestConversationDetail | null> {
  const data = await fetchNestConversations({ chatId, threadOnly: true });
  return data.conversation;
}

function ConversationRow({
  chat,
  active,
  onClick,
  onPrefetch,
}: {
  chat: NestConversationListItem;
  active: boolean;
  onClick: () => void;
  onPrefetch?: () => void;
}) {
  const unread = isNestConversationUnread(chat);
  const displayTitle = nestConversationDisplayTitle(chat);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      className={cn(
        "w-full rounded-md border border-transparent px-3 py-2.5 text-left transition-colors",
        active
          ? "bg-white shadow-sm"
          : "hover:bg-gray-100/80",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            unread && !active ? "bg-primary" : "bg-transparent",
          )}
          aria-hidden={!unread || active}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "truncate text-sm text-foreground",
                unread && !active ? "font-medium" : "font-normal",
              )}
            >
              {displayTitle}
            </p>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatListTime(chat.lastMessageAt)}
            </span>
          </div>
          {chat.preview ? (
            <p
              className={cn(
                "mt-0.5 truncate text-xs text-muted-foreground",
                unread && !active && "text-foreground/80",
              )}
            >
              {chat.preview}
            </p>
          ) : displayTitle !== chat.participantHandle && chat.participantHandle ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{chat.participantHandle}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function StoreNestMessagesPanel() {
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams.get("chatId");
  const [activeTab, setActiveTab] = React.useState<NestPanelTab>("inbox");
  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [chats, setChats] = React.useState<NestConversationListItem[]>([]);
  const [selectedChatId, setSelectedChatId] = React.useState<string | null>(null);
  const [conversation, setConversation] = React.useState<NestConversationDetail | null>(null);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [showMobileThread, setShowMobileThread] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [lightspeedConnected, setLightspeedConnected] = React.useState(true);
  const threadRef = React.useRef<HTMLDivElement>(null);
  const threadRequestRef = React.useRef<AbortController | null>(null);
  const chatsRef = React.useRef(chats);
  chatsRef.current = chats;

  const inboxChats = React.useMemo(() => filterNestInboxChats(chats), [chats]);
  const missedCallChats = React.useMemo(() => filterNestMissedCallChats(chats), [chats]);
  const conversationTabChats =
    activeTab === "missed_calls" ? missedCallChats : activeTab === "inbox" ? inboxChats : [];

  const filteredChats = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversationTabChats;
    return conversationTabChats.filter((chat) => {
      const haystack = [
        chat.displayName,
        chat.title,
        chat.participantHandle,
        chat.preview,
        chat.chatId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [conversationTabChats, searchQuery]);

  const loadList = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchNestConversations({ listOnly: true });
      setConfigured(true);
      setLightspeedConnected(data.lightspeedConnected !== false);
      setChats(sortChats(data.chats));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load messages.";
      if (message.includes("not configured")) {
        setConfigured(false);
      } else {
        setConfigured(true);
        setError(message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadThread = React.useCallback(async (chatId: string, silent = false) => {
    if (threadRequestRef.current) {
      threadRequestRef.current.abort();
    }
    const controller = new AbortController();
    threadRequestRef.current = controller;

    const cached = getCachedNestThread(chatId);
    const listChat = chatsRef.current.find((item) => item.chatId === chatId);
    if (cached) {
      setConversation(mergeNestThreadFromList(cached, listChat));
      setThreadLoading(false);
    } else if (!silent) {
      setThreadLoading(true);
    }

    try {
      const search = new URLSearchParams();
      search.set("chatId", chatId);
      search.set("threadOnly", "1");
      const res = await fetch(`/api/store/nest-messages?${search.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await res.json()) as NestConversationsResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not load conversation.");
      }
      if (controller.signal.aborted) return;

      const conversation = data.conversation ?? null;
      if (conversation) {
        const merged = mergeNestThreadFromList(conversation, listChat);
        setCachedNestThread(merged);
        setConversation(merged);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (!silent) {
        setError(err instanceof Error ? err.message : "Could not load conversation.");
      }
    } finally {
      if (threadRequestRef.current === controller) {
        threadRequestRef.current = null;
      }
      if (!controller.signal.aborted) {
        setThreadLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  React.useEffect(() => {
    if (!chatIdFromUrl || loading) return;
    const chat = chats.find((item) => item.chatId === chatIdFromUrl);
    if (!chat) return;
    setActiveTab(chat.triggeredByTwilio ? "missed_calls" : "inbox");
    setSelectedChatId(chat.chatId);
    setShowMobileThread(true);
    markNestConversationRead(chat);
  }, [chatIdFromUrl, chats, loading]);

  React.useEffect(() => {
    if (!selectedChatId) {
      setConversation(null);
      return;
    }

    const listChat = chatsRef.current.find((item) => item.chatId === selectedChatId);
    const cached = getCachedNestThread(selectedChatId);
    if (cached) {
      setConversation(mergeNestThreadFromList(cached, listChat));
    } else if (listChat) {
      setConversation(buildStubNestConversation(listChat));
    }

    void loadThread(selectedChatId);
  }, [selectedChatId, loadThread]);

  React.useEffect(() => {
    if (activeTab !== "inbox" && activeTab !== "missed_calls") return;
    const listInterval = window.setInterval(() => {
      void loadList(true);
    }, 20_000);
    return () => window.clearInterval(listInterval);
  }, [activeTab, loadList]);

  React.useEffect(() => {
    if ((activeTab !== "inbox" && activeTab !== "missed_calls") || !selectedChatId) return;
    const threadInterval = window.setInterval(() => {
      void loadThread(selectedChatId, true);
    }, 5_000);
    return () => window.clearInterval(threadInterval);
  }, [activeTab, selectedChatId, loadThread]);

  React.useEffect(() => {
    if (activeTab !== "inbox" && activeTab !== "missed_calls") return;
    if (!selectedChatId) return;
    const visible = conversationTabChats.some((chat) => chat.chatId === selectedChatId);
    if (!visible) {
      setSelectedChatId(null);
      setShowMobileThread(false);
    }
  }, [activeTab, conversationTabChats, selectedChatId]);

  React.useEffect(() => {
    if (!selectedChatId) return;
    const listChat = chats.find((item) => item.chatId === selectedChatId);
    if (!listChat) return;
    setConversation((prev) => {
      if (!prev || prev.chatId !== selectedChatId) return prev;
      const merged = mergeNestThreadFromList(prev, listChat);
      if (
        merged.displayName === prev.displayName &&
        merged.title === prev.title &&
        merged.participantHandle === prev.participantHandle
      ) {
        return prev;
      }
      return merged;
    });
  }, [chats, selectedChatId]);

  React.useEffect(() => {
    if (!conversation || !threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [conversation?.messages.length, selectedChatId]);

  function openConversation(chat: NestConversationListItem) {
    markNestConversationRead(chat);
    setShowMobileThread(true);
    setSelectedChatId(chat.chatId);
  }

  const prefetchThread = React.useCallback((chatId: string) => {
    prefetchNestThread(chatId, fetchNestThread);
  }, []);

  function handleSent(tempId: number, message: NestConversationMessage) {
    if (!selectedChatId) return;
    setConversation((prev) => {
      if (!prev) return prev;
      const hasTemp = prev.messages.some((item) => item.id === tempId);
      const messages = hasTemp
        ? prev.messages.map((item) => (item.id === tempId ? message : item))
        : [...prev.messages, message];
      const next = { ...prev, messages };
      setCachedNestThread(next);
      return next;
    });
    setChats((prev) =>
      sortChats(
        prev.map((chat) =>
          chat.chatId === selectedChatId
            ? {
                ...chat,
                preview: message.content.replace(/\s+/g, " ").trim().slice(0, 180),
                previewRole: message.role,
                lastMessageAt: message.createdAt,
                hasManualMessages: true,
                latestManualMessageAt: message.createdAt,
              }
            : chat,
        ),
      ),
    );
  }

  function handleOptimisticSent(message: NestConversationMessage) {
    if (!selectedChatId) return;
    setConversation((prev) => {
      if (!prev) return prev;
      return { ...prev, messages: [...prev.messages, message] };
    });
    setChats((prev) =>
      sortChats(
        prev.map((chat) =>
          chat.chatId === selectedChatId
            ? {
                ...chat,
                preview: message.content.replace(/\s+/g, " ").trim().slice(0, 180),
                previewRole: message.role,
                lastMessageAt: message.createdAt,
                hasManualMessages: true,
                latestManualMessageAt: message.createdAt,
              }
            : chat,
        ),
      ),
    );
  }

  function handleSendFailed(tempId: number) {
    if (!selectedChatId) return;
    setConversation((prev) => {
      if (!prev) return prev;
      return { ...prev, messages: prev.messages.filter((item) => item.id !== tempId) };
    });
  }

  function handleStarted(chatId: string, message: NestConversationMessage) {
    setChats((prev) =>
      sortChats([
        {
          chatId,
          title: message.metadata?.customer_name
            ? String(message.metadata.customer_name)
            : chatId,
          displayName:
            typeof message.metadata?.customer_name === "string"
              ? message.metadata.customer_name
              : null,
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
        },
        ...prev.filter((chat) => chat.chatId !== chatId),
      ]),
    );
    setSelectedChatId(chatId);
    const nextConversation = {
      chatId,
      title: chatId,
      displayName:
        typeof message.metadata?.customer_name === "string"
          ? message.metadata.customer_name
          : null,
      participantHandle:
        typeof message.metadata?.recipient_phone_e164 === "string"
          ? message.metadata.recipient_phone_e164
          : null,
      source: "customer" as const,
      lastSeen: null,
      messages: [message],
    };
    setCachedNestThread(nextConversation);
    setConversation(nextConversation);
    setShowMobileThread(true);
  }

  async function refreshAll() {
    setRefreshing(true);
    await loadList(true);
    if (selectedChatId) {
      await loadThread(selectedChatId, true);
    }
    setRefreshing(false);
  }

  const inboxUnreadCount = inboxChats.filter(isNestConversationUnread).length;
  const missedCallsUnreadCount = missedCallChats.filter(isNestConversationUnread).length;
  const activeConversationUnreadCount =
    activeTab === "missed_calls" ? missedCallsUnreadCount : inboxUnreadCount;

  const headerActions = (
    <>
      {configured !== false ? (
        <>
          <NestPickupSuggestionsDropdown
            disabled={configured !== true}
            onMessageSent={() => void refreshAll()}
            triggerClassName={storeSettingsHeaderActionClass()}
          />
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={refreshing}
            className={storeSettingsHeaderActionClass(false, refreshing)}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setActiveTab((current) => (current === "settings" ? "inbox" : "settings"))}
        className={storeSettingsHeaderActionClass(activeTab === "settings")}
        aria-pressed={activeTab === "settings"}
      >
        <Settings className="h-3.5 w-3.5" />
        Settings
      </button>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className={cn("shrink-0 bg-white", storeSettingsPageChromeClass)}>
        <NestPageHeader
          className={storeSettingsPageHeaderNudgeClass}
          composeDisabled={configured === false}
          onMessageStarted={handleStarted}
          trailingActions={headerActions}
        />

        <div
          className={cn(
            "flex shrink-0 items-center border-b border-gray-200 pb-2",
            storeSettingsPageHeaderNudgeClass,
          )}
        >
          <NestSectionTabs
            activeTab={activeTab === "settings" ? null : activeTab}
            onChange={(tab) => setActiveTab(tab)}
            inboxUnreadCount={inboxUnreadCount}
            missedCallsUnreadCount={missedCallsUnreadCount}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {activeTab === "inbox" || activeTab === "missed_calls" ? (
        <>
          {configured === false ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
              Nest messaging is not configured for this environment yet.
            </div>
          ) : loading && chats.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-1 overflow-hidden md:flex-row">
              <aside
                className={cn(
                  "flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-gray-200 bg-[#f6f6f6] md:h-full md:w-[min(340px,34%)] md:max-w-[380px] md:flex-none md:border-r",
                  showMobileThread ? "hidden md:flex" : "flex flex-1",
                )}
              >
                <div className="shrink-0 border-b border-gray-200/80 bg-[#f6f6f6] px-4 py-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search"
                      className="rounded-md border-gray-300 bg-white pl-9"
                    />
                  </div>
                  {activeConversationUnreadCount > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {activeConversationUnreadCount} unread conversation
                      {activeConversationUnreadCount === 1 ? "" : "s"}
                    </p>
                  ) : null}
                  {!lightspeedConnected ? (
                    <div className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-600">
                      Connect Lightspeed to show customer names instead of phone numbers.{" "}
                      <a href="/connect-lightspeed" className="font-medium text-gray-900 underline">
                        Reconnect Lightspeed
                      </a>
                    </div>
                  ) : null}
                </div>
                <div
                  className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  <div className="space-y-0.5 p-2">
                    {filteredChats.length === 0 ? (
                      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                        {activeTab === "missed_calls" ? (
                          <PhoneMissed
                            className="mb-3 h-8 w-8 text-muted-foreground/40"
                          />
                        ) : (
                          <Inbox
                            className="mb-3 h-8 w-8 text-muted-foreground/40"
                          />
                        )}
                        <p className="text-sm font-medium text-foreground">
                          {searchQuery.trim()
                            ? "No matches"
                            : activeTab === "missed_calls"
                              ? "No missed calls yet"
                              : "No conversations"}
                        </p>
                        <p className="mt-1.5 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
                          {searchQuery.trim()
                            ? "Try a different name, number, or message."
                            : activeTab === "missed_calls"
                              ? "When a customer calls and you don't answer, Nest texts them back automatically. Those conversations appear here."
                              : "When customers message your store, conversations appear here."}
                        </p>
                      </div>
                    ) : (
                      filteredChats.map((chat) => (
                        <ConversationRow
                          key={chat.chatId}
                          chat={chat}
                          active={chat.chatId === selectedChatId}
                          onClick={() => openConversation(chat)}
                          onPrefetch={() => prefetchThread(chat.chatId)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </aside>

              <section
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white md:h-full",
                  showMobileThread ? "flex" : "hidden md:flex",
                )}
              >
                {!selectedChatId || !conversation ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
                    <Inbox className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-base font-semibold tracking-tight text-foreground">
                      Select a message
                    </p>
                    <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                      Choose a conversation from the list to read and reply.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="shrink-0 border-b border-gray-200/80 bg-white/95 px-4 py-3 backdrop-blur-sm md:px-5">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="md:hidden"
                          onClick={() => setShowMobileThread(false)}
                          aria-label="Back to inbox"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <div className="min-w-0 flex-1 text-center md:text-left">
                          <p className="truncate text-sm text-muted-foreground">
                            To:{" "}
                            <span className="font-medium text-foreground">
                              {nestConversationDisplayTitle(conversation)}
                            </span>
                          </p>
                          {conversation.participantHandle ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {conversation.participantHandle}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div
                      ref={threadRef}
                      className="h-0 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-white px-5 py-5 md:px-10"
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      {threadLoading && conversation.messages.length === 0 ? (
                        <div className="flex h-full items-center justify-center py-16">
                          <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                        </div>
                      ) : (
                        conversation.messages.map((message, index) => {
                          const nextMessage = conversation.messages[index + 1];
                          const showTail = !nextMessage || !sameMessageGroup(message, nextMessage);
                          return (
                            <NestThreadMessage
                              key={message.id}
                              message={message}
                              showTail={showTail}
                            />
                          );
                        })
                      )}
                    </div>

                    <div className="shrink-0 border-t border-gray-200/80 bg-white/90 px-4 py-3 backdrop-blur-sm md:px-5">
                      <NestComposePill
                        chatId={selectedChatId}
                        sendHandlers={{
                          onOptimistic: handleOptimisticSent,
                          onConfirmed: handleSent,
                          onFailed: handleSendFailed,
                        }}
                      />
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
        </>
      ) : null}

      {activeTab === "auto" ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
          <NestAutoServicePanel />
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain py-4",
            storeSettingsPageChromeClass,
          )}
        >
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-8">
            <NestMessageTemplatesBento variant="light-beige-floating" />
            <NestHiddenPickupSuggestionsPanel variant="light-beige-floating" />
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

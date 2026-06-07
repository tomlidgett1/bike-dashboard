"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isNestConversationUnread,
  markAllNestConversationsRead,
  markNestConversationRead,
  NEST_READ_STATE_EVENT,
} from "@/lib/nest/conversation-read-state";
import { playNestNotificationSound } from "@/lib/nest/play-notification-sound";
import {
  sanitiseNestConversationsResponse,
  type NestConversationListItem,
} from "@/lib/nest/types";

export type NestMessageNotification = {
  id: string;
  chatId: string;
  displayName: string;
  preview: string;
  receivedAt: string;
};

type Snapshot = Record<string, string>;

function buildSnapshot(chats: NestConversationListItem[]): Snapshot {
  const map: Snapshot = {};
  for (const chat of chats) {
    const anchor = chat.lastCustomerMessageAt || chat.lastMessageAt;
    if (anchor) map[chat.chatId] = anchor;
  }
  return map;
}

function customerMessageAnchor(chat: NestConversationListItem): string | null {
  if (chat.lastCustomerMessageAt) return chat.lastCustomerMessageAt;
  if (chat.previewRole === "user") return chat.lastMessageAt;
  return null;
}

function detectNewCustomerMessages(
  previous: Snapshot,
  chats: NestConversationListItem[],
): NestMessageNotification[] {
  const alerts: NestMessageNotification[] = [];

  for (const chat of chats) {
    const anchor = customerMessageAnchor(chat);
    if (!anchor) continue;

    const previousAnchor = previous[chat.chatId];
    const isNewConversation = !previousAnchor;
    const isUpdatedConversation =
      Boolean(previousAnchor) && new Date(anchor).getTime() > new Date(previousAnchor).getTime();

    if (!isNewConversation && !isUpdatedConversation) continue;
    if (chat.previewRole !== "user" && !chat.lastCustomerMessageAt) continue;

    alerts.push({
      id: `${chat.chatId}:${anchor}`,
      chatId: chat.chatId,
      displayName: chat.displayName || chat.title || chat.participantHandle || chat.chatId,
      preview: chat.preview || "New message",
      receivedAt: anchor,
    });
  }

  return alerts;
}

async function fetchNestChatList(): Promise<{
  chats: NestConversationListItem[];
  configured: boolean;
}> {
  const res = await fetch("/api/store/nest-messages?listOnly=1", { cache: "no-store" });
  const data = (await res.json()) as {
    chats?: NestConversationListItem[];
    configured?: boolean;
    error?: string;
  };

  if (!res.ok) {
    if (res.status === 503 || data.configured === false) {
      return { chats: [], configured: false };
    }
    throw new Error(data.error || "Could not load Nest messages.");
  }

  const sanitised = sanitiseNestConversationsResponse({
    chats: Array.isArray(data.chats) ? data.chats : [],
    selectedChatId: null,
    conversation: null,
  });

  return { chats: sanitised.chats, configured: true };
}

export function useNestNotifications(enabled: boolean, pollIntervalMs = 20_000) {
  const [configured, setConfigured] = useState(false);
  const [chats, setChats] = useState<NestConversationListItem[]>([]);
  const [notifications, setNotifications] = useState<NestMessageNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const snapshotRef = useRef<Snapshot>({});
  const initializedRef = useRef(false);
  const chatsRef = useRef<NestConversationListItem[]>([]);

  const recalculateUnread = useCallback((nextChats: NestConversationListItem[]) => {
    chatsRef.current = nextChats;
    setUnreadCount(nextChats.filter(isNestConversationUnread).length);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    try {
      const { chats: nextChats, configured: isConfigured } = await fetchNestChatList();
      setConfigured(isConfigured);
      setChats(nextChats);
      recalculateUnread(nextChats);

      if (!isConfigured) {
        initializedRef.current = false;
        snapshotRef.current = {};
        return;
      }

      if (initializedRef.current) {
        const incoming = detectNewCustomerMessages(snapshotRef.current, nextChats);
        if (incoming.length > 0) {
          void playNestNotificationSound();
          setNotifications((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            const merged = [...incoming.filter((item) => !seen.has(item.id)), ...prev];
            return merged.slice(0, 20);
          });
        }
      } else {
        initializedRef.current = true;
      }

      snapshotRef.current = buildSnapshot(nextChats);
    } catch (error) {
      console.error("[use-nest-notifications] refresh failed:", error);
    } finally {
      setLoading(false);
    }
  }, [enabled, recalculateUnread]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setConfigured(false);
      setChats([]);
      setNotifications([]);
      setUnreadCount(0);
      initializedRef.current = false;
      snapshotRef.current = {};
      return;
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);

    const onReadStateChanged = () => {
      recalculateUnread(chatsRef.current);
    };
    window.addEventListener(NEST_READ_STATE_EVENT, onReadStateChanged);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(NEST_READ_STATE_EVENT, onReadStateChanged);
    };
  }, [enabled, pollIntervalMs, refresh, recalculateUnread]);

  const markNotificationRead = useCallback(
    (chatId: string) => {
      const chat = chatsRef.current.find((item) => item.chatId === chatId);
      if (chat) markNestConversationRead(chat);
      recalculateUnread(chatsRef.current);
    },
    [recalculateUnread],
  );

  const markAllRead = useCallback(() => {
    markAllNestConversationsRead(chatsRef.current);
    recalculateUnread(chatsRef.current);
  }, [recalculateUnread]);

  const dismissNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    configured,
    chats,
    notifications,
    unreadCount,
    loading,
    refresh,
    markNotificationRead,
    markAllRead,
    dismissNotifications,
  };
}

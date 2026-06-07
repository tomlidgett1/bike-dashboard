"use client";

import * as React from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import {
  useNestNotifications,
  type NestMessageNotification,
} from "@/lib/hooks/use-nest-notifications";
import type { NestConversationListItem } from "@/lib/nest/types";

interface NestNotificationsContextValue {
  configured: boolean;
  chats: NestConversationListItem[];
  notifications: NestMessageNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => void;
  markNotificationRead: (chatId: string) => void;
  markAllRead: () => void;
  dismissNotifications: () => void;
}

const NestNotificationsContext = React.createContext<NestNotificationsContextValue | null>(null);

export function NestNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const isVerifiedStore =
    profile?.account_type === "bicycle_store" && profile?.bicycle_store === true;

  const [shouldPoll, setShouldPoll] = React.useState(false);

  React.useEffect(() => {
    if (!user || !isVerifiedStore) {
      setShouldPoll(false);
      return;
    }

    const timer = window.setTimeout(() => setShouldPoll(true), 1200);
    return () => window.clearTimeout(timer);
  }, [user, isVerifiedStore]);

  const value = useNestNotifications(Boolean(user && isVerifiedStore && shouldPoll));

  return (
    <NestNotificationsContext.Provider value={value}>
      {children}
    </NestNotificationsContext.Provider>
  );
}

export function useNestNotificationsContext() {
  const context = React.useContext(NestNotificationsContext);
  if (!context) {
    return {
      configured: false,
      chats: [],
      notifications: [],
      unreadCount: 0,
      loading: false,
      refresh: () => {},
      markNotificationRead: () => {},
      markAllRead: () => {},
      dismissNotifications: () => {},
    };
  }
  return context;
}

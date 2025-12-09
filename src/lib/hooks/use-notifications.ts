// ============================================================
// USE NOTIFICATIONS HOOK
// ============================================================
// Hook for fetching and managing user notifications

'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  NotificationWithDetails,
  GetNotificationsResponse,
} from '@/lib/types/message';

export function useNotifications(limit: number = 20, unreadOnly: boolean = false) {
  const [notifications, setNotifications] = useState<NotificationWithDetails[]>(
    []
  );
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: limit.toString(),
        unreadOnly: unreadOnly.toString(),
      });

      const response = await fetch(
        `/api/messages/notifications?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data: GetNotificationsResponse = await response.json();
      setNotifications(data.notifications);
      setTotal(data.total);
      setUnread(data.unread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [limit, unreadOnly]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch(
          `/api/messages/notifications/${notificationId}/read`,
          {
            method: 'PATCH',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to mark notification as read');
        }

        // Update local state
        setNotifications((prev) =>
          prev.map((notif) =>
            notif.id === notificationId
              ? { ...notif, is_read: true, read_at: new Date().toISOString() }
              : notif
          )
        );
        setUnread((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Error marking notification as read:', err);
        throw err;
      }
    },
    []
  );

  const refresh = useCallback(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return {
    notifications,
    total,
    unread,
    loading,
    error,
    markAsRead,
    refresh,
  };
}







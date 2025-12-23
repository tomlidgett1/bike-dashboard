// ============================================================
// USE ORDER NOTIFICATIONS HOOK
// ============================================================
// Hook for fetching and managing order notifications with real-time updates

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface OrderNotification {
  id: string;
  user_id: string;
  purchase_id: string | null;
  voucher_id: string | null;
  type: string;
  notification_category: string;
  priority: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  purchase?: {
    id: string;
    order_number: string;
    total_amount: number;
    status: string;
    product_id: string;
    buyer_id: string;
    seller_id: string;
    product?: {
      id: string;
      description: string;
      display_name: string | null;
      images: any[] | null;
    };
  };
  voucher?: {
    id: string;
    amount_cents: number;
    min_purchase_cents: number;
    description: string;
    status: string;
  };
}

interface UseOrderNotificationsReturn {
  notifications: OrderNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => void;
}

export function useOrderNotifications(
  limit: number = 10,
  unreadOnly: boolean = false
): UseOrderNotificationsReturn {
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    try {
      setError(null);
      
      const params = new URLSearchParams({
        limit: limit.toString(),
        unreadOnly: unreadOnly.toString(),
      });

      const response = await fetch(`/api/notifications/orders?${params}`);

      if (response.status === 401) {
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching order notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [limit, unreadOnly]);

  // Fetch unread count only
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/orders/unread-count');
      
      if (response.status === 401) {
        setUnreadCount(0);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count || 0);
      }
    } catch (err) {
      console.error('Error fetching unread count:', err);
    }
  }, []);

  // Mark a notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/orders/${notificationId}/read`, {
        method: 'POST',
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev => 
          prev.map(n => 
            n.id === notificationId 
              ? { ...n, is_read: true, read_at: new Date().toISOString() } 
              : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/orders/mark-all-read', {
        method: 'POST',
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev => 
          prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    const supabase = createClient();

    // Get current user for realtime filter
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      userIdRef.current = user.id;

      // Subscribe to notifications table for this user's order notifications
      channelRef.current = supabase
        .channel('order-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Only handle order notifications
            if (payload.new && (payload.new as any).notification_category === 'order') {
              // Refresh notifications to get enriched data
              fetchNotifications();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Update local notification if it's an order notification
            if (payload.new && (payload.new as any).notification_category === 'order') {
              const updated = payload.new as any;
              setNotifications(prev =>
                prev.map(n =>
                  n.id === updated.id
                    ? { ...n, is_read: updated.is_read, read_at: updated.read_at }
                    : n
                )
              );
              // Refresh unread count
              fetchUnreadCount();
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    // Cleanup subscription on unmount
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [fetchNotifications, fetchUnreadCount]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Polling fallback for reliability (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}

// Simpler hook just for unread count (lighter weight)
export function useOrderNotificationCount(refreshInterval: number = 30000) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/orders/unread-count');
      
      if (response.status === 401) {
        setCount(0);
        setLoading(false);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setCount(data.count || 0);
      }
    } catch (err) {
      console.error('Error fetching notification count:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up real-time subscription for count updates
  useEffect(() => {
    const supabase = createClient();

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      // Subscribe to order notification changes
      channelRef.current = supabase
        .channel('order-notification-count')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Refresh count on any notification change
            if ((payload.new as any)?.notification_category === 'order' ||
                (payload.old as any)?.notification_category === 'order') {
              fetchCount();
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [fetchCount]);

  // Initial fetch and polling
  useEffect(() => {
    fetchCount();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchCount, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchCount, refreshInterval]);

  return { count, loading, refresh: fetchCount };
}





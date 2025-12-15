// ============================================================
// USE COMBINED UNREAD COUNT HOOK
// ============================================================
// Hook for fetching total unread count (messages + offers)
// Uses Supabase Realtime for instant badge updates

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface CombinedUnreadCount {
  messages: number;
  offers: number;
  total: number;
}

export function useCombinedUnreadCount(refreshInterval: number = 30000) {
  const [counts, setCounts] = useState<CombinedUnreadCount>({
    messages: 0,
    offers: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const fetchCountsRef = useRef<() => Promise<void>>(null!);
  const realtimeConnectedRef = useRef(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      setError(null);

      // Use the new combined endpoint - much faster than two separate calls!
      const response = await fetch('/api/unread-counts');

      // If unauthorized, silently set counts to 0 (user not logged in)
      if (response.status === 401) {
        setCounts({ messages: 0, offers: 0, total: 0 });
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch unread counts');
      }

      const data = await response.json();

      setCounts({
        messages: data.messages || 0,
        offers: data.offers || 0,
        total: data.total || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching combined unread counts:', err);
      // Default to 0 on error
      setCounts({ messages: 0, offers: 0, total: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep ref updated with latest fetchCounts
  fetchCountsRef.current = fetchCounts;

  // Set up Supabase Realtime subscription (replaces polling)
  useEffect(() => {
    // Don't set up if disabled (refreshInterval is 0)
    if (refreshInterval === 0) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let isMounted = true;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !isMounted) {
        setLoading(false);
        return;
      }

      userIdRef.current = user.id;

      // Initial fetch
      fetchCountsRef.current?.();

      // Start fallback polling immediately - realtime will disable it if connected
      // This ensures updates even if realtime takes time to connect or fails silently
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          fetchCountsRef.current?.();
        }, Math.max(refreshInterval, 5000));
      }

      // Subscribe to messages and offers tables for instant badge updates
      channelRef.current = supabase
        .channel('unread-counts-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          (payload) => {
            console.log('[Realtime] Unread counts - new message:', payload);
            // New message - refresh counts
            fetchCountsRef.current?.();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'conversation_participants',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('[Realtime] Unread counts - participant update:', payload);
            // Unread count updated (e.g., messages marked as read)
            fetchCountsRef.current?.();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'offers',
          },
          (payload) => {
            console.log('[Realtime] Unread counts - offer change:', payload);
            const offer = (payload.new || payload.old) as any;
            // Only refresh if this offer involves the current user
            if (offer?.buyer_id === userIdRef.current || offer?.seller_id === userIdRef.current) {
              fetchCountsRef.current?.();
            }
          }
        )
        .subscribe((status, err) => {
          console.log('[Realtime] Unread counts subscription:', status, err || '');
          
          if (status === 'SUBSCRIBED') {
            realtimeConnectedRef.current = true;
            // Clear polling if realtime connected
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            realtimeConnectedRef.current = false;
            // Start fallback polling if realtime fails
            if (!pollingIntervalRef.current && isMounted && refreshInterval > 0) {
              console.log('[Realtime] Unread counts: Falling back to polling');
              pollingIntervalRef.current = setInterval(() => {
                fetchCountsRef.current?.();
              }, Math.max(refreshInterval, 5000)); // Use refreshInterval or minimum 5s
            }
          }
        });
    };

    setupRealtime();

    // Cleanup subscription on unmount
    return () => {
      isMounted = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [refreshInterval]); // Only re-run if refreshInterval changes

  const refresh = useCallback(() => {
    fetchCounts();
  }, [fetchCounts]);

  return {
    counts,
    loading,
    error,
    refresh,
  };
}


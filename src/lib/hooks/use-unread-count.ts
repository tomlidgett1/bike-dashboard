// ============================================================
// USE UNREAD COUNT HOOK
// ============================================================
// Hook for fetching total unread message count

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UnreadCountResponse } from '@/lib/types/message';

export function useUnreadCount(refreshInterval: number = 30000) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch('/api/messages/unread-count');

      // If unauthorized, silently set count to 0 (user not logged in)
      if (response.status === 401) {
        setCount(0);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch unread count');
      }

      const data: UnreadCountResponse = await response.json();
      setCount(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching unread count:', err);
      setCount(0); // Default to 0 on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Don't fetch if polling is disabled (refreshInterval is 0)
    if (refreshInterval === 0) {
      setLoading(false);
      return;
    }

    fetchUnreadCount();

    // Set up polling interval
    const interval = setInterval(fetchUnreadCount, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchUnreadCount, refreshInterval]);

  const refresh = useCallback(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  return {
    count,
    loading,
    error,
    refresh,
  };
}


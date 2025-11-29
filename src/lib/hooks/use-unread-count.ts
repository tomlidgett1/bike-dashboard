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

      if (!response.ok) {
        throw new Error('Failed to fetch unread count');
      }

      const data: UnreadCountResponse = await response.json();
      setCount(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching unread count:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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


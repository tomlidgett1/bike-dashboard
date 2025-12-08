// ============================================================
// USE COMBINED UNREAD COUNT HOOK
// ============================================================
// Hook for fetching total unread count (messages + offers)

'use client';

import { useState, useEffect, useCallback } from 'react';

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

  useEffect(() => {
    // Don't fetch if polling is disabled (refreshInterval is 0)
    if (refreshInterval === 0) {
      setLoading(false);
      return;
    }

    fetchCounts();

    // Set up polling interval
    const interval = setInterval(fetchCounts, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchCounts, refreshInterval]);

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


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

      // Fetch both counts in parallel
      const [messagesResponse, offersResponse] = await Promise.all([
        fetch('/api/messages/unread-count'),
        fetch('/api/offers/unread-count'),
      ]);

      // If unauthorized, silently set counts to 0 (user not logged in)
      if (messagesResponse.status === 401 || offersResponse.status === 401) {
        setCounts({ messages: 0, offers: 0, total: 0 });
        setLoading(false);
        return;
      }

      if (!messagesResponse.ok || !offersResponse.ok) {
        console.warn('Unread counts fetch failed:', {
          messages: messagesResponse.status,
          offers: offersResponse.status
        });
        throw new Error('Failed to fetch unread counts');
      }

      const messagesData = await messagesResponse.json();
      const offersData = await offersResponse.json();

      const messagesCount = messagesData.count || 0;
      const offersCount = offersData.count || 0;

      setCounts({
        messages: messagesCount,
        offers: offersCount,
        total: messagesCount + offersCount,
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


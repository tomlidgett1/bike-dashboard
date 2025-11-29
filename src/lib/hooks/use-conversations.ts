// ============================================================
// USE CONVERSATIONS HOOK
// ============================================================
// Hook for fetching and managing user's conversation list

'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  ConversationListItem,
  GetConversationsResponse,
  ConversationStatus,
} from '@/lib/types/message';

export function useConversations(
  page: number = 1,
  limit: number = 20,
  archived: boolean = false
) {
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    []
  );
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        archived: archived.toString(),
      });

      const response = await fetch(
        `/api/messages/conversations?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }

      const data: GetConversationsResponse = await response.json();
      setConversations(data.conversations);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, archived]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const refresh = useCallback(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    total,
    loading,
    error,
    refresh,
  };
}


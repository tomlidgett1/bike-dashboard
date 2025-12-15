// ============================================================
// USE CONVERSATIONS HOOK
// ============================================================
// Hook for fetching and managing user's conversation list
// Uses Supabase Realtime for instant updates without polling

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const initialLoadCompleteRef = useRef(false);
  const fetchConversationsRef = useRef<(silent?: boolean) => Promise<void>>(null!);
  const realtimeConnectedRef = useRef(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch conversations - silent mode for background refreshes
  const fetchConversations = useCallback(async (silent: boolean = false) => {
    try {
      // Only show loading spinner on initial load, not background refreshes
      if (!silent && !initialLoadCompleteRef.current) {
        setLoading(true);
      }
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
      initialLoadCompleteRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, archived]);

  // Keep ref updated with latest fetchConversations
  fetchConversationsRef.current = fetchConversations;

  // Set up Supabase Realtime subscription (only runs once on mount)
  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !isMounted) {
        setLoading(false);
        return;
      }

      userIdRef.current = user.id;

      // Subscribe to messages table for new messages (updates last_message)
      // Subscribe to conversation_participants for unread count changes
      channelRef.current = supabase
        .channel('conversations-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          (payload) => {
            console.log('[Realtime] New message in conversations list:', payload);
            // New message received - silently refresh to update last_message preview
            fetchConversationsRef.current?.(true);
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
            console.log('[Realtime] Participant update:', payload);
            // Participant data updated (e.g., unread count, archived status)
            fetchConversationsRef.current?.(true);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'conversations',
          },
          (payload) => {
            console.log('[Realtime] New conversation:', payload);
            // New conversation created - refresh list
            fetchConversationsRef.current?.(true);
          }
        )
        .subscribe((status, err) => {
          console.log('[Realtime] Conversations list subscription:', status, err || '');
          
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
            if (!pollingIntervalRef.current && isMounted) {
              console.log('[Realtime] Conversations: Falling back to polling');
              pollingIntervalRef.current = setInterval(() => {
                fetchConversationsRef.current?.(true);
              }, 10000); // Poll every 10 seconds as fallback
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
  }, []); // Empty deps - only run once

  // Initial fetch
  useEffect(() => {
    fetchConversations(false);
  }, [page, limit, archived]);

  // Manual refresh (also silent to avoid UI disruption)
  const refresh = useCallback(() => {
    fetchConversations(true);
  }, [fetchConversations]);

  return {
    conversations,
    total,
    loading,
    error,
    refresh,
  };
}











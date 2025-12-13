// ============================================================
// USE CONVERSATION HOOK
// ============================================================
// Hook for fetching a single conversation with messages

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ConversationWithMessages,
  GetConversationResponse,
  MessageWithAttachments,
} from '@/lib/types/message';

// Simple in-memory cache for conversations
const conversationCache = new Map<string, ConversationWithMessages>();

export function useConversation(conversationId: string | null) {
  const [conversation, setConversation] =
    useState<ConversationWithMessages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchConversation = useCallback(async (showCachedFirst = true) => {
    if (!conversationId) {
      setConversation(null);
      setLoading(false);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Show cached data immediately if available AND it's the right conversation
    const cached = conversationCache.get(conversationId);
    if (cached && cached.id === conversationId && showCachedFirst) {
      setConversation(cached);
      setLoading(false); // Don't show loading spinner if we have cached data
    } else {
      // Clear old conversation immediately to prevent showing wrong data
      setConversation(null);
      setLoading(true);
    }

    try {
      setError(null);

      const response = await fetch(
        `/api/messages/conversations/${conversationId}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch conversation');
      }

      const data: GetConversationResponse = await response.json();
      
      // Update cache and state
      conversationCache.set(conversationId, data.conversation);
      setConversation(data.conversation);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching conversation:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchConversation(true);
    
    // Cleanup: abort any in-flight requests when unmounting or changing conversation
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchConversation]);

  const sendMessage = useCallback(
    async (content: string, attachments?: File[]) => {
      if (!conversationId || !content.trim()) {
        return null;
      }

      try {
        setSendingMessage(true);

        const formData = new FormData();
        formData.append('content', content);

        if (attachments && attachments.length > 0) {
          attachments.forEach((file) => {
            formData.append('attachments', file);
          });
        }

        const response = await fetch(
          `/api/messages/conversations/${conversationId}/messages`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        const data = await response.json();
        const newMessage: MessageWithAttachments = data.message;

        // Add message to local state and cache
        if (conversation && conversationId) {
          const updatedConversation = {
            ...conversation,
            messages: [...conversation.messages, newMessage],
            message_count: conversation.message_count + 1,
          };
          setConversation(updatedConversation);
          conversationCache.set(conversationId, updatedConversation);
        }

        return newMessage;
      } catch (err) {
        console.error('Error sending message:', err);
        throw err;
      } finally {
        setSendingMessage(false);
      }
    },
    [conversationId, conversation]
  );

  const archiveConversation = useCallback(
    async (archived: boolean) => {
      if (!conversationId) return;

      try {
        const response = await fetch(
          `/api/messages/conversations/${conversationId}/archive`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ archived }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to archive conversation');
        }

        // Refresh conversation
        await fetchConversation();
      } catch (err) {
        console.error('Error archiving conversation:', err);
        throw err;
      }
    },
    [conversationId, fetchConversation]
  );

  const refresh = useCallback(() => {
    // Force refresh - show loading state
    fetchConversation(false);
  }, [fetchConversation]);

  return {
    conversation,
    loading,
    error,
    sendingMessage,
    sendMessage,
    archiveConversation,
    refresh,
  };
}









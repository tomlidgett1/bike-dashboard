// ============================================================
// USE CONVERSATION HOOK
// ============================================================
// Hook for fetching a single conversation with messages
// Uses Supabase Realtime for instant message updates

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  ConversationWithMessages,
  GetConversationResponse,
  MessageWithAttachments,
} from '@/lib/types/message';

// Simple in-memory cache for conversations
const conversationCache = new Map<string, ConversationWithMessages>();

function getTicketId(conversationId: string | null): string | null {
  return conversationId?.startsWith('ticket:') ? conversationId.slice('ticket:'.length) : null;
}

type TicketMessage = {
  id: string;
  ticket_id: string;
  sender_id: string;
  message: string;
  attachments?: unknown;
  created_at: string;
  sender?: {
    user_id: string;
    name?: string | null;
    business_name?: string | null;
    logo_url?: string | null;
  };
};

type TicketDetailResponse = {
  ticket: {
    id: string;
    ticket_number: string;
    subject: string;
    status: string;
    category: string;
    created_at: string;
    updated_at?: string | null;
    purchase?: {
      id: string;
      order_number?: string | null;
      buyer_id?: string | null;
      seller_id?: string | null;
      product?: {
        id: string;
        description?: string | null;
        display_name?: string | null;
        price?: number | null;
        primary_image_url?: string | null;
        cached_image_url?: string | null;
      } | null;
      seller?: {
        user_id: string;
        name?: string | null;
        business_name?: string | null;
        logo_url?: string | null;
      } | null;
      buyer?: {
        user_id: string;
        name?: string | null;
        business_name?: string | null;
        logo_url?: string | null;
      } | null;
    } | null;
    product?: {
      id: string;
      description?: string | null;
      display_name?: string | null;
      price?: number | null;
      primary_image_url?: string | null;
      cached_image_url?: string | null;
    } | null;
  };
  messages: TicketMessage[];
  userRole?: 'buyer' | 'seller' | 'admin';
};

function mapTicketMessage(
  message: TicketMessage,
  conversationId: string
): MessageWithAttachments {
  return {
    id: message.id,
    conversation_id: conversationId,
    sender_id: message.sender_id,
    content: message.message,
    message_type: 'user',
    is_deleted: false,
    created_at: message.created_at,
    edited_at: null,
    attachments: [],
    sender: message.sender ? {
      user_id: message.sender.user_id,
      name: message.sender.name || '',
      business_name: message.sender.business_name || '',
      logo_url: message.sender.logo_url || null,
    } : undefined,
  };
}

function mapTicketDetailToConversation(
  data: TicketDetailResponse,
  conversationId: string
): ConversationWithMessages {
  const { ticket } = data;
  const product = ticket.product || ticket.purchase?.product || null;
  const otherUser = data.userRole === 'seller'
    ? ticket.purchase?.buyer
    : ticket.purchase?.seller;
  const messages = (data.messages || []).map((message) =>
    mapTicketMessage(message, conversationId)
  );
  const lastMessageAt = messages[messages.length - 1]?.created_at || ticket.updated_at || ticket.created_at;

  return {
    id: conversationId,
    source: 'ticket',
    ticket: {
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      category: ticket.category,
    },
    product_id: product?.id || null,
    subject: ticket.subject || ticket.ticket_number,
    status: ['resolved', 'closed'].includes(ticket.status) ? 'closed' : 'active',
    last_message_at: lastMessageAt,
    message_count: messages.length,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at || ticket.created_at,
    participants: otherUser ? [{
      user_id: otherUser.user_id,
      user: {
        user_id: otherUser.user_id,
        name: otherUser.name || '',
        business_name: otherUser.business_name || '',
        logo_url: otherUser.logo_url || null,
      },
    }] : [],
    product: product ? {
      id: product.id,
      description: product.description || ticket.subject,
      display_name: product.display_name || null,
      price: product.price || 0,
      primary_image_url: product.cached_image_url || product.primary_image_url || null,
    } : undefined,
    messages,
  };
}

export function useConversation(conversationId: string | null) {
  const [conversation, setConversation] =
    useState<ConversationWithMessages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

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

      const ticketId = getTicketId(conversationId);
      const response = await fetch(
        ticketId
          ? `/api/support/tickets/${ticketId}`
          : `/api/messages/conversations/${conversationId}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch conversation');
      }

      const data = await response.json();
      const conversationData: ConversationWithMessages = ticketId
        ? mapTicketDetailToConversation(data as TicketDetailResponse, conversationId)
        : (data as GetConversationResponse).conversation;
      
      // Update cache and state
      conversationCache.set(conversationId, conversationData);
      setConversation(conversationData);
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

  // Track if realtime is connected
  const realtimeConnectedRef = useRef(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set up Supabase Realtime subscription for this conversation
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    realtimeConnectedRef.current = false;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;
      
      currentUserIdRef.current = user.id;
      const ticketId = getTicketId(conversationId);

      // Subscribe to new messages in this conversation
      channelRef.current = supabase
        .channel(`conversation-${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: ticketId ? 'ticket_messages' : 'messages',
            filter: ticketId
              ? `ticket_id=eq.${ticketId}`
              : `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            console.log('[Realtime] New message received:', payload);
            if (ticketId) {
              fetchConversation(true);
              return;
            }

            const newMessage = {
              ...(payload.new as Omit<MessageWithAttachments, 'attachments'>),
              attachments: [],
            } satisfies MessageWithAttachments;
            
            // Only add if it's from another user (we already add our own messages optimistically)
            if (newMessage.sender_id !== currentUserIdRef.current) {
              setConversation(prev => {
                if (!prev) return prev;
                
                // Check if message already exists (avoid duplicates)
                if (prev.messages.some(m => m.id === newMessage.id)) {
                  return prev;
                }
                
                const updatedConversation = {
                  ...prev,
                  messages: [...prev.messages, newMessage as MessageWithAttachments],
                  message_count: prev.message_count + 1,
                };
                
                // Update cache
                conversationCache.set(conversationId, updatedConversation);
                return updatedConversation;
              });
            }
          }
        )
        .subscribe((status, err) => {
          console.log(`[Realtime] Conversation ${conversationId} subscription:`, status, err || '');
          
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
            if (!pollingIntervalRef.current) {
              console.log('[Realtime] Falling back to polling');
              pollingIntervalRef.current = setInterval(() => {
                fetchConversation(true);
              }, 5000); // Poll every 5 seconds as fallback
            }
          }
        });
    };

    setupRealtime();

    // Cleanup subscription when conversation changes or component unmounts
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [conversationId, fetchConversation]);

  // Initial fetch
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

        const ticketId = getTicketId(conversationId);
        let response: Response;

        if (ticketId) {
          response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: content }),
          });
        } else {
          const formData = new FormData();
          formData.append('content', content);

          if (attachments && attachments.length > 0) {
            attachments.forEach((file) => {
              formData.append('attachments', file);
            });
          }

          response = await fetch(
            `/api/messages/conversations/${conversationId}/messages`,
            {
              method: 'POST',
              body: formData,
            }
          );
        }

        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        const data = await response.json();
        const newMessage: MessageWithAttachments = ticketId
          ? mapTicketMessage(data.message, conversationId)
          : data.message;

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
      if (getTicketId(conversationId)) return;

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










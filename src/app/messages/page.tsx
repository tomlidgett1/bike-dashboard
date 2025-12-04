// ============================================================
// MESSAGES INBOX PAGE
// ============================================================
// Two-column layout: conversation list + active conversation

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useMobileNav } from '@/components/providers/mobile-nav-provider';
import { useConversations } from '@/lib/hooks/use-conversations';
import { useConversation } from '@/lib/hooks/use-conversation';
import { ConversationListItem } from '@/components/messages/conversation-list-item';
import { MessageThread } from '@/components/messages/message-thread';
import { MessageComposer } from '@/components/messages/message-composer';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Archive, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function MessagesPageContent() {
  const { user } = useAuth();
  const { setIsHidden: setMobileNavHidden } = useMobileNav();
  const searchParams = useSearchParams();
  const conversationFromUrl = searchParams?.get('conversation');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    conversationFromUrl || null
  );
  const [showArchived, setShowArchived] = useState(false);
  const [showConversationOnMobile, setShowConversationOnMobile] = useState(!!conversationFromUrl);

  // Set initial mobile nav state immediately
  React.useEffect(() => {
    setMobileNavHidden(!!conversationFromUrl);
  }, []);

  const { conversations, loading: loadingList, refresh: refreshList } = useConversations(
    1,
    50,
    showArchived
  );

  const {
    conversation,
    loading: loadingConversation,
    sendMessage,
    sendingMessage,
    archiveConversation,
    refresh: refreshConversation,
  } = useConversation(activeConversationId);

  // Handle initial conversation from URL
  useEffect(() => {
    const conversationFromUrl = searchParams?.get('conversation');
    if (conversationFromUrl) {
      setActiveConversationId(conversationFromUrl);
      setShowConversationOnMobile(true);
      setMobileNavHidden(true);
    } else {
      setMobileNavHidden(false);
    }
  }, [searchParams, setMobileNavHidden]);

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    await sendMessage(content, attachments);
    refreshList(); // Refresh list to update last message
  };

  const handleArchive = async () => {
    if (!activeConversationId) return;
    await archiveConversation(!showArchived);
    setActiveConversationId(null);
    setShowConversationOnMobile(false);
    setMobileNavHidden(false);
    refreshList();
  };

  const handleConversationSelect = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setShowConversationOnMobile(true);
    setMobileNavHidden(true);
  };

  const handleBackToList = () => {
    setShowConversationOnMobile(false);
    setMobileNavHidden(false);
  };

  // Update mobile nav visibility when conversation state changes
  useEffect(() => {
    setMobileNavHidden(showConversationOnMobile);
  }, [showConversationOnMobile, setMobileNavHidden]);

  const otherParticipant = conversation?.participants?.find(
    (p) => p.user_id !== user?.id
  );

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div className="flex h-[100dvh] md:h-screen bg-gray-50 overflow-hidden w-full max-w-full">
      {/* Left Sidebar: Conversation List */}
      <div
        className={cn(
          'w-full md:w-96 bg-white md:border-r border-gray-200 flex flex-col h-full pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0',
          showConversationOnMobile && 'hidden md:flex'
        )}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
          
          {/* Tabs */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit mt-3">
            <button
              onClick={() => setShowArchived(false)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                !showArchived
                  ? 'text-gray-800 bg-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200/70'
              )}
            >
              Active
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                showArchived
                  ? 'text-gray-800 bg-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200/70'
              )}
            >
              Archived
            </button>
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center h-full">
              <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 px-4 py-12">
              <MessageCircle className="h-12 w-12 mb-4 text-gray-400" />
              <p className="text-sm text-center">
                {showArchived ? 'No archived conversations' : 'No conversations yet'}
              </p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationListItem
                key={conv.id}
                conversation={conv}
                active={conv.id === activeConversationId}
                onClick={() => handleConversationSelect(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right Panel: Active Conversation */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-white h-full w-full md:w-auto overflow-hidden fixed inset-0 md:static md:inset-auto z-20',
          !showConversationOnMobile && 'hidden md:flex'
        )}
      >
        {activeConversationId && conversation ? (
          <>
            {/* Conversation Header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 flex-shrink-0 bg-white w-full">
              {/* Back button on mobile */}
              <button
                onClick={handleBackToList}
                className="md:hidden p-2 hover:bg-gray-100 active:bg-gray-200 rounded-full flex-shrink-0"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700" />
              </button>

              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold flex-shrink-0 text-sm">
                {(conversations.find((c) => c.id === activeConversationId)
                  ?.other_participants[0]?.business_name?.[0] ||
                  conversations.find((c) => c.id === activeConversationId)
                    ?.other_participants[0]?.name?.[0] ||
                  '?').toUpperCase()}
              </div>

              {/* Participant Info */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <h3 className="font-semibold text-sm text-gray-900 truncate">
                  {conversations.find((c) => c.id === activeConversationId)
                    ?.other_participants[0]?.business_name ||
                    conversations.find((c) => c.id === activeConversationId)
                      ?.other_participants[0]?.name ||
                    'Unknown User'}
                </h3>
              </div>

              {/* Archive button - icon only */}
              <button
                onClick={handleArchive}
                className="p-1.5 hover:bg-gray-100 rounded-full flex-shrink-0"
              >
                <Archive className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Product Info Card (if product conversation) */}
            {conversation.product && (
              <div className="mx-4 mt-2 mb-1 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2 flex-shrink-0 w-[calc(100%-2rem)]">
                {conversation.product.primary_image_url && (
                  <div className="w-10 h-10 rounded-md overflow-hidden border border-blue-200 flex-shrink-0">
                    <Image
                      src={conversation.product.primary_image_url}
                      alt={conversation.product.display_name || conversation.product.description}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="font-medium text-gray-900 truncate text-xs leading-tight">
                    {conversation.product.display_name || conversation.product.description}
                  </p>
                  <p className="text-xs font-semibold text-blue-600 mt-0.5">
                    ${conversation.product.price?.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {/* Message Thread */}
            {loadingConversation ? (
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <MessageThread
                messages={conversation.messages}
                currentUserId={user?.id || ''}
                className="flex-1 overflow-y-auto"
              />
            )}

            {/* Message Composer - Always at bottom */}
            <div className="px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-gray-200 flex-shrink-0 bg-white w-full">
              <MessageComposer
                conversationId={activeConversationId}
                onSend={handleSendMessage}
                disabled={sendingMessage}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 px-4 py-12">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1 text-gray-600">Choose a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// Wrap with Suspense for useSearchParams
export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading messages...</div>
      </div>
    }>
      <MessagesPageContent />
    </Suspense>
  );
}


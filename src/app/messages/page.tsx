// ============================================================
// MESSAGES INBOX PAGE
// ============================================================
// Two-column layout: conversation list + active conversation
// Includes Offers tab for viewing and managing product offers

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useMobileNav } from '@/components/providers/mobile-nav-provider';
import { useConversations } from '@/lib/hooks/use-conversations';
import { useConversation } from '@/lib/hooks/use-conversation';
import { useAcceptOffer, useRejectOffer, useCounterOffer, useCancelOffer, useOffer } from '@/lib/hooks/use-offers';
import { useCombinedUnreadCount } from '@/lib/hooks/use-combined-unread-count';
import { ConversationListItem } from '@/components/messages/conversation-list-item';
import { MessageThread } from '@/components/messages/message-thread';
import { MessageComposer } from '@/components/messages/message-composer';
import { OffersList } from '@/components/offers/offers-list';
import { OfferDetailCard } from '@/components/offers/offer-detail-card';
import { CounterOfferModal } from '@/components/offers/counter-offer-modal';
import { OfferConfirmationDialog } from '@/components/offers/offer-confirmation-dialog';
import { MarketplaceHeader } from '@/components/marketplace/marketplace-header';
import { MarketplaceSidebar } from '@/components/layout/marketplace-sidebar';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Archive, MessageCircle, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarState, SidebarStateProvider } from '@/lib/hooks/use-sidebar-state';
import Image from 'next/image';
import type { EnrichedOffer, OfferRole, OfferStatus } from '@/lib/types/offer';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function MessagesPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const { setIsHidden: setMobileNavHidden } = useMobileNav();
  const { isCollapsed } = useSidebarState();
  
  // Only fetch unread counts if user is authenticated
  const { counts: unreadCounts } = useCombinedUnreadCount(user ? 30000 : 0);
  
  const searchParams = useSearchParams();
  const conversationFromUrl = searchParams?.get('conversation');
  const tabFromUrl = searchParams?.get('tab') as 'messages' | 'offers' | null;
  
  const [activeTab, setActiveTab] = useState<'messages' | 'offers'>(tabFromUrl || 'messages');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    conversationFromUrl || null
  );
  const [showArchived, setShowArchived] = useState(false);
  const [showConversationOnMobile, setShowConversationOnMobile] = useState(!!conversationFromUrl);
  
  // Offers state
  const [activeOfferId, setActiveOfferId] = useState<string | null>(null);
  const [showOfferDetailOnMobile, setShowOfferDetailOnMobile] = useState(false);
  const [offerRole, setOfferRole] = useState<OfferRole>('buyer');
  const [offerStatusFilter, setOfferStatusFilter] = useState<OfferStatus | undefined>();
  const [counterOfferModalOpen, setCounterOfferModalOpen] = useState(false);
  const [selectedOfferForCounter, setSelectedOfferForCounter] = useState<EnrichedOffer | null>(null);
  
  // Confirmation dialog state
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<'accept' | 'reject' | 'cancel'>('accept');
  const [offerToConfirm, setOfferToConfirm] = useState<EnrichedOffer | null>(null);
  
  // Loading state for list
  const [loadingOfferId, setLoadingOfferId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<'accept' | 'reject' | 'counter' | 'cancel' | null>(null);
  
  // Offer mutations
  const { acceptOffer, accepting } = useAcceptOffer();
  const { rejectOffer, rejecting } = useRejectOffer();
  const { counterOffer, countering } = useCounterOffer();
  const { cancelOffer, cancelling } = useCancelOffer();
  
  // Fetch active offer details
  const { offer: activeOffer, loading: loadingActiveOffer, refresh: refreshActiveOffer } = useOffer(activeOfferId);

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

  // Handle initial conversation and tab from URL
  useEffect(() => {
    const conversationFromUrl = searchParams?.get('conversation');
    const tabFromUrl = searchParams?.get('tab') as 'messages' | 'offers' | null;
    
    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
    }
    
    if (conversationFromUrl && tabFromUrl !== 'offers') {
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
    setShowOfferDetailOnMobile(false);
    setMobileNavHidden(false);
  };

  const handleBackToMarketplace = () => {
    router.push('/marketplace');
  };

  // Update mobile nav visibility when conversation/offer state changes
  useEffect(() => {
    setMobileNavHidden(showConversationOnMobile || showOfferDetailOnMobile);
  }, [showConversationOnMobile, showOfferDetailOnMobile, setMobileNavHidden]);

  // Offer handlers
  const handleOfferClick = (offerId: string) => {
    setActiveOfferId(offerId);
    setShowOfferDetailOnMobile(true);
    setMobileNavHidden(true);
  };

  const handleAcceptOfferClick = async (offerId: string) => {
    // Fetch the offer details first
    setLoadingOfferId(offerId);
    setLoadingAction('accept');
    
    try {
      const response = await fetch(`/api/offers/${offerId}`);
      if (response.ok) {
        const data = await response.json();
        setOfferToConfirm(data.offer);
        setConfirmationAction('accept');
        setConfirmationDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching offer:', error);
    } finally {
      setLoadingOfferId(null);
      setLoadingAction(null);
    }
  };

  const handleRejectOfferClick = async (offerId: string) => {
    // Fetch the offer details first
    setLoadingOfferId(offerId);
    setLoadingAction('reject');
    
    try {
      const response = await fetch(`/api/offers/${offerId}`);
      if (response.ok) {
        const data = await response.json();
        setOfferToConfirm(data.offer);
        setConfirmationAction('reject');
        setConfirmationDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching offer:', error);
    } finally {
      setLoadingOfferId(null);
      setLoadingAction(null);
    }
  };
  
  const confirmOfferAction = async () => {
    if (!offerToConfirm) return;
    
    setLoadingOfferId(offerToConfirm.id);
    setLoadingAction(confirmationAction === 'cancel' ? 'cancel' : confirmationAction);
    
    try {
      if (confirmationAction === 'accept') {
        await acceptOffer(offerToConfirm.id);
      } else if (confirmationAction === 'reject') {
        await rejectOffer(offerToConfirm.id);
      } else if (confirmationAction === 'cancel') {
        await cancelOffer(offerToConfirm.id);
      }
      
      // Close dialog and reset state
      setConfirmationDialogOpen(false);
      setOfferToConfirm(null);
      
      // If in detail view, close it
      if (offerToConfirm.id === activeOfferId) {
        setActiveOfferId(null);
        setShowOfferDetailOnMobile(false);
        setMobileNavHidden(false);
      }
    } catch (error) {
      console.error('Error performing offer action:', error);
    } finally {
      setLoadingOfferId(null);
      setLoadingAction(null);
    }
  };

  const handleCounterOfferClick = async (offerId: string) => {
    // Fetch the offer details first
    setLoadingOfferId(offerId);
    setLoadingAction('counter');
    
    try {
      const response = await fetch(`/api/offers/${offerId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedOfferForCounter(data.offer);
        setCounterOfferModalOpen(true);
      }
    } catch (error) {
      console.error('Error fetching offer:', error);
    } finally {
      setLoadingOfferId(null);
      setLoadingAction(null);
    }
  };

  const handleCounterOfferDetail = () => {
    if (activeOffer) {
      setSelectedOfferForCounter(activeOffer);
      setCounterOfferModalOpen(true);
    }
  };

  const handleSubmitCounterOffer = async (amount: number, message?: string) => {
    if (!selectedOfferForCounter) return;
    try {
      await counterOffer(selectedOfferForCounter.id, { newAmount: amount, message });
      setCounterOfferModalOpen(false);
      setSelectedOfferForCounter(null);
    } catch (error) {
      console.error('Error countering offer:', error);
      throw error;
    }
  };

  const handleCancelOfferClick = async (offerId: string) => {
    // Fetch the offer details first
    setLoadingOfferId(offerId);
    setLoadingAction('cancel');
    
    try {
      const response = await fetch(`/api/offers/${offerId}`);
      if (response.ok) {
        const data = await response.json();
        setOfferToConfirm(data.offer);
        setConfirmationAction('cancel');
        setConfirmationDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching offer:', error);
    } finally {
      setLoadingOfferId(null);
      setLoadingAction(null);
    }
  };
  
  // Handler for detail card (already has offer loaded)
  const handleAcceptOfferDetail = async () => {
    if (!activeOffer) return;
    setOfferToConfirm(activeOffer);
    setConfirmationAction('accept');
    setConfirmationDialogOpen(true);
  };

  const handleRejectOfferDetail = async () => {
    if (!activeOffer) return;
    setOfferToConfirm(activeOffer);
    setConfirmationAction('reject');
    setConfirmationDialogOpen(true);
  };

  const handleCancelOfferDetail = async () => {
    if (!activeOffer) return;
    setOfferToConfirm(activeOffer);
    setConfirmationAction('cancel');
    setConfirmationDialogOpen(true);
  };

  const handleTabChange = (tab: 'messages' | 'offers') => {
    setActiveTab(tab);
    setActiveConversationId(null);
    setActiveOfferId(null);
    setShowConversationOnMobile(false);
    setShowOfferDetailOnMobile(false);
    setMobileNavHidden(false);
    
    // Update URL
    const params = new URLSearchParams();
    params.set('tab', tab);
    router.push(`/messages?${params.toString()}`);
  };

  const otherParticipant = conversation?.participants?.find(
    (p) => p.user_id !== user?.id
  );

  return (
    <>
      {/* Desktop: Marketplace Header */}
      <div className="hidden lg:block">
        <MarketplaceHeader />
      </div>

      {/* Desktop: Marketplace Sidebar */}
      <div className="hidden lg:block">
        <MarketplaceSidebar />
      </div>

      <div className={cn(
        "w-full max-w-full overflow-hidden bg-gray-50",
        "lg:pt-16", // Account for fixed header on desktop
        isCollapsed ? "lg:pl-[56px]" : "lg:pl-[200px]" // Account for sidebar on desktop
      )}>
        <div className="flex h-[100dvh] lg:h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden w-full max-w-full">
        {/* Left Sidebar: Conversation List or Offers List */}
        <div
          className={cn(
            'w-full md:w-96 bg-white md:border-r border-gray-200 flex flex-col h-full pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0',
            (showConversationOnMobile || showOfferDetailOnMobile) && 'hidden md:flex'
          )}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
            {/* Mobile: Back to Marketplace Button */}
            <div className="lg:hidden mb-3">
              <button
                onClick={handleBackToMarketplace}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Marketplace
              </button>
            </div>
          {/* Main Tab Navigation */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit mb-3">
            <button
              onClick={() => handleTabChange('messages')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors relative',
                activeTab === 'messages'
                  ? 'text-gray-800 bg-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200/70'
              )}
            >
              <MessageCircle size={15} />
              Messages
              {unreadCounts.messages > 0 && (
                <span className="ml-1 h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                  {unreadCounts.messages > 99 ? '99+' : unreadCounts.messages}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('offers')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors relative',
                activeTab === 'offers'
                  ? 'text-gray-800 bg-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200/70'
              )}
            >
              <Tag size={15} />
              Offers
              {unreadCounts.offers > 0 && (
                <span className="ml-1 h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                  {unreadCounts.offers > 99 ? '99+' : unreadCounts.offers}
                </span>
              )}
            </button>
          </div>
          
          {/* Sub Tabs - Different per main tab */}
          {activeTab === 'messages' ? (
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
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
          ) : (
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
              <button
                onClick={() => setOfferRole('buyer')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                  offerRole === 'buyer'
                    ? 'text-gray-800 bg-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200/70'
                )}
              >
                Sent
              </button>
              <button
                onClick={() => setOfferRole('seller')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                  offerRole === 'seller'
                    ? 'text-gray-800 bg-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200/70'
                )}
              >
                Received
              </button>
            </div>
          )}
        </div>

        {/* Content - Either Conversations or Offers */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'messages' ? (
            // Messages View
            loadingList ? (
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
            )
          ) : (
            // Offers View
            <OffersList
              role={offerRole}
              statusFilter={offerStatusFilter}
              onOfferClick={handleOfferClick}
              onAccept={handleAcceptOfferClick}
              onReject={handleRejectOfferClick}
              onCounter={handleCounterOfferClick}
              onCancel={handleCancelOfferClick}
              loadingOfferId={loadingOfferId}
              loadingAction={loadingAction}
            />
          )}
        </div>
      </div>

      {/* Right Panel: Active Conversation or Offer Detail */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-white h-full w-full md:w-auto overflow-hidden fixed inset-0 md:static md:inset-auto z-20',
          !(showConversationOnMobile || showOfferDetailOnMobile) && 'hidden md:flex'
        )}
      >
        {activeTab === 'messages' && activeConversationId && conversation ? (
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
        ) : activeTab === 'offers' && activeOfferId && activeOffer ? (
          <>
            {/* Offer Detail Header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 flex-shrink-0 bg-white w-full">
              {/* Back button on mobile */}
              <button
                onClick={handleBackToList}
                className="md:hidden p-2 hover:bg-gray-100 active:bg-gray-200 rounded-full flex-shrink-0"
                aria-label="Back to offers"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700" />
              </button>

              <div className="flex-1">
                <h3 className="font-semibold text-sm text-gray-900">
                  Offer Details
                </h3>
              </div>
            </div>

            {/* Offer Detail Content */}
            {loadingActiveOffer ? (
              <div className="flex items-center justify-center h-full">
                <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <OfferDetailCard
                offer={activeOffer}
                role={offerRole}
                onAccept={handleAcceptOfferDetail}
                onReject={handleRejectOfferDetail}
                onCounter={handleCounterOfferDetail}
                onCancel={handleCancelOfferDetail}
                onMessage={() => {
                  // TODO: Navigate to create conversation with the other party
                }}
                accepting={accepting}
                rejecting={rejecting}
                countering={countering}
                cancelling={cancelling}
              />
            )}
          </>
        ) : activeTab === 'offers' && activeOfferId && loadingActiveOffer ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 px-4 py-12">
            <div className="text-center">
              {activeTab === 'messages' ? (
                <>
                  <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">Select a conversation</p>
                  <p className="text-sm mt-1 text-gray-600">Choose a conversation to start messaging</p>
                </>
              ) : (
                <>
                  <Tag className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">Select an offer</p>
                  <p className="text-sm mt-1 text-gray-600">Choose an offer to view details</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Counter Offer Modal */}
      {selectedOfferForCounter && (
        <CounterOfferModal
          offer={selectedOfferForCounter}
          isOpen={counterOfferModalOpen}
          onClose={() => {
            setCounterOfferModalOpen(false);
            setSelectedOfferForCounter(null);
          }}
          onSubmit={handleSubmitCounterOffer}
        />
      )}

      {/* Confirmation Dialog */}
      {offerToConfirm && (
        <OfferConfirmationDialog
          isOpen={confirmationDialogOpen}
          onClose={() => {
            setConfirmationDialogOpen(false);
            setOfferToConfirm(null);
          }}
          onConfirm={confirmOfferAction}
          offer={offerToConfirm}
          action={confirmationAction}
          loading={loadingOfferId === offerToConfirm.id}
        />
      )}
      </div>
      </div>
    </>
  );
}

// Wrap with provider for sidebar state
function MessagesPageContent() {
  return (
    <SidebarStateProvider>
      <MessagesPageInner />
    </SidebarStateProvider>
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


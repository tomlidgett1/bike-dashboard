'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { useMessages } from '@/components/providers/messages-provider';
import { useConversations } from '@/lib/hooks/use-conversations';
import { useConversation } from '@/lib/hooks/use-conversation';
import {
  useAcceptOffer,
  useRejectOffer,
  useCounterOffer,
  useCancelOffer,
  useOffer,
} from '@/lib/hooks/use-offers';
import { useCombinedUnreadCount } from '@/lib/hooks/use-combined-unread-count';
import { ConversationListItem } from './conversation-list-item';
import { MessageThread } from './message-thread';
import { MessageComposer } from './message-composer';
import { OffersList } from '@/components/offers/offers-list';
import { OfferDetailCard } from '@/components/offers/offer-detail-card';
import { CounterOfferModal } from '@/components/offers/counter-offer-modal';
import { OfferConfirmationDialog } from '@/components/offers/offer-confirmation-dialog';
import {
  Archive,
  X,
  Maximize2,
  Minimize2,
  MessageCircle,
  Tag,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import type { EnrichedOffer, OfferRole, OfferStatus } from '@/lib/types/offer';

export function MessagesPanel() {
  const { user } = useAuth();
  const {
    isOpen,
    isExpanded,
    close,
    toggleExpand,
    requestedConversationId,
    clearRequestedConversation,
    requestedTab,
    clearRequestedTab,
  } = useMessages();

  const { counts: unreadCounts } = useCombinedUnreadCount(user ? 30000 : 0);

  const [activeTab, setActiveTab] = useState<'messages' | 'offers'>('messages');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [activeOfferId, setActiveOfferId] = useState<string | null>(null);
  const [offerRole, setOfferRole] = useState<OfferRole | 'all'>('all');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [offerStatusFilter] = useState<OfferStatus | undefined>();
  const [counterOfferModalOpen, setCounterOfferModalOpen] = useState(false);
  const [selectedOfferForCounter, setSelectedOfferForCounter] = useState<EnrichedOffer | null>(null);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<'accept' | 'reject' | 'cancel'>('accept');
  const [offerToConfirm, setOfferToConfirm] = useState<EnrichedOffer | null>(null);
  const [loadingOfferId, setLoadingOfferId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    'accept' | 'reject' | 'counter' | 'cancel' | undefined
  >();

  const { acceptOffer, accepting } = useAcceptOffer();
  const { rejectOffer, rejecting } = useRejectOffer();
  const { counterOffer, countering } = useCounterOffer();
  const { cancelOffer, cancelling } = useCancelOffer();
  const { offer: activeOffer, loading: loadingActiveOffer } = useOffer(activeOfferId);

  const { conversations, loading: loadingList, refresh: refreshList } = useConversations(
    1,
    50,
    showArchived,
  );
  const {
    conversation,
    loading: loadingConversation,
    sendMessage,
    sendingMessage,
    archiveConversation,
  } = useConversation(activeConversationId);

  // Apply requested conversation from provider (e.g. notification click)
  useEffect(() => {
    if (requestedConversationId && isOpen) {
      setActiveConversationId(requestedConversationId);
      setActiveTab('messages');
      clearRequestedConversation();
    }
  }, [requestedConversationId, isOpen, clearRequestedConversation]);

  // Apply requested tab from provider (e.g. after sending an offer)
  useEffect(() => {
    if (requestedTab && isOpen) {
      setActiveTab(requestedTab);
      setActiveConversationId(null);
      setActiveOfferId(null);
      clearRequestedTab();
    }
  }, [requestedTab, isOpen, clearRequestedTab]);

  // Auto-select the most recent conversation when the panel opens with no
  // specific conversation requested and nothing already selected.
  useEffect(() => {
    if (
      isOpen &&
      activeTab === 'messages' &&
      !requestedConversationId &&
      !activeConversationId &&
      conversations.length > 0 &&
      !loadingList
    ) {
      setActiveConversationId(conversations[0].id);
    }
  }, [isOpen, activeTab, requestedConversationId, activeConversationId, conversations, loadingList]);

  // Escape key closes panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    await sendMessage(content, attachments);
    refreshList();
  };

  const handleArchive = async () => {
    if (!activeConversationId) return;
    await archiveConversation(!showArchived);
    setActiveConversationId(null);
    refreshList();
  };

  const handleTabChange = (tab: 'messages' | 'offers') => {
    setActiveTab(tab);
    setActiveConversationId(null);
    setActiveOfferId(null);
  };

  const fetchOfferForAction = async (
    offerId: string,
    action: 'accept' | 'reject' | 'counter' | 'cancel',
    onSuccess: (offer: EnrichedOffer) => void,
  ) => {
    setLoadingOfferId(offerId);
    setLoadingAction(action);
    try {
      const res = await fetch(`/api/offers/${offerId}`);
      if (res.ok) {
        const data = await res.json();
        onSuccess(data.offer);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOfferId(null);
      setLoadingAction(undefined);
    }
  };

  const handleAcceptOfferClick = (offerId: string) =>
    fetchOfferForAction(offerId, 'accept', (offer) => {
      setOfferToConfirm(offer);
      setConfirmationAction('accept');
      setConfirmationDialogOpen(true);
    });

  const handleRejectOfferClick = (offerId: string) =>
    fetchOfferForAction(offerId, 'reject', (offer) => {
      setOfferToConfirm(offer);
      setConfirmationAction('reject');
      setConfirmationDialogOpen(true);
    });

  const handleCounterOfferClick = (offerId: string) =>
    fetchOfferForAction(offerId, 'counter', (offer) => {
      setSelectedOfferForCounter(offer);
      setCounterOfferModalOpen(true);
    });

  const handleCancelOfferClick = (offerId: string) =>
    fetchOfferForAction(offerId, 'cancel', (offer) => {
      setOfferToConfirm(offer);
      setConfirmationAction('cancel');
      setConfirmationDialogOpen(true);
    });

  const confirmOfferAction = async () => {
    if (!offerToConfirm) return;
    setLoadingOfferId(offerToConfirm.id);
    setLoadingAction(confirmationAction);
    try {
      if (confirmationAction === 'accept') await acceptOffer(offerToConfirm.id);
      else if (confirmationAction === 'reject') await rejectOffer(offerToConfirm.id);
      else if (confirmationAction === 'cancel') await cancelOffer(offerToConfirm.id);
      setConfirmationDialogOpen(false);
      setOfferToConfirm(null);
      if (offerToConfirm.id === activeOfferId) setActiveOfferId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOfferId(null);
      setLoadingAction(undefined);
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
      console.error(error);
      throw error;
    }
  };

  const activeConvData = conversations.find(c => c.id === activeConversationId);

  const showConversationThread =
    activeTab === 'messages' && activeConversationId && conversation;
  const showOfferDetail =
    activeTab === 'offers' && activeOfferId && activeOffer;
  const showDetailLoading =
    (activeTab === 'messages' && activeConversationId && loadingConversation) ||
    (activeTab === 'offers' && activeOfferId && loadingActiveOffer);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(0,0,0,0.18)',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.25s ease',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        onClick={close}
      />

      {/* Panel — desktop only */}
      <div
        className={cn(
          'fixed right-3 top-[1.5%] z-50 flex-col',
          'rounded-2xl overflow-hidden',
          'shadow-2xl shadow-black/15 border border-border/50 bg-background',
          'hidden lg:flex',
        )}
        style={{
          height: '97vh',
          width: isExpanded ? 'calc(100vw - 24px)' : '860px',
          maxWidth: 'calc(100vw - 24px)',
          transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% + 24px))',
          transition: [
            'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)',
            'width 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          ].join(', '),
          willChange: 'transform',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* ── Header: title row ──────────────────────────────── */}
        <div className="flex items-center justify-between px-4 h-11 flex-shrink-0">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">Inbox</h2>
          <div className="flex items-center gap-0.5">
            <button
              onClick={toggleExpand}
              className="h-7 w-7 rounded-lg hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
            >
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={close}
              className="h-7 w-7 rounded-lg hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Close inbox"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Header: tab row ────────────────────────────────── */}
        <div className="flex items-end border-b border-border/60 px-4 flex-shrink-0">
          {(['messages', 'offers'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const count = tab === 'messages' ? unreadCounts.messages : unreadCounts.offers;
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={cn(
                  'flex items-center gap-2 pb-2.5 pt-1 mr-6 text-sm font-medium border-b-2 transition-all relative',
                  isActive
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                {tab === 'messages' ? <MessageCircle size={14} /> : <Tag size={14} />}
                {tab === 'messages' ? 'Messages' : 'Offers'}
                {count > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left: List column */}
          <div className="w-[300px] flex-shrink-0 border-r border-border/50 flex flex-col bg-muted/[0.15]">

            {/* Sub-filter */}
            <div className="px-3 py-2 border-b border-border/40 flex-shrink-0">
              {activeTab === 'messages' ? (
                <div className="flex items-center bg-muted/60 p-0.5 rounded-md">
                  {(['Active', 'Archived'] as const).map((label) => {
                    const isArchived = label === 'Archived';
                    const active = showArchived === isArchived;
                    return (
                      <button
                        key={label}
                        onClick={() => setShowArchived(isArchived)}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                          active
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center bg-muted/60 p-0.5 rounded-md">
                  {(['all', 'buyer', 'seller'] as const).map((r) => {
                    const label = r === 'all' ? 'All' : r === 'buyer' ? 'Sent' : 'Received';
                    return (
                      <button
                        key={r}
                        onClick={() => setOfferRole(r)}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                          offerRole === r
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'messages' ? (
                loadingList ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full px-5 py-10 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                      <MessageCircle className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {showArchived ? 'No archived messages' : 'No messages yet'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {showArchived
                        ? 'Archived conversations appear here'
                        : 'Messages from the marketplace appear here'}
                    </p>
                  </div>
                ) : (
                  <>
                    {!showArchived && unreadCounts.messages > 0 && (
                      <div className="sticky top-0 z-10 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40 px-3 py-1.5 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                          {unreadCounts.messages} unread
                        </span>
                      </div>
                    )}
                    {conversations.map((conv) => (
                      <ConversationListItem
                        key={conv.id}
                        conversation={conv}
                        active={conv.id === activeConversationId}
                        onClick={() => setActiveConversationId(conv.id)}
                      />
                    ))}
                  </>
                )
              ) : (
                <OffersList
                  role={offerRole === 'all' ? undefined : offerRole}
                  statusFilter={offerStatusFilter}
                  onOfferClick={(id) => setActiveOfferId(id)}
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

          {/* Right: Detail column */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-background">
            {showConversationThread ? (
              <>
                {/* Conversation header */}
                <div className="px-4 h-[52px] border-b border-border/50 flex items-center gap-3 flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0 select-none">
                    {(
                      activeConvData?.other_participants[0]?.business_name?.[0] ||
                      activeConvData?.other_participants[0]?.name?.[0] ||
                      '?'
                    ).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-foreground truncate">
                      {activeConvData?.other_participants[0]?.business_name ||
                        activeConvData?.other_participants[0]?.name ||
                        'Unknown User'}
                    </p>
                  </div>
                  <button
                    onClick={handleArchive}
                    className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    title={showArchived ? 'Unarchive conversation' : 'Archive conversation'}
                  >
                    <Archive className="h-[14px] w-[14px]" />
                  </button>
                </div>

                {/* Product context card */}
                {conversation.product && (
                  <div className="mx-4 mt-2.5 mb-1 p-2.5 bg-muted/40 border border-border/40 rounded-xl flex items-center gap-2.5 flex-shrink-0">
                    {conversation.product.primary_image_url && (
                      <div className="w-9 h-9 rounded-lg overflow-hidden border border-border/50 flex-shrink-0 bg-muted">
                        <Image
                          src={conversation.product.primary_image_url}
                          alt={
                            conversation.product.display_name ||
                            conversation.product.description
                          }
                          width={36}
                          height={36}
                          className="object-cover w-full h-full"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate text-xs leading-tight">
                        {conversation.product.display_name || conversation.product.description}
                      </p>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                        ${conversation.product.price?.toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Messages */}
                {loadingConversation ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <MessageThread
                    messages={conversation.messages}
                    currentUserId={user?.id || ''}
                    className="flex-1 overflow-y-auto"
                  />
                )}

                {/* Composer */}
                <div className="px-4 pt-2 pb-3 border-t border-border/50 flex-shrink-0">
                  <MessageComposer
                    conversationId={activeConversationId}
                    onSend={handleSendMessage}
                    disabled={sendingMessage}
                  />
                </div>
              </>
            ) : showOfferDetail ? (
              <>
                <div className="px-4 h-[52px] border-b border-border/50 flex items-center gap-2.5 flex-shrink-0">
                  <button
                    onClick={() => setActiveOfferId(null)}
                    className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Back to offers list"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <p className="font-semibold text-sm text-foreground">Offer Details</p>
                </div>
                {loadingActiveOffer ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <OfferDetailCard
                    offer={activeOffer}
                    role={activeOffer.buyer_id === user?.id ? 'buyer' : 'seller'}
                    onAccept={() => {
                      setOfferToConfirm(activeOffer);
                      setConfirmationAction('accept');
                      setConfirmationDialogOpen(true);
                    }}
                    onReject={() => {
                      setOfferToConfirm(activeOffer);
                      setConfirmationAction('reject');
                      setConfirmationDialogOpen(true);
                    }}
                    onCounter={handleCounterOfferDetail}
                    onCancel={() => {
                      setOfferToConfirm(activeOffer);
                      setConfirmationAction('cancel');
                      setConfirmationDialogOpen(true);
                    }}
                    onMessage={() => {}}
                    accepting={accepting}
                    rejecting={rejecting}
                    countering={countering}
                    cancelling={cancelling}
                  />
                )}
              </>
            ) : showDetailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              /* Empty state */
              <div className="flex-1 flex items-center justify-center px-8">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
                    {activeTab === 'messages' ? (
                      <MessageCircle className="h-7 w-7 text-muted-foreground" />
                    ) : (
                      <Tag className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <p className="font-semibold text-sm text-foreground mb-1">
                    {activeTab === 'messages' ? 'Select a conversation' : 'Select an offer'}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px] mx-auto">
                    {activeTab === 'messages'
                      ? 'Choose a conversation from the list to start reading'
                      : 'Choose an offer from the list to view its details'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
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
          role={offerToConfirm.buyer_id === user?.id ? 'buyer' : 'seller'}
        />
      )}
    </>
  );
}

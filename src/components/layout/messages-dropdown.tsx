'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatRound, Letter } from '@/components/layout/app-sidebar/sidebar-icons';
import { useCombinedUnreadCount } from '@/lib/hooks/use-combined-unread-count';
import { useNotifications } from '@/lib/hooks/use-notifications';
import { useMessages } from '@/components/providers/messages-provider';
import { useNestNotificationsContext } from '@/components/providers/nest-notifications-provider';
import { isNestConversationUnread } from '@/lib/nest/conversation-read-state';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { topbarIconButtonClass } from '@/components/layout/topbar-nav-pills';
import {
  StoreHeaderDropdownBody,
  StoreHeaderDropdownEmpty,
  StoreHeaderDropdownFooter,
  StoreHeaderDropdownFooterAction,
  StoreHeaderDropdownHeader,
  StoreHeaderDropdownItem,
  MessageSourceAvatar,
  storeHeaderDropdownContentClass,
  useStoreHeaderDropdownStyle,
} from '@/components/layout/store-header-dropdown-panel';

const MAX_INBOX_ITEMS = 10;

type UnifiedInboxItem =
  | {
      source: 'marketplace';
      id: string;
      notificationId: string;
      conversationId: string;
      displayName: string;
      preview: string;
      receivedAt: string;
      isRead: boolean;
    }
  | {
      source: 'nest';
      id: string;
      chatId: string;
      displayName: string;
      preview: string;
      receivedAt: string;
    };

function formatBadgeCount(count: number) {
  return count > 99 ? '99+' : count;
}

export function MessagesDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const useStoreStyle = useStoreHeaderDropdownStyle();
  const { counts, refresh: refreshCount } = useCombinedUnreadCount();
  const { notifications, markAsRead } = useNotifications(5, true, open);
  const { openConversation } = useMessages();
  const {
    configured: nestConfigured,
    chats: nestChats,
    notifications: nestNotifications,
    unreadCount: nestUnreadCount,
    markNotificationRead,
    markAllRead: markAllNestRead,
    refresh: refreshNest,
  } = useNestNotificationsContext();

  const combinedCount = counts.messages + (nestConfigured ? nestUnreadCount : 0);

  const inboxItems = useMemo<UnifiedInboxItem[]>(() => {
    const marketplaceItems: UnifiedInboxItem[] = notifications.map((notification) => ({
      source: 'marketplace',
      id: `marketplace:${notification.id}`,
      notificationId: notification.id,
      conversationId: notification.conversation_id,
      displayName:
        notification.sender?.business_name || notification.sender?.name || 'Someone',
      preview: notification.message?.content || 'Sent you a message',
      receivedAt: notification.created_at,
      isRead: notification.is_read,
    }));

    if (!nestConfigured) {
      return marketplaceItems
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        .slice(0, MAX_INBOX_ITEMS);
    }

    const unreadNestChats = nestChats.filter(isNestConversationUnread).slice(0, 10);
    const nestItems: UnifiedInboxItem[] =
      nestNotifications.length > 0
        ? nestNotifications.map((notification) => ({
            source: 'nest',
            id: `nest:${notification.id}`,
            chatId: notification.chatId,
            displayName: notification.displayName,
            preview: notification.preview,
            receivedAt: notification.receivedAt,
          }))
        : unreadNestChats.map((chat) => ({
            source: 'nest',
            id: `nest:${chat.chatId}`,
            chatId: chat.chatId,
            displayName:
              chat.displayName || chat.title || chat.participantHandle || chat.chatId,
            preview: chat.preview || 'Unread message',
            receivedAt: chat.lastCustomerMessageAt || chat.lastMessageAt || new Date(0).toISOString(),
          }));

    return [...marketplaceItems, ...nestItems]
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
      .slice(0, MAX_INBOX_ITEMS);
  }, [notifications, nestConfigured, nestNotifications, nestChats]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && nestConfigured) {
      refreshNest();
    }
  };

  const handleMarketplaceClick = async (notificationId: string, conversationId: string) => {
    setOpen(false);
    await markAsRead(notificationId);
    openConversation(conversationId);
    refreshCount();
  };

  const handleNestClick = (chatId: string) => {
    markNotificationRead(chatId);
    setOpen(false);
    router.push(`/settings/store/nest?chatId=${encodeURIComponent(chatId)}`);
  };

  const handleItemClick = (item: UnifiedInboxItem) => {
    if (item.source === 'marketplace') {
      void handleMarketplaceClick(item.notificationId, item.conversationId);
      return;
    }
    handleNestClick(item.chatId);
  };

  const handleOpenCustomerEnquiries = () => {
    setOpen(false);
    router.push('/settings/store/customer-inquiries');
  };

  const renderInboxItemContent = (item: UnifiedInboxItem, compact = false) => {
    const isUnread = item.source === 'marketplace' ? !item.isRead : true;
    const sourceLabel = item.source === 'nest' ? 'Nest' : 'Marketplace';

    return (
      <div className="flex items-start gap-3">
        <MessageSourceAvatar source={item.source} compact={compact} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                'truncate font-medium',
                compact ? 'text-xs text-gray-900 sm:text-sm' : 'text-sm text-gray-800',
              )}
            >
              {item.displayName}
            </p>
            {nestConfigured ? (
              <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {sourceLabel}
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              'mt-0.5 line-clamp-2 text-xs',
              compact ? 'text-gray-600' : 'text-gray-500',
            )}
          >
            {item.preview}
          </p>
          <p className={cn('mt-1 text-xs', compact ? 'text-gray-500 sm:mt-1' : 'text-gray-400')}>
            {formatDistanceToNow(new Date(item.receivedAt), { addSuffix: true })}
          </p>
        </div>
        {isUnread ? (
          <div
            className={cn(
              'mt-1 h-2 w-2 shrink-0 rounded-full',
              useStoreStyle || compact ? 'bg-gray-800' : 'bg-blue-500',
            )}
          />
        ) : null}
      </div>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button className={topbarIconButtonClass} aria-label="Messages">
          <ChatRound className="size-4" />
          {combinedCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
              {formatBadgeCount(combinedCount)}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className={cn(
          useStoreStyle ? storeHeaderDropdownContentClass : 'w-[calc(100vw-2rem)] max-w-96',
        )}
      >
        {useStoreStyle ? (
          <StoreHeaderDropdownHeader
            title="Messages"
            actions={
              nestConfigured && nestUnreadCount > 0 ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    markAllNestRead();
                  }}
                  className="text-xs font-medium text-gray-500 transition hover:text-gray-800"
                >
                  Mark all read
                </button>
              ) : null
            }
            subtitle={
              combinedCount > 0 ? (
                <p className="mt-1 text-xs text-gray-500">{combinedCount} unread</p>
              ) : null
            }
          />
        ) : (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Messages</span>
                {combinedCount > 0 ? (
                  <span className="text-xs text-gray-600">{combinedCount} unread</span>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}

        {useStoreStyle ? (
          <StoreHeaderDropdownBody>
            {inboxItems.length === 0 ? (
              <StoreHeaderDropdownEmpty icon={Letter} message="No new messages" />
            ) : (
              inboxItems.map((item) => (
                <StoreHeaderDropdownItem
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    item.source === 'marketplace' && !item.isRead && 'bg-gray-50',
                  )}
                >
                  {renderInboxItemContent(item)}
                </StoreHeaderDropdownItem>
              ))
            )}
          </StoreHeaderDropdownBody>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto sm:max-h-[400px]">
            {inboxItems.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-500 sm:p-4 sm:text-sm">
                <Letter className="mx-auto mb-2 h-7 w-7 text-gray-400 sm:h-8 sm:w-8" />
                <p>No new messages</p>
              </div>
            ) : (
              <div className="space-y-1">
                {inboxItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      'w-full border-b border-gray-100 p-2.5 text-left transition-colors last:border-0 hover:bg-gray-50 sm:p-3',
                      item.source === 'marketplace' && !item.isRead && 'bg-blue-50/50',
                    )}
                  >
                    {renderInboxItemContent(item, true)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {useStoreStyle ? (
          <StoreHeaderDropdownFooter>
            <StoreHeaderDropdownFooterAction onClick={handleOpenCustomerEnquiries}>
              View customer enquiries
            </StoreHeaderDropdownFooterAction>
          </StoreHeaderDropdownFooter>
        ) : (
          <>
            <DropdownMenuSeparator />
            <div className="p-1.5 sm:p-2">
              <Button
                variant="ghost"
                className="w-full rounded-md text-xs sm:text-sm"
                onClick={handleOpenCustomerEnquiries}
              >
                View customer enquiries
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

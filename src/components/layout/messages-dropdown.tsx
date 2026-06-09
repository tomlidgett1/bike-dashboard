'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageCircle, Mail } from 'lucide-react';
import { useCombinedUnreadCount } from '@/lib/hooks/use-combined-unread-count';
import { useNotifications } from '@/lib/hooks/use-notifications';
import { useMessages } from '@/components/providers/messages-provider';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  StoreHeaderDropdownBody,
  StoreHeaderDropdownEmpty,
  StoreHeaderDropdownFooter,
  StoreHeaderDropdownFooterAction,
  StoreHeaderDropdownHeader,
  StoreHeaderDropdownItem,
  storeHeaderDropdownContentClass,
  useStoreHeaderDropdownStyle,
} from '@/components/layout/store-header-dropdown-panel';

export function MessagesDropdown() {
  const [open, setOpen] = useState(false);
  const useStoreStyle = useStoreHeaderDropdownStyle();
  const { counts, refresh: refreshCount } = useCombinedUnreadCount();
  const count = counts.messages;
  const { notifications, markAsRead } = useNotifications(5, true, open);
  const { open: openPanel, openConversation } = useMessages();

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
  };

  const handleNotificationClick = async (notificationId: string, conversationId: string) => {
    setOpen(false);
    await markAsRead(notificationId);
    openConversation(conversationId);
    refreshCount();
  };

  const handleViewAll = () => {
    setOpen(false);
    openPanel();
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground cursor-pointer"
          aria-label="Messages"
        >
          <MessageCircle className="size-4 stroke-[1.75]" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className={cn(
          useStoreStyle
            ? storeHeaderDropdownContentClass
            : 'w-[calc(100vw-2rem)] max-w-96',
        )}
      >
        {useStoreStyle ? (
          <StoreHeaderDropdownHeader
            title="Messages"
            subtitle={
              count > 0 ? (
                <p className="mt-1 text-xs text-gray-500">{count} unread</p>
              ) : null
            }
          />
        ) : (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Messages</span>
                {count > 0 && (
                  <span className="text-xs text-gray-600">{count} unread</span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}

        {useStoreStyle ? (
          <StoreHeaderDropdownBody>
            {notifications.length === 0 ? (
              <StoreHeaderDropdownEmpty icon={Mail} message="No new messages" />
            ) : (
              notifications.map((notification) => (
                <StoreHeaderDropdownItem
                  key={notification.id}
                  onClick={() =>
                    handleNotificationClick(notification.id, notification.conversation_id)
                  }
                  className={cn(!notification.is_read && 'bg-gray-50')}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                      {notification.sender?.name?.[0]?.toUpperCase() ||
                        notification.sender?.business_name?.[0]?.toUpperCase() ||
                        '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {notification.sender?.business_name ||
                          notification.sender?.name ||
                          'Someone'}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                        {notification.message?.content || 'Sent you a message'}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {!notification.is_read ? (
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gray-800" />
                    ) : null}
                  </div>
                </StoreHeaderDropdownItem>
              ))
            )}
          </StoreHeaderDropdownBody>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto sm:max-h-[400px]">
            {notifications.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-500 sm:p-4 sm:text-sm">
                <Mail className="mx-auto mb-2 h-7 w-7 text-gray-400 sm:h-8 sm:w-8" />
                <p>No new messages</p>
              </div>
            ) : (
              <div className="space-y-1">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() =>
                      handleNotificationClick(notification.id, notification.conversation_id)
                    }
                    className={cn(
                      'w-full border-b border-gray-100 p-2.5 text-left transition-colors last:border-0 hover:bg-gray-50 sm:p-3',
                      !notification.is_read && 'bg-blue-50/50',
                    )}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white sm:h-8 sm:w-8">
                        {notification.sender?.name?.[0]?.toUpperCase() ||
                          notification.sender?.business_name?.[0]?.toUpperCase() ||
                          '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-900 sm:text-sm">
                          {notification.sender?.business_name ||
                            notification.sender?.name ||
                            'Someone'}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                          {notification.message?.content || 'Sent you a message'}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 sm:mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      {!notification.is_read ? (
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {useStoreStyle ? (
          <StoreHeaderDropdownFooter>
            <StoreHeaderDropdownFooterAction onClick={handleViewAll}>
              Open Inbox
            </StoreHeaderDropdownFooterAction>
          </StoreHeaderDropdownFooter>
        ) : (
          <>
            <DropdownMenuSeparator />
            <div className="p-1.5 sm:p-2">
              <Button
                variant="ghost"
                className="w-full rounded-md text-xs sm:text-sm"
                onClick={handleViewAll}
              >
                Open Inbox
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

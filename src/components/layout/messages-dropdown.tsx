// ============================================================
// MESSAGES DROPDOWN COMPONENT
// ============================================================
// Header dropdown for viewing notifications and unread messages

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageCircle, Mail } from 'lucide-react';
import { useUnreadCount } from '@/lib/hooks/use-unread-count';
import { useNotifications } from '@/lib/hooks/use-notifications';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export function MessagesDropdown() {
  const router = useRouter();
  const { count, refresh: refreshCount } = useUnreadCount(30000); // Poll every 30s
  const { notifications, markAsRead } = useNotifications(5, true); // Latest 5 unread

  const handleNotificationClick = async (notificationId: string, conversationId: string) => {
    await markAsRead(notificationId);
    router.push(`/messages?conversation=${conversationId}`);
    refreshCount();
  };

  const handleViewAll = () => {
    router.push('/messages');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label="Messages"
        >
          <MessageCircle className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] max-w-96">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Messages</span>
            {count > 0 && (
              <span className="text-xs text-gray-600">
                {count} unread
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Notifications List */}
        <div className="max-h-[50vh] sm:max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-3 sm:p-4 text-center text-gray-500 text-xs sm:text-sm">
              <Mail className="h-7 w-7 sm:h-8 sm:w-8 mx-auto mb-2 text-gray-400" />
              <p>No new messages</p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() =>
                    handleNotificationClick(
                      notification.id,
                      notification.conversation_id
                    )
                  }
                  className={cn(
                    'w-full text-left p-2.5 sm:p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0',
                    !notification.is_read && 'bg-blue-50/50'
                  )}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium">
                      {notification.sender?.name?.[0]?.toUpperCase() ||
                        notification.sender?.business_name?.[0]?.toUpperCase() ||
                        '?'}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                        {notification.sender?.business_name ||
                          notification.sender?.name ||
                          'Someone'}
                      </p>
                      <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
                        {notification.message?.content || 'Sent you a message'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 sm:mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>

                    {/* Unread Indicator */}
                    {!notification.is_read && (
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* View All Button */}
        <div className="p-1.5 sm:p-2">
          <Button
            variant="ghost"
            className="w-full rounded-md text-xs sm:text-sm"
            onClick={handleViewAll}
          >
            View All Messages
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


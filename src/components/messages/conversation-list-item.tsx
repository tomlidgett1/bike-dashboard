// ============================================================
// CONVERSATION LIST ITEM COMPONENT
// ============================================================
// Single conversation item for inbox list
// Mobile-optimised with larger touch targets and clear unread indicators

'use client';

import { cn } from '@/lib/utils';
import type { ConversationListItem } from '@/lib/types/message';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';

interface ConversationListItemProps {
  conversation: ConversationListItem;
  active?: boolean;
  onClick: () => void;
}

export function ConversationListItem({
  conversation,
  active = false,
  onClick,
}: ConversationListItemProps) {
  const otherParticipant = conversation.other_participants[0];
  const displayName =
    otherParticipant?.business_name ||
    otherParticipant?.name ||
    'Unknown User';
  
  const hasUnread = conversation.unread_count > 0;
  const unreadCount = conversation.unread_count;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3.5 text-left border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors',
        active && 'bg-blue-50 hover:bg-blue-50 active:bg-blue-100',
        hasUnread && !active && 'bg-blue-50/30'
      )}
    >
      <div className="flex items-center gap-3">
        {/* Avatar or Product Image with unread indicator overlay */}
        <div className="relative flex-shrink-0">
          {conversation.product?.primary_image_url ? (
            <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
              <Image
                src={conversation.product.primary_image_url}
                alt={conversation.product.display_name || conversation.product.description}
                width={48}
                height={48}
                className="object-cover w-full h-full"
              />
            </div>
          ) : (
            <div
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-base',
                hasUnread ? 'bg-blue-600' : active ? 'bg-blue-600' : 'bg-gray-400'
              )}
            >
              {displayName[0]?.toUpperCase() || '?'}
            </div>
          )}
          
          {/* Unread dot indicator on avatar */}
          {hasUnread && (
            <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full border-2 border-white" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name + Timestamp */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className={cn(
              'text-[15px] text-gray-900 truncate',
              hasUnread ? 'font-bold' : 'font-medium'
            )}>
              {displayName}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn(
                'text-xs',
                hasUnread ? 'text-blue-600 font-semibold' : 'text-gray-500'
              )}>
                {formatDistanceToNow(new Date(conversation.last_message_at), {
                  addSuffix: false,
                })}
              </span>
            </div>
          </div>

          {/* Product Name - if exists */}
          {conversation.product && (
            <p className={cn(
              'text-xs truncate mb-0.5',
              hasUnread ? 'text-gray-700' : 'text-gray-500'
            )}>
              {conversation.product.display_name || conversation.product.description}
            </p>
          )}

          {/* Last Message Preview + Unread Badge */}
          <div className="flex items-center gap-2">
            {conversation.last_message && (
              <p className={cn(
                'text-sm truncate leading-snug flex-1',
                hasUnread ? 'text-gray-900 font-semibold' : 'text-gray-500'
              )}>
                {conversation.last_message.content}
              </p>
            )}
            
            {/* Unread Count Badge */}
            {hasUnread && (
              <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

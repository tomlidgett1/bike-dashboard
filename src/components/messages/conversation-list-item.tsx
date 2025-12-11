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

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-4 text-left border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors',
        active && 'bg-blue-50 hover:bg-blue-50 active:bg-blue-100'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Unread Indicator - Blue dot */}
        <div className="flex-shrink-0 w-2 pt-5">
          {hasUnread && (
            <div className="w-2 h-2 rounded-full bg-blue-500" />
          )}
        </div>

        {/* Avatar or Product Image */}
        <div className="flex-shrink-0">
          {conversation.product?.primary_image_url ? (
            <div className="w-12 h-12 rounded-md overflow-hidden border border-gray-200 bg-gray-100">
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
                active ? 'bg-blue-600' : 'bg-gray-500'
              )}
            >
              {displayName[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name + Timestamp */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className={cn(
              'text-[15px] text-gray-900 truncate',
              hasUnread ? 'font-semibold' : 'font-medium'
            )}>
              {displayName}
            </h3>
            <span className={cn(
              'text-xs flex-shrink-0',
              hasUnread ? 'text-blue-600 font-medium' : 'text-gray-500'
            )}>
              {formatDistanceToNow(new Date(conversation.last_message_at), {
                addSuffix: false,
              })}
            </span>
          </div>

          {/* Product Name - if exists */}
          {conversation.product && (
            <p className="text-xs text-gray-500 truncate mb-0.5">
              {conversation.product.display_name || conversation.product.description}
            </p>
          )}

          {/* Last Message Preview */}
          {conversation.last_message && (
            <p className={cn(
              'text-sm truncate leading-snug',
              hasUnread ? 'text-gray-900 font-medium' : 'text-gray-500'
            )}>
              {conversation.last_message.content}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

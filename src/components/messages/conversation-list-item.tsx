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
        'mb-1 w-full rounded-2xl px-3.5 py-3 text-left transition-all',
        active
          ? 'bg-gray-900 text-white shadow-sm'
          : 'text-gray-900 hover:bg-gray-50 active:bg-gray-100',
        hasUnread && !active && 'bg-[#FFC72C]/15 hover:bg-[#FFC72C]/20'
      )}
    >
      <div className="flex items-center gap-3">
        {/* Avatar or Product Image with unread indicator overlay */}
        <div className="relative flex-shrink-0">
          {conversation.product?.primary_image_url ? (
            <div
              className={cn(
                'h-12 w-12 overflow-hidden rounded-xl border bg-gray-100',
                active ? 'border-white/15' : 'border-gray-200',
              )}
            >
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
                'flex h-12 w-12 items-center justify-center rounded-full text-base font-bold',
                active
                  ? 'bg-white/15 text-white'
                  : hasUnread
                  ? 'bg-[#FFC72C] text-gray-900'
                  : 'bg-gray-100 text-gray-700'
              )}
            >
              {displayName[0]?.toUpperCase() || '?'}
            </div>
          )}
          
          {/* Unread dot indicator on avatar */}
          {hasUnread && (
            <div className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#FFC72C]" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name + Timestamp */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className={cn(
              'truncate text-[15px]',
              active ? 'text-white' : 'text-gray-900',
              hasUnread ? 'font-bold' : 'font-medium'
            )}>
              {displayName}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn(
                'text-xs',
                active
                  ? 'text-white/60'
                  : hasUnread
                  ? 'font-semibold text-gray-900'
                  : 'text-gray-500'
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
              active
                ? 'text-white/60'
                : hasUnread
                ? 'text-gray-700'
                : 'text-gray-500'
            )}>
              {conversation.product.display_name || conversation.product.description}
            </p>
          )}

          {/* Last Message Preview + Unread Badge */}
          <div className="flex items-center gap-2">
            {conversation.last_message && (
              <p className={cn(
                'text-sm truncate leading-snug flex-1',
                active
                  ? hasUnread
                    ? 'font-semibold text-white'
                    : 'text-white/70'
                  : hasUnread
                  ? 'font-semibold text-gray-900'
                  : 'text-gray-500'
              )}>
                {conversation.last_message.content}
              </p>
            )}
            
            {/* Unread Count Badge */}
            {hasUnread && (
              <span className="flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-[#FFC72C] px-1.5 text-xs font-bold text-gray-900">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

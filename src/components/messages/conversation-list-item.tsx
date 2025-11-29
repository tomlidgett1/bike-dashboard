// ============================================================
// CONVERSATION LIST ITEM COMPONENT
// ============================================================
// Single conversation item for inbox list

'use client';

import { cn } from '@/lib/utils';
import type { ConversationListItem } from '@/lib/types/message';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import { Package } from 'lucide-react';

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

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3 text-left border-b border-gray-200 hover:bg-gray-50 transition-colors',
        active && 'bg-blue-50 hover:bg-blue-50'
      )}
    >
      <div className="flex gap-3">
        {/* Avatar or Product Image */}
        <div className="flex-shrink-0">
          {conversation.product?.primary_image_url ? (
            <div className="w-12 h-12 rounded-md overflow-hidden border border-gray-200">
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
                'w-12 h-12 rounded-full flex items-center justify-center text-white font-medium',
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
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-semibold text-[15px] text-gray-900 truncate pr-2">
              {displayName}
            </h3>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {formatDistanceToNow(new Date(conversation.last_message_at), {
                addSuffix: false,
              })}
            </span>
          </div>

          {/* Subject/Product */}
          {conversation.product && (
            <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
              <Package className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">
                {conversation.product.display_name || conversation.product.description}
              </span>
            </div>
          )}

          {/* Last Message Preview */}
          {conversation.last_message && (
            <p className="text-sm text-gray-600 truncate">
              {conversation.last_message.content}
            </p>
          )}

          {/* Unread Badge */}
          {conversation.unread_count > 0 && (
            <div className="mt-2">
              <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium text-white bg-blue-500 rounded-full">
                {conversation.unread_count} unread
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}


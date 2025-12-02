// ============================================================
// MESSAGE THREAD COMPONENT
// ============================================================
// Scrollable message list with bubbles and attachments

'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageWithAttachments } from '@/lib/types/message';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

interface MessageThreadProps {
  messages: MessageWithAttachments[];
  currentUserId: string;
  className?: string;
}

export function MessageThread({
  messages,
  currentUserId,
  className,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Fetch signed URLs for attachments
  useEffect(() => {
    const fetchImageUrls = async () => {
      const supabase = createClient();
      const newUrls = new Map<string, string>();

      for (const message of messages) {
        for (const attachment of message.attachments || []) {
          if (!imageUrls.has(attachment.storage_path)) {
            const { data } = await supabase.storage
              .from('message-attachments')
              .createSignedUrl(attachment.storage_path, 3600); // 1 hour expiry

            if (data?.signedUrl) {
              newUrls.set(attachment.storage_path, data.signedUrl);
            }
          }
        }
      }

      if (newUrls.size > 0) {
        setImageUrls((prev) => new Map([...prev, ...newUrls]));
      }
    };

    fetchImageUrls();
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 px-4 py-8">
        <p className="text-[15px] text-center">No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        className={cn(
          'overflow-y-auto overflow-x-hidden w-full',
          className
        )}
      >
        <div className="px-4 py-4 space-y-3 w-full max-w-full">
        {messages.map((message, index) => {
          const isCurrentUser = message.sender_id === currentUserId;
          const showAvatar =
            index === 0 ||
            messages[index - 1].sender_id !== message.sender_id;

          return (
            <div
              key={message.id}
              className={cn(
                'flex gap-2 w-full max-w-full',
                isCurrentUser ? 'justify-end' : 'justify-start'
              )}
            >
              {/* Avatar - Only show for other users */}
              {!isCurrentUser && showAvatar && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold bg-gray-500">
                  {message.sender?.business_name?.[0]?.toUpperCase() ||
                    message.sender?.name?.[0]?.toUpperCase() ||
                    '?'}
                </div>
              )}
              {!isCurrentUser && !showAvatar && (
                <div className="w-7 flex-shrink-0" />
              )}

              {/* Message Bubble */}
              <div
                className={cn(
                  'flex flex-col max-w-[70%]',
                  isCurrentUser ? 'items-end' : 'items-start'
                )}
              >
                {/* Sender Name - Only for other users */}
                {showAvatar && !isCurrentUser && (
                  <span className="text-[11px] text-gray-500 mb-1 px-1">
                    {message.sender?.business_name ||
                      message.sender?.name ||
                      'Unknown'}
                  </span>
                )}

                {/* Content */}
                <div
                  className={cn(
                    'rounded-2xl px-3 py-2 break-words max-w-full',
                    isCurrentUser
                      ? 'bg-blue-500 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-900 rounded-bl-md'
                  )}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{message.content}</p>

                  {/* Attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-1.5 space-y-1.5 max-w-full">
                      {message.attachments.map((attachment) => {
                        const imageUrl = imageUrls.get(attachment.storage_path);
                        
                        return imageUrl ? (
                          <div
                            key={attachment.id}
                            className={cn(
                              "relative rounded-lg overflow-hidden cursor-pointer w-40 max-w-full",
                              isCurrentUser ? "border-2 border-white/30" : "border border-gray-200"
                            )}
                            onClick={() => setLightboxImage(imageUrl)}
                          >
                            <Image
                              src={imageUrl}
                              alt={attachment.file_name}
                              width={160}
                              height={120}
                              className="w-full h-auto"
                            />
                          </div>
                        ) : (
                          <div
                            key={attachment.id}
                            className="w-40 h-28 bg-gray-200 rounded-lg animate-pulse max-w-full"
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-gray-500 mt-1">
                  {formatDistanceToNow(new Date(message.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Lightbox for full-size images */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <Image
              src={lightboxImage}
              alt="Full size"
              width={1200}
              height={800}
              className="object-contain max-w-full max-h-full"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 text-white bg-black/60 rounded-full p-2.5 hover:bg-black/80 backdrop-blur-sm"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}


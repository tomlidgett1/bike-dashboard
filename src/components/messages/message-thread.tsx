// ============================================================
// MESSAGE THREAD COMPONENT
// ============================================================
// Scrollable message list with bubbles and attachments
// Mobile-optimised with wider bubbles and better grouping

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
      <div className="flex flex-col items-center justify-center h-full text-gray-500 px-6 py-12">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-base font-medium text-gray-900 text-center mb-1">No messages yet</p>
        <p className="text-sm text-gray-500 text-center">Start the conversation!</p>
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
        <div className="px-3 md:px-4 py-4 w-full max-w-full">
          {messages.map((message, index) => {
            const isCurrentUser = message.sender_id === currentUserId;
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
            
            // Group consecutive messages from the same sender
            const isFirstInGroup = !prevMessage || prevMessage.sender_id !== message.sender_id;
            const isLastInGroup = !nextMessage || nextMessage.sender_id !== message.sender_id;
            
            // Show timestamp only for last message in group
            const showTimestamp = isLastInGroup;

            return (
              <div
                key={message.id}
                className={cn(
                  'flex w-full max-w-full',
                  isCurrentUser ? 'justify-end' : 'justify-start',
                  // Tighter spacing for consecutive messages from same sender
                  isFirstInGroup ? 'mt-3 first:mt-0' : 'mt-1'
                )}
              >
                {/* Message Bubble */}
                <div
                  className={cn(
                    'flex flex-col',
                    // 85% width on mobile, 70% on larger screens
                    'max-w-[85%] md:max-w-[70%]',
                    isCurrentUser ? 'items-end' : 'items-start'
                  )}
                >
                  {/* Sender Name - Only for first message in group from other users */}
                  {isFirstInGroup && !isCurrentUser && (
                    <span className="text-xs text-gray-500 mb-1 px-1 font-medium">
                      {message.sender?.business_name ||
                        message.sender?.name ||
                        'Unknown'}
                    </span>
                  )}

                  {/* Content */}
                  <div
                    className={cn(
                      'px-3.5 py-2.5 break-words max-w-full',
                      isCurrentUser
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-900',
                      // Rounded corners based on position in group
                      isCurrentUser 
                        ? cn(
                            'rounded-2xl',
                            isFirstInGroup && isLastInGroup ? 'rounded-br-lg' : '',
                            isFirstInGroup && !isLastInGroup ? 'rounded-br-md' : '',
                            !isFirstInGroup && isLastInGroup ? 'rounded-tr-md rounded-br-lg' : '',
                            !isFirstInGroup && !isLastInGroup ? 'rounded-r-md' : ''
                          )
                        : cn(
                            'rounded-2xl',
                            isFirstInGroup && isLastInGroup ? 'rounded-bl-lg' : '',
                            isFirstInGroup && !isLastInGroup ? 'rounded-bl-md' : '',
                            !isFirstInGroup && isLastInGroup ? 'rounded-tl-md rounded-bl-lg' : '',
                            !isFirstInGroup && !isLastInGroup ? 'rounded-l-md' : ''
                          )
                    )}
                  >
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed break-words">{message.content}</p>

                    {/* Attachments */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-2 space-y-2 max-w-full">
                        {message.attachments.map((attachment) => {
                          const imageUrl = imageUrls.get(attachment.storage_path);
                          
                          return imageUrl ? (
                            <div
                              key={attachment.id}
                              className={cn(
                                "relative rounded-lg overflow-hidden cursor-pointer max-w-[200px]",
                                isCurrentUser ? "border-2 border-white/30" : "border border-gray-200"
                              )}
                              onClick={() => setLightboxImage(imageUrl)}
                            >
                              <Image
                                src={imageUrl}
                                alt={attachment.file_name}
                                width={200}
                                height={150}
                                className="w-full h-auto"
                              />
                            </div>
                          ) : (
                            <div
                              key={attachment.id}
                              className="w-[200px] h-[150px] bg-gray-200 rounded-lg animate-pulse max-w-full"
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Timestamp - Only show for last message in group */}
                  {showTimestamp && (
                    <span className={cn(
                      "text-[11px] text-gray-400 mt-1.5 px-1",
                      isCurrentUser ? "text-right" : "text-left"
                    )}>
                      {formatDistanceToNow(new Date(message.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lightbox for full-size images */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <Image
              src={lightboxImage}
              alt="Full size"
              width={1200}
              height={800}
              className="object-contain max-w-full max-h-full animate-in zoom-in-95 duration-300"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 text-white bg-black/60 rounded-full p-3 hover:bg-black/80 backdrop-blur-sm transition-colors"
              aria-label="Close image"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

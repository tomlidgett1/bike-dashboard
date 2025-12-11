// ============================================================
// PRODUCT INQUIRY BUTTON COMPONENT
// ============================================================
// Button to initiate a conversation about a product
// Features a world-class mobile bottom sheet experience

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/providers/auth-provider';
import { useAuthModal } from '@/components/providers/auth-modal-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { MessageCircle, Send, X, CheckCircle2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreateConversationRequest } from '@/lib/types/message';

interface ProductInquiryButtonProps {
  productId: string;
  productName: string;
  sellerId: string;
  sellerName?: string;
  productImage?: string | null;
  productPrice?: number;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

// Quick reply suggestions
const QUICK_REPLIES = [
  "Is this still available?",
  "What's the lowest you'll accept?",
  "Can I see more photos?",
  "Is pickup flexible?",
  "Any issues I should know about?",
];

export function ProductInquiryButton({
  productId,
  productName,
  sellerId,
  sellerName,
  productImage,
  productPrice,
  variant = 'default',
  size = 'default',
  fullWidth = false,
  className,
}: ProductInquiryButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationIdRef = useRef<string | null>(null);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current && !isMobile) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, isMobile]);

  const handleClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }

    if (user.id === sellerId) {
      return;
    }

    setIsOpen(true);
    setMessage('');
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    if (success && conversationIdRef.current) {
      router.push(`/messages?conversation=${conversationIdRef.current}`);
    }
    setIsOpen(false);
    setSuccess(false);
    setMessage('');
    setError(null);
  };

  const handleQuickReply = (text: string) => {
    setMessage(prev => {
      if (prev.trim()) {
        return prev + ' ' + text;
      }
      return text;
    });
    textareaRef.current?.focus();
  };

  const handleSendInquiry = async () => {
    if (!message.trim()) {
      setError('Please enter a message');
      return;
    }

    try {
      setSending(true);
      setError(null);

      const requestBody: CreateConversationRequest = {
        productId,
        recipientUserId: sellerId,
        initialMessage: message,
      };

      const response = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409 && data.conversationId) {
          conversationIdRef.current = data.conversationId;
          setSuccess(true);
          setTimeout(() => {
            router.push(`/messages?conversation=${data.conversationId}`);
            setIsOpen(false);
          }, 1200);
          return;
        }
        
        throw new Error(data.error || 'Failed to send inquiry');
      }

      conversationIdRef.current = data.conversation.id;
      setSuccess(true);
      
      setTimeout(() => {
        router.push(`/messages?conversation=${data.conversation.id}`);
        setIsOpen(false);
      }, 1200);
    } catch (err) {
      console.error('Error sending inquiry:', err);
      setError(err instanceof Error ? err.message : 'Failed to send inquiry');
    } finally {
      setSending(false);
    }
  };

  // Desktop Dialog
  if (!isMobile) {
    return (
      <>
        <Button
          variant={variant}
          size={size}
          onClick={handleClick}
          className={className}
          style={fullWidth ? { width: '100%' } : undefined}
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          Send Message
        </Button>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] rounded-md p-0 overflow-hidden">
            {/* Product Preview Header */}
            <div className="bg-gray-50 border-b border-gray-100 p-4">
              <div className="flex gap-3 items-center">
                <div className="relative h-14 w-14 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                  {productImage ? (
                    <Image
                      src={productImage}
                      alt={productName}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{productName}</p>
                  {productPrice && (
                    <p className="text-sm font-semibold text-gray-900">${productPrice.toLocaleString('en-AU')}</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-4">
              <DialogHeader className="mb-4">
                <DialogTitle className="text-base">Send a Message</DialogTitle>
                <DialogDescription className="text-sm text-gray-500">
                  Ask the seller a question about this item
                </DialogDescription>
              </DialogHeader>

              <AnimatePresence mode="wait">
                {success ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="py-8 flex flex-col items-center justify-center"
                  >
                    <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <p className="text-lg font-semibold text-gray-900">Message Sent!</p>
                    <p className="text-sm text-gray-500 mt-1">Redirecting to conversation...</p>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Quick Replies */}
                    <div className="flex flex-wrap gap-2">
                      {QUICK_REPLIES.slice(0, 3).map((reply) => (
                        <button
                          key={reply}
                          onClick={() => handleQuickReply(reply)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>

                    <Textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your message..."
                      rows={4}
                      className="rounded-md text-sm resize-none"
                      disabled={sending}
                    />

                    {error && (
                      <div className="p-3 bg-white border border-red-200 rounded-md text-sm text-red-600">
                        {error}
                      </div>
                    )}

                    <div className="flex gap-2 justify-end pt-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsOpen(false)}
                        disabled={sending}
                        className="rounded-md"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSendInquiry}
                        disabled={sending || !message.trim()}
                        className="rounded-md"
                      >
                        {sending ? (
                          <>
                            <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Send Message
                          </>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Mobile Bottom Sheet
  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={className}
        style={fullWidth ? { width: '100%' } : undefined}
      >
        <MessageCircle className="h-4 w-4 mr-2" />
        Send Message
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={handleClose}
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ 
                type: 'spring',
                damping: 30,
                stiffness: 300,
              }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Handle Bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>

              {/* Header with Close Button */}
              <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Send Message</h2>
                <button
                  onClick={handleClose}
                  className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center"
                >
                  <X className="h-4 w-4 text-gray-600" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {success ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex-1 flex flex-col items-center justify-center py-12 px-4"
                  >
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: 0.1 }}
                      className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mb-5"
                    >
                      <CheckCircle2 className="h-10 w-10 text-green-600" />
                    </motion.div>
                    <p className="text-xl font-semibold text-gray-900">Message Sent!</p>
                    <p className="text-sm text-gray-500 mt-2 text-center">
                      Opening your conversation...
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 overflow-y-auto"
                  >
                    {/* Product Preview Card */}
                    <div className="px-4 py-4">
                      <div className="flex gap-3 p-3 bg-gray-50 rounded-md">
                        <div className="relative h-16 w-16 rounded-md overflow-hidden bg-gray-200 flex-shrink-0">
                          {productImage ? (
                            <Image
                              src={productImage}
                              alt={productName}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Package className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
                            {productName}
                          </p>
                          {productPrice && (
                            <p className="text-base font-bold text-gray-900 mt-1">
                              ${productPrice.toLocaleString('en-AU')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Reply Chips */}
                    <div className="px-4 pb-4">
                      <p className="text-xs font-medium text-gray-500 mb-2">Quick replies</p>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_REPLIES.map((reply) => (
                          <button
                            key={reply}
                            onClick={() => handleQuickReply(reply)}
                            className={cn(
                              "px-3 py-2 text-sm font-medium rounded-full transition-all",
                              message.includes(reply)
                                ? "bg-gray-900 text-white"
                                : "bg-gray-100 text-gray-700 active:bg-gray-200"
                            )}
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Message Input */}
                    <div className="px-4 pb-4">
                      <Textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Write your message here..."
                        rows={4}
                        className="rounded-md text-base resize-none border-gray-200 focus:border-gray-300 focus:ring-gray-300"
                        disabled={sending}
                      />
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="px-4 pb-4">
                        <div className="p-3 bg-white border border-red-200 rounded-md text-sm text-red-600">
                          {error}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Send Button - Fixed at Bottom */}
              {!success && (
                <div className="p-4 border-t border-gray-100 bg-white">
                  <Button
                    onClick={handleSendInquiry}
                    disabled={sending || !message.trim()}
                    className="w-full h-12 rounded-md text-base font-semibold"
                  >
                    {sending ? (
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Send className="h-5 w-5" />
                        <span>Send Message</span>
                      </div>
                    )}
                  </Button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}


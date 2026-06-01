'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/components/providers/auth-provider';
import { useAuthModal } from '@/components/providers/auth-modal-provider';
import { useMessages } from '@/components/providers/messages-provider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { MessageCircle, Send, CheckCircle2, Package, Loader2 } from 'lucide-react';
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
  buttonLabel?: string;
}

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
  buttonLabel = 'Send Message',
}: ProductInquiryButtonProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openConversation } = useMessages();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    if (user.id === sellerId) return;
    setIsOpen(true);
    setMessage('');
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSuccess(false);
    setMessage('');
    setError(null);
  };

  const handleQuickReply = (text: string) => {
    setMessage(prev => prev.trim() ? prev + ' ' + text : text);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409 && data.conversationId) {
          conversationIdRef.current = data.conversationId;
          setSuccess(true);
          setTimeout(() => {
            openConversation(data.conversationId);
            setIsOpen(false);
          }, 1200);
          return;
        }
        throw new Error(data.error || 'Failed to send inquiry');
      }

      conversationIdRef.current = data.conversation.id;
      setSuccess(true);
      setTimeout(() => {
        openConversation(data.conversation.id);
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
          {buttonLabel}
        </Button>

        <Dialog open={isOpen} onOpenChange={handleClose}>
          <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-4 pt-4 pb-3">
              <DialogTitle className="text-sm font-semibold">Send a message</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Ask the seller a question about this item
              </DialogDescription>
            </DialogHeader>

            <Separator />

            {/* Product row */}
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                {productImage ? (
                  <Image src={productImage} alt={productName} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{productName}</p>
                {productPrice && (
                  <p className="text-xs text-muted-foreground mt-0.5">${productPrice.toLocaleString('en-AU')}</p>
                )}
              </div>
            </div>

            <Separator />

            {success ? (
              <div className="px-4 py-8 flex flex-col items-center gap-3">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Message sent</p>
                  <p className="text-xs text-muted-foreground mt-1">Opening your conversation...</p>
                </div>
              </div>
            ) : (
              <>
                <div className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {QUICK_REPLIES.slice(0, 3).map((reply) => (
                      <button
                        key={reply}
                        onClick={() => handleQuickReply(reply)}
                        className="px-2.5 py-1 text-[11px] text-muted-foreground bg-muted hover:bg-muted/80 rounded-full transition-colors"
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
                    rows={3}
                    className="text-xs resize-none"
                    disabled={sending}
                  />
                  {error && <p className="text-xs text-destructive mt-2">{error}</p>}
                </div>

                <Separator />

                <div className="px-4 py-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOpen(false)}
                    disabled={sending}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSendInquiry}
                    disabled={sending || !message.trim()}
                    className="h-8 text-xs gap-1.5"
                  >
                    {sending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        Send
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
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
        {buttonLabel}
      </Button>

      <Sheet open={isOpen} onOpenChange={handleClose}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl p-0 max-h-[90vh] overflow-hidden flex flex-col gap-0"
          showCloseButton={false}
        >
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-8 h-1 bg-muted-foreground/20 rounded-full" />
          </div>

          <div className="px-4 pb-3 pt-1 flex-shrink-0">
            <p className="text-sm font-semibold text-foreground">Send a message</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ask the seller a question</p>
          </div>

          <Separator className="flex-shrink-0" />

          {success ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 mb-3" />
              <p className="text-sm font-semibold text-foreground">Message sent</p>
              <p className="text-xs text-muted-foreground mt-1 text-center">Opening your conversation...</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Product row */}
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                  {productImage ? (
                    <Image src={productImage} alt={productName} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">{productName}</p>
                  {productPrice && (
                    <p className="text-xs text-muted-foreground mt-0.5">${productPrice.toLocaleString('en-AU')}</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Quick reply chips */}
              <div className="px-4 py-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Quick replies</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REPLIES.map((reply) => (
                    <button
                      key={reply}
                      onClick={() => handleQuickReply(reply)}
                      className={cn(
                        "px-2.5 py-1.5 text-xs rounded-full transition-colors",
                        message.includes(reply)
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Message input */}
              <div className="px-4 py-3">
                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your message here..."
                  rows={4}
                  className="text-sm resize-none"
                  disabled={sending}
                />
                {error && <p className="text-xs text-destructive mt-2">{error}</p>}
              </div>
            </div>
          )}

          {!success && (
            <>
              <Separator className="flex-shrink-0" />
              <div className="px-4 py-3 pb-safe flex-shrink-0">
                <Button
                  onClick={handleSendInquiry}
                  disabled={sending || !message.trim()}
                  className="w-full h-10"
                  size="sm"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="ml-1.5 text-xs">Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span className="ml-1.5 text-xs">Send message</span>
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

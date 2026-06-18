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
import { MessageCircle, Send, CheckCircle2, Package, Loader2 } from '@/components/layout/app-sidebar/dashboard-icons';
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
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialMessage?: string;
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
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
  initialMessage,
}: ProductInquiryButtonProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openConversation } = useMessages();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };
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
    if (isOpen && initialMessage) {
      setMessage(initialMessage);
    }
  }, [isOpen, initialMessage]);

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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose();
      return;
    }
    setIsOpen(true);
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
      // Strongest buying-intent signal we capture — feeds the For You engine.
      import('@/lib/tracking/interaction-tracker')
        .then(({ trackInteraction }) =>
          trackInteraction('enquiry', { productId, metadata: { seller_id: sellerId } })
        )
        .catch(() => {});
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

  const inquiryDialog = (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
        <DialogHeader className="px-4 pb-3 pt-4">
          <DialogTitle className="text-sm font-semibold">Send a message</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Ask the seller a question about this item
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="flex items-center gap-3 px-4 py-3">
          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-muted">
            {productImage ? (
              <Image src={productImage} alt={productName} fill className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{productName}</p>
            {productPrice ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                ${productPrice.toLocaleString('en-AU')}
              </p>
            ) : null}
          </div>
        </div>

        <Separator />

        {success ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Message sent</p>
              <p className="mt-1 text-xs text-muted-foreground">Opening your conversation...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3">
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {QUICK_REPLIES.slice(0, 3).map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => handleQuickReply(reply)}
                    className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/80"
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
                className="resize-none text-xs"
                disabled={sending}
              />
              {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
            </div>

            <Separator />

            <div className="flex justify-end gap-2 px-4 py-3">
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
                className="h-8 gap-1.5 text-xs"
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
  );

  const inquirySheet = (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0"
        showCloseButton={false}
      >
        <div className="flex flex-shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-8 rounded-full bg-muted-foreground/20" />
        </div>

        <div className="flex-shrink-0 px-4 pb-3 pt-1">
          <p className="text-sm font-semibold text-foreground">Send a message</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Ask the seller a question</p>
        </div>

        <Separator className="flex-shrink-0" />

        {success ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
            <CheckCircle2 className="mb-3 h-8 w-8 text-green-600" />
            <p className="text-sm font-semibold text-foreground">Message sent</p>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              Opening your conversation...
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                {productImage ? (
                  <Image src={productImage} alt={productName} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
                  {productName}
                </p>
                {productPrice ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    ${productPrice.toLocaleString('en-AU')}
                  </p>
                ) : null}
              </div>
            </div>

            <Separator />

            <div className="px-4 py-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Quick replies
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => handleQuickReply(reply)}
                    className={cn(
                      'rounded-full px-2.5 py-1.5 text-xs transition-colors',
                      message.includes(reply)
                        ? 'bg-foreground text-background'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            <div className="px-4 py-3">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your message here..."
                rows={4}
                className="resize-none text-sm"
                disabled={sending}
              />
              {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
            </div>
          </div>
        )}

        {!success ? (
          <>
            <Separator className="flex-shrink-0" />
            <div className="flex-shrink-0 px-4 py-3 pb-safe">
              <Button
                onClick={handleSendInquiry}
                disabled={sending || !message.trim()}
                className="h-10 w-full"
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
        ) : null}
      </SheetContent>
    </Sheet>
  );

  if (hideTrigger) {
    return !isMobile ? inquiryDialog : inquirySheet;
  }

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
          <MessageCircle className="h-4 w-4" />
          {buttonLabel}
        </Button>
        {inquiryDialog}
      </>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={className}
        style={fullWidth ? { width: '100%' } : undefined}
      >
        <MessageCircle className="h-4 w-4" />
        {buttonLabel}
      </Button>
      {inquirySheet}
    </>
  );
}

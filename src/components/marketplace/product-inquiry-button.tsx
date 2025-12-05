// ============================================================
// PRODUCT INQUIRY BUTTON COMPONENT
// ============================================================
// Button to initiate a conversation about a product

'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { MessageCircle, Send } from 'lucide-react';
import type { CreateConversationRequest } from '@/lib/types/message';

interface ProductInquiryButtonProps {
  productId: string;
  productName: string;
  sellerId: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

export function ProductInquiryButton({
  productId,
  productName,
  sellerId,
  variant = 'default',
  size = 'default',
  fullWidth = false,
  className,
}: ProductInquiryButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug logging - check what we're receiving
  React.useEffect(() => {
    console.log('[PRODUCT INQUIRY] Component mounted with props:', {
      productId,
      productIdType: typeof productId,
      productIdLength: productId?.length,
      productIdValid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId || ''),
      sellerId,
      sellerIdType: typeof sellerId,
      sellerIdLength: sellerId?.length,
      sellerIdValid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sellerId || ''),
      productName: productName?.substring(0, 50),
      currentUserId: user?.id,
      currentUserIdValid: user?.id ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) : false,
      isMobile: window.innerWidth < 768,
    });
  }, [productId, sellerId, productName, user]);

  const handleClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }

    // Check if user has completed profile setup
    // Note: This is a basic check - the API will do full validation
    if (!user.user_metadata?.name && !user.user_metadata?.business_name) {
      alert('Please complete your profile before sending messages. Go to Settings to add your name.');
      router.push('/onboarding');
      return;
    }

    // Validate sellerId
    if (!sellerId || typeof sellerId !== 'string' || sellerId.trim() === '') {
      alert('Unable to send message: Seller information is missing. Please try refreshing the page.');
      console.error('[PRODUCT INQUIRY] Invalid sellerId:', sellerId);
      return;
    }

    // Check if user is trying to message themselves
    if (user.id === sellerId) {
      alert('You cannot send a message to yourself');
      return;
    }

    setIsDialogOpen(true);
    setMessage(`Hi, I'm interested in ${productName}. Is this still available?`);
  };

  const handleSendInquiry = async () => {
    if (!message.trim()) {
      setError('Please enter a message');
      return;
    }

    // Validate IDs before sending
    if (!sellerId || typeof sellerId !== 'string' || sellerId.trim() === '') {
      setError('Unable to send message: Seller information is missing. Please refresh the page.');
      console.error('[PRODUCT INQUIRY] Invalid sellerId:', sellerId);
      return;
    }

    if (productId && (typeof productId !== 'string' || productId.trim() === '')) {
      setError('Unable to send message: Product information is missing. Please refresh the page.');
      console.error('[PRODUCT INQUIRY] Invalid productId:', productId);
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

      console.log('[PRODUCT INQUIRY] Sending message:', {
        productId,
        sellerId,
        messageLength: message.length,
      });

      const response = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      
      console.log('[PRODUCT INQUIRY] Response:', {
        status: response.status,
        ok: response.ok,
        data,
      });

      if (!response.ok) {
        // If conversation already exists, navigate to it
        if (response.status === 409 && data.conversationId) {
          router.push(`/messages?conversation=${data.conversationId}`);
          setIsDialogOpen(false);
          return;
        }
        
        throw new Error(data.error || 'Failed to send inquiry');
      }

      // Success - navigate to the new conversation
      router.push(`/messages?conversation=${data.conversation.id}`);
      setIsDialogOpen(false);
    } catch (err) {
      console.error('Error sending inquiry:', err);
      setError(err instanceof Error ? err.message : 'Failed to send inquiry');
    } finally {
      setSending(false);
    }
  };

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

      {/* Inquiry Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Send Message</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Send an inquiry to the seller about {productName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
            <div>
              <label htmlFor="message" className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">
                Your Message
              </label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={5}
                className="rounded-md text-sm"
                disabled={sending}
              />
            </div>

            {error && (
              <div className="p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-md text-xs sm:text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={sending}
                className="rounded-md text-xs sm:text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendInquiry}
                disabled={sending || !message.trim()}
                className="rounded-md text-xs sm:text-sm"
              >
                {sending ? (
                  <>
                    <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="hidden xs:inline">Sending...</span>
                    <span className="xs:hidden">...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    <span>Send</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


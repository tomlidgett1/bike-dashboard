// ============================================================
// MESSAGE COMPOSER COMPONENT
// ============================================================
// Text input with image upload for composing messages

'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ImagePlus, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface MessageComposerProps {
  conversationId: string;
  onSend: (content: string, attachments?: File[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageComposer({
  conversationId,
  onSend,
  disabled = false,
  placeholder = 'Type your message...',
}: MessageComposerProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [content]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Filter to only images and limit to 5 total
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const newAttachments = [...attachments, ...imageFiles].slice(0, 5);
    
    // Create preview URLs
    const newPreviewUrls = newAttachments.map((file) =>
      URL.createObjectURL(file)
    );
    
    setAttachments(newAttachments);
    setPreviewUrls(newPreviewUrls);
  };

  const removeAttachment = (index: number) => {
    // Revoke old URL
    URL.revokeObjectURL(previewUrls[index]);
    
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!content.trim() && attachments.length === 0) return;
    
    try {
      setSending(true);
      await onSend(content, attachments.length > 0 ? attachments : undefined);
      
      // Clear form
      setContent('');
      setAttachments([]);
      
      // Revoke preview URLs
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full max-w-full overflow-hidden">
      {/* Image Previews */}
      {previewUrls.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap max-w-full">
          {previewUrls.map((url, index) => (
            <div
              key={index}
              className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200"
            >
              <Image
                src={url}
                alt={`Attachment ${index + 1}`}
                fill
                className="object-cover"
              />
              <button
                onClick={() => removeAttachment(index)}
                className="absolute -right-1 -top-1 rounded-full bg-red-500 p-1 text-white shadow-md transition hover:bg-red-600"
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Text Input with inline actions */}
      <div className="flex gap-2 items-end w-full max-w-full">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || sending || attachments.length >= 5}
        />
        
        {/* Image button */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending || attachments.length >= 5}
          className="h-12 w-12 flex-shrink-0 rounded-full border-gray-300 hover:bg-gray-50"
        >
          <ImagePlus className="h-5 w-5 text-gray-500" />
        </Button>

        {/* Text input */}
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          className="min-h-12 w-full flex-1 resize-none overflow-hidden rounded-2xl border-gray-300 px-4 py-3 text-[15px] leading-snug shadow-none placeholder:text-gray-400 focus-visible:border-gray-400 focus-visible:ring-gray-200"
          rows={1}
        />

        {/* Send button */}
        <Button
          onClick={handleSend}
          disabled={disabled || sending || (!content.trim() && attachments.length === 0)}
          className="h-12 w-12 flex-shrink-0 rounded-full bg-[#FFC72C] p-0 text-gray-900 hover:bg-[#E6B328]"
          size="icon"
        >
          {sending ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}

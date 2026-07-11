"use client";

import * as React from "react";
import { Banknote, Loader2, Plus, Send } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NestRequestMoneyDialog } from "@/components/settings/customer-inquiries/nest-request-money-dialog";
import { NestSendReceiptPopover } from "@/components/settings/customer-inquiries/nest-send-receipt-popover";
import { LightspeedMark } from "@/components/settings/customer-inquiries/parts";
import { storeSettingsHeaderActionClass } from "@/components/settings/actions-page-header";
import { cn } from "@/lib/utils";
import type { NestConversationMessage } from "@/lib/nest/types";

export type NestComposeSendHandlers = {
  onOptimistic: (message: NestConversationMessage) => void;
  onConfirmed: (tempId: number, message: NestConversationMessage) => void;
  onFailed: (tempId: number, error: string) => void;
};

type PendingAttachment = {
  id: string;
  attachmentId: string;
  filename: string;
  kind: "receipt" | "file";
  previewUrl?: string;
};

const MAX_ATTACHMENTS = 5;
const FILE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf,video/mp4,video/quicktime";

export function buildOptimisticStaffMessage(content: string): NestConversationMessage {
  return {
    id: -Date.now(),
    role: "assistant",
    content,
    handle: "staff@store",
    createdAt: new Date().toISOString(),
    metadata: {
      sender_kind: "staff",
      optimistic: true,
      send_state: "pending",
    },
  };
}

async function sendNestMessage(
  chatId: string,
  content: string,
  mediaAttachmentIds: string[] = [],
): Promise<NestConversationMessage> {
  const res = await fetch("/api/store/nest-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "send_message",
      chatId,
      content,
      ...(mediaAttachmentIds.length > 0 ? { mediaAttachmentIds } : {}),
    }),
  });
  const data = (await res.json()) as { message?: NestConversationMessage; error?: string };
  if (!res.ok || !data.message) {
    throw new Error(data.error || "Could not send message.");
  }
  return data.message;
}

async function uploadNestAttachment(file: File): Promise<{
  attachmentId: string;
  filename: string;
}> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/store/nest-attachments", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as {
    attachmentId?: string;
    filename?: string;
    error?: string;
  };
  if (!res.ok || !data.attachmentId) {
    throw new Error(data.error || "Could not upload attachment.");
  }
  return {
    attachmentId: data.attachmentId,
    filename: data.filename || file.name || "attachment",
  };
}

function attachmentLabel(attachment: PendingAttachment): string {
  if (attachment.kind === "receipt") return "Receipt attached";
  const name = attachment.filename.trim();
  if (!name) return "File attached";
  return name.length > 28 ? `${name.slice(0, 25)}…` : name;
}

export function NestComposePill({
  chatId,
  sendHandlers,
  placeholder = "iMessage",
  className,
  showRequestMoney = false,
}: {
  chatId: string;
  sendHandlers: NestComposeSendHandlers;
  placeholder?: string;
  className?: string;
  showRequestMoney?: boolean;
}) {
  const [text, setText] = React.useState("");
  const [inFlight, setInFlight] = React.useState(0);
  const [sendErr, setSendErr] = React.useState<string | null>(null);
  const [requestMoneyOpen, setRequestMoneyOpen] = React.useState(false);
  const [pendingAttachments, setPendingAttachments] = React.useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const syncTextareaSize = React.useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 140);
    el.style.height = `${nextHeight}px`;
    setIsExpanded(nextHeight > 40 || el.value.includes("\n"));
  }, []);

  React.useEffect(() => {
    return () => {
      for (const attachment of pendingAttachments) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, [pendingAttachments]);

  function onInput(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    syncTextareaSize(event.target);
  }

  function removeAttachment(id: string) {
    setPendingAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  async function sendContent(content: string) {
    const attachmentIds = pendingAttachments.map((item) => item.attachmentId);
    if (!content && attachmentIds.length === 0) return;

    const fallbackLabel =
      pendingAttachments.find((item) => item.kind === "receipt")?.filename ||
      pendingAttachments[0]?.filename ||
      "Attachment";
    const optimistic = buildOptimisticStaffMessage(content || fallbackLabel);
    setSendErr(null);
    sendHandlers.onOptimistic(optimistic);

    setInFlight((count) => count + 1);
    try {
      const message = await sendNestMessage(chatId, content, attachmentIds);
      sendHandlers.onConfirmed(optimistic.id, message);
      for (const attachment of pendingAttachments) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      setPendingAttachments([]);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : "Could not send";
      sendHandlers.onFailed(optimistic.id, errMessage);
      setSendErr(errMessage);
      throw error;
    } finally {
      setInFlight((count) => Math.max(0, count - 1));
    }
  }

  async function send() {
    const content = text.trim();
    if (!content && pendingAttachments.length === 0) return;

    setText("");
    setIsExpanded(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    try {
      await sendContent(content);
    } catch {
      // Error already surfaced via sendErr + onFailed.
    }
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const remaining = MAX_ATTACHMENTS - pendingAttachments.length;
    if (remaining <= 0) {
      setSendErr(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }

    const selected = files.slice(0, remaining);
    setUploading(true);
    setSendErr(null);
    setIsExpanded(true);

    try {
      const uploaded: PendingAttachment[] = [];
      for (const file of selected) {
        const result = await uploadNestAttachment(file);
        uploaded.push({
          id: `${result.attachmentId}-${Date.now()}-${uploaded.length}`,
          attachmentId: result.attachmentId,
          filename: result.filename,
          kind: "file",
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        });
      }
      setPendingAttachments((prev) => [...prev, ...uploaded].slice(0, MAX_ATTACHMENTS));
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    } catch (error) {
      setSendErr(error instanceof Error ? error.message : "Could not upload attachment.");
    } finally {
      setUploading(false);
    }
  }

  function handleReceiptPrepared(payload: {
    attachmentId: string;
    filename: string;
    draftMessage: string;
  }) {
    setPendingAttachments((prev) => {
      const withoutReceipts = prev.filter((item) => item.kind !== "receipt");
      return [
        ...withoutReceipts,
        {
          id: `receipt-${payload.attachmentId}`,
          attachmentId: payload.attachmentId,
          filename: payload.filename,
          kind: "receipt" as const,
        },
      ].slice(0, MAX_ATTACHMENTS);
    });
    setText(payload.draftMessage);
    setIsExpanded(true);
    setSendErr(null);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      syncTextareaSize(el);
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function draftIntoInput(content: string) {
    setText(content);
    setSendErr(null);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      syncTextareaSize(el);
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  const sending = inFlight > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const canAttachMore = pendingAttachments.length < MAX_ATTACHMENTS && !uploading && !sending;

  return (
    <div className={cn("shrink-0", className)}>
      {sendErr ? (
        <div className="mb-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
          {sendErr}
        </div>
      ) : null}
      <div className="w-full">
        {showRequestMoney ? (
          <div className="relative z-10 mx-auto -mb-5 w-[85%] overflow-visible rounded-2xl border border-gray-200 bg-gray-100 shadow-sm">
            <div className="flex h-9 items-center gap-1.5 px-3">
              <button
                type="button"
                onClick={() => setRequestMoneyOpen(true)}
                className={cn(
                  storeSettingsHeaderActionClass(),
                  "inline-flex h-7 items-center gap-1.5 px-2.5 text-xs",
                )}
              >
                <Banknote className="size-[14px]" />
                Request money
              </button>
              <NestSendReceiptPopover chatId={chatId} onPrepared={handleReceiptPrepared} />
            </div>
            <div className="h-5 bg-gray-100" aria-hidden />
          </div>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="relative z-10 w-full"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => void handleFilesSelected(event)}
          />
          <div
            className={cn(
              "relative z-10 flex w-full gap-2 border border-gray-300 bg-white px-3 shadow-sm transition-[border-radius,padding]",
              isExpanded || hasAttachments
                ? "items-end rounded-2xl py-2.5"
                : "items-center rounded-full py-2",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!canAttachMore}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "h-8 w-8 shrink-0 rounded-full text-gray-500 hover:text-gray-700",
                (isExpanded || hasAttachments) && "mb-0.5",
              )}
              aria-label="Add attachment"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Plus className="h-5 w-5" />
              )}
            </Button>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {hasAttachments ? (
                <div className="flex flex-wrap items-center gap-1 px-1">
                  {pendingAttachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700"
                    >
                      {attachment.kind === "receipt" ? (
                        <LightspeedMark className="h-3 w-3" />
                      ) : attachment.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={attachment.previewUrl}
                          alt=""
                          className="h-3.5 w-3.5 rounded-sm object-cover"
                        />
                      ) : null}
                      <span className="truncate">{attachmentLabel(attachment)}</span>
                      <button
                        type="button"
                        className="ml-0.5 shrink-0 text-gray-400 hover:text-gray-700"
                        aria-label={`Remove ${attachment.filename}`}
                        onClick={() => removeAttachment(attachment.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <Textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={onInput}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={placeholder}
                className="max-h-[132px] min-h-[28px] flex-1 resize-none break-words border-0 bg-transparent px-1 py-1.5 text-[15px] leading-snug shadow-none focus-visible:ring-0"
                style={{ height: "auto" }}
              />
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={(!text.trim() && !hasAttachments) || uploading}
              className={cn(
                "h-8 w-8 shrink-0 rounded-full",
                (isExpanded || hasAttachments) && "mb-0.5",
                text.trim() || hasAttachments
                  ? "bg-[#007AFF] text-white hover:bg-[#007AFF]/90"
                  : "bg-transparent text-gray-400",
              )}
              aria-label="Send message"
            >
              {sending && !text.trim() ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>

      {showRequestMoney ? (
        <NestRequestMoneyDialog
          open={requestMoneyOpen}
          onOpenChange={setRequestMoneyOpen}
          chatId={chatId}
          onDraftMessage={draftIntoInput}
        />
      ) : null}
    </div>
  );
}

export function NestFloatingCompose({
  chatId,
  sendHandlers,
  placeholder,
  showRequestMoney,
}: {
  chatId: string;
  sendHandlers: NestComposeSendHandlers;
  placeholder?: string;
  showRequestMoney?: boolean;
}) {
  return (
    <div className={cn(
      "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4",
      showRequestMoney ? "pt-20" : "pt-16",
    )}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-white from-25% via-white/95 to-transparent"
      />
      <div className="pointer-events-auto relative w-full max-w-3xl">
        <NestComposePill
          chatId={chatId}
          sendHandlers={sendHandlers}
          placeholder={placeholder}
          showRequestMoney={showRequestMoney}
        />
      </div>
    </div>
  );
}

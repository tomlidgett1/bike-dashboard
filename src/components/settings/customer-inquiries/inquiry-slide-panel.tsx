"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, X } from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { NestConversationMessage } from "@/lib/nest/types";
import {
  CustomerMessageCard,
  LightspeedBody,
  LightspeedMark,
  MatchBadge,
  ReplyComposer,
  SourcesBody,
  ThreadTimeline,
} from "./parts";
import type { UnifiedInboxController } from "./use-unified-inbox-controller";

async function sendNestMessage(chatId: string, content: string): Promise<NestConversationMessage> {
  const res = await fetch("/api/store/nest-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send_message", chatId, content }),
  });
  const data = (await res.json()) as { message?: NestConversationMessage; error?: string };
  if (!res.ok || !data.message) {
    throw new Error(data.error || "Could not send message.");
  }
  return data.message;
}

function NestThreadBubble({ message }: { message: NestConversationMessage }) {
  const isStaff =
    (typeof message.handle === "string" && message.handle.startsWith("staff@")) ||
    message.metadata?.sender_kind === "staff";
  const isOutgoing = isStaff || message.role === "assistant";

  return (
    <div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-md px-3 py-2 text-[13px] leading-relaxed",
          isOutgoing ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-800",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className={cn("mt-1 text-[10px]", isOutgoing ? "text-gray-300" : "text-gray-400")}>
          {new Date(message.createdAt).toLocaleString("en-AU", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function NestCompose({
  chatId,
  onSent,
}: {
  chatId: string;
  onSent: (message: NestConversationMessage, chatId: string) => void;
}) {
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendNestMessage(chatId, content);
      setText("");
      onSent(message, chatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white p-4">
      {error ? (
        <p className="mb-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Write a reply…"
          className="min-h-[72px] resize-none rounded-md border-gray-200 text-sm"
          disabled={sending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="button"
          className="h-9 shrink-0 rounded-md"
          disabled={!text.trim() || sending}
          onClick={() => void send()}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function InquirySlidePanel({ c }: { c: UnifiedInboxController }) {
  const open = Boolean(c.selectedKey && c.selectedRow);
  const row = c.selectedRow;
  const isGmail = row?.source === "gmail";
  const isNest = row?.source === "nest";

  return (
    <AnimatePresence>
      {open && row ? (
        <>
          <motion.button
            type="button"
            aria-label="Close panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={c.closePanel}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-gray-200 bg-white shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {isGmail ? <GmailLogo /> : <NestLogo />}
                  <p className="truncate text-base font-semibold text-gray-900">{row.customerName}</p>
                </div>
                <p className="mt-0.5 truncate text-sm text-gray-500">{row.customerContact}</p>
                {row.subject ? (
                  <p className="mt-1 truncate text-sm font-medium text-gray-800">{row.subject}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-md"
                onClick={c.closePanel}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f6f4] p-5">
              {isGmail ? (
                c.detailLoading || !c.detail ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading email…
                  </div>
                ) : (
                  <div className="space-y-4">
                    <CustomerMessageCard detail={c.detail} />
                    <ThreadTimeline detail={c.detail} />
                    <ReplyComposer
                      detail={c.detail}
                      draft={c.draft}
                      setDraft={c.setDraft}
                      onRegenerate={() => void c.handleRegenerate()}
                      regenerating={c.regenerating}
                      onSend={() => c.setSendConfirmOpen(true)}
                      onIgnore={() => void c.handleIgnore()}
                      onUnignore={() => void c.handleUnignore()}
                      onBanSender={() => c.setBanConfirmOpen(true)}
                      sending={c.sending}
                      banning={c.banning}
                      revising={c.revising}
                      reviseInstruction={c.reviseInstruction}
                      setReviseInstruction={c.setReviseInstruction}
                      onRevise={() => void c.handleReviseDraft()}
                      actionMessage={c.actionMessage}
                    />

                    {c.lightspeedContext ? (
                      <div className="rounded-md border border-gray-200 bg-white p-4">
                        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
                          <LightspeedMark />
                          Lightspeed
                          <MatchBadge matched={c.lightspeedContext?.matched} />
                        </p>
                        <LightspeedBody context={c.lightspeedContext} />
                      </div>
                    ) : null}

                    {c.detail.citations?.length ? (
                      <div className="rounded-md border border-gray-200 bg-white p-4">
                        <p className="mb-3 text-sm font-medium text-gray-900">
                          Sources ({c.detail.citations.length})
                        </p>
                        <SourcesBody citations={c.detail.citations} />
                      </div>
                    ) : null}
                  </div>
                )
              ) : null}

              {isNest ? (
                c.nestDetailLoading && !c.nestDetail?.messages.length ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading conversation…
                  </div>
                ) : (
                  <div className="space-y-3">
                    {c.nestDetail?.messages.map((message) => (
                      <NestThreadBubble key={message.id} message={message} />
                    ))}
                    {!c.nestDetail?.messages.length ? (
                      <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                        No messages in this thread yet.
                      </p>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>

            {isNest && row.nestChatId ? (
              <NestCompose chatId={row.nestChatId} onSent={c.handleNestMessageSent} />
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

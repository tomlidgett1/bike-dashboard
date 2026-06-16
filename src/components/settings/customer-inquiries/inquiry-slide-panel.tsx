"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import { Button } from "@/components/ui/button";
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
import { NestThreadMessage, sameMessageGroup } from "@/components/settings/nest-chat-messages";
import { NestFloatingCompose } from "@/components/settings/nest-compose-pill";

function NestThread({
  messages,
  loading,
  scrollRef,
}: {
  messages: NestConversationMessage[];
  loading: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading conversation…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
        No messages in this thread yet.
      </p>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-white px-5 py-5 pb-28"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {messages.map((message, index) => {
        const nextMessage = messages[index + 1];
        const showTail = !nextMessage || !sameMessageGroup(message, nextMessage, "inbox");
        return (
          <NestThreadMessage
            key={message.id}
            message={message}
            showTail={showTail}
            layout="inbox"
          />
        );
      })}
    </div>
  );
}

export function InquirySlidePanel({ c }: { c: UnifiedInboxController }) {
  const open = Boolean(c.selectedKey && c.selectedRow);
  const row = c.selectedRow;
  const isGmail = row?.source === "gmail";
  const isNest = row?.source === "nest";
  const nestThreadScrollRef = React.useRef<HTMLDivElement>(null);
  const nestMessages = c.nestDetail?.messages ?? [];

  React.useEffect(() => {
    if (!open || !isNest) return;
    const el = nestThreadScrollRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(scrollToBottom);
    const timeout = window.setTimeout(scrollToBottom, 50);
    return () => window.clearTimeout(timeout);
  }, [open, isNest, c.selectedKey, nestMessages.length, c.nestDetailLoading]);

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

            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto bg-[#f6f6f4] p-5",
                isNest && "relative flex flex-col overflow-hidden bg-white p-0",
              )}
            >
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
                <>
                  <NestThread
                    messages={nestMessages}
                    loading={c.nestDetailLoading}
                    scrollRef={nestThreadScrollRef}
                  />
                  {row.nestChatId ? (
                    <NestFloatingCompose
                      chatId={row.nestChatId}
                      placeholder="Write a reply…"
                      sendHandlers={{
                        onOptimistic: (message) =>
                          c.handleNestMessageOptimistic(message, row.nestChatId!),
                        onConfirmed: (tempId, message) =>
                          c.handleNestMessageConfirmed(tempId, message, row.nestChatId!),
                        onFailed: (tempId) => c.handleNestMessageFailed(tempId, row.nestChatId!),
                      }}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

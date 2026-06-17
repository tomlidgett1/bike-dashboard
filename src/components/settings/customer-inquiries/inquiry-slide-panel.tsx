"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X, Archive } from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NestConversationMessage } from "@/lib/nest/types";
import {
  Collapsible,
  GmailInquiryThread,
  LightspeedBody,
  LightspeedMark,
  MatchBadge,
  ReplyComposer,
  SourcesBody,
  fullTime,
} from "./parts";
import type { UnifiedInboxController } from "./use-unified-inbox-controller";
import type { LightspeedContext } from "./use-inquiries-controller";
import { NestThreadMessage, sameMessageGroup } from "@/components/settings/nest-chat-messages";
import { NestFloatingCompose } from "@/components/settings/nest-compose-pill";

type InquiryPanelTab = "conversation" | "lightspeed";

function InquiryPanelTabs({
  value,
  onChange,
  conversationLabel,
}: {
  value: InquiryPanelTab;
  onChange: (tab: InquiryPanelTab) => void;
  conversationLabel: string;
}) {
  return (
    <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
      <button
        type="button"
        onClick={() => onChange("conversation")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
          value === "conversation"
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70",
        )}
      >
        {conversationLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange("lightspeed")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
          value === "lightspeed"
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70",
        )}
      >
        <LightspeedMark className="h-3.5 w-3.5" />
        Lightspeed
      </button>
    </div>
  );
}

function LightspeedPanelSection({
  loading,
  context,
  lookupHint,
}: {
  loading: boolean;
  context?: LightspeedContext;
  lookupHint?: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Looking up customer in Lightspeed…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">Customer in Lightspeed</p>
          <MatchBadge matched={context?.matched} />
        </div>
        {lookupHint ? <p className="text-xs text-gray-500">Lookup via {lookupHint}</p> : null}
      </div>
      {context ? (
        <LightspeedBody context={context} />
      ) : (
        <p className="text-sm text-gray-500">No Lightspeed data is available yet.</p>
      )}
    </div>
  );
}

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
  const [panelTab, setPanelTab] = React.useState<InquiryPanelTab>("conversation");

  React.useEffect(() => {
    setPanelTab("conversation");
  }, [c.selectedKey]);

  React.useEffect(() => {
    if (!open || !isNest || panelTab !== "lightspeed") return;
    void c.ensureNestLightspeedContext();
  }, [open, isNest, panelTab, c.selectedKey, c.selectedNestPhone, c.ensureNestLightspeedContext]);

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
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5">
              <div className="min-w-0 flex-1">
                {row.subject ? (
                  <h2 className="text-lg font-semibold leading-snug text-gray-900">{row.subject}</h2>
                ) : (
                  <h2 className="text-lg font-semibold text-gray-900">{row.customerName}</h2>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-500">
                  {isGmail ? <GmailLogo /> : <NestLogo />}
                  <span className="truncate">{row.customerName}</span>
                  <span aria-hidden className="text-gray-300">
                    ·
                  </span>
                  <span className="truncate">{row.customerContact}</span>
                  {isGmail && c.detail?.received_at ? (
                    <>
                      <span aria-hidden className="text-gray-300">
                        ·
                      </span>
                      <span className="shrink-0">{fullTime(c.detail.received_at)}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {row.needsAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md bg-white"
                    disabled={c.closingSelectedCase}
                    onClick={() => void c.handleCloseSelectedCase()}
                  >
                    {c.closingSelectedCase ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Archive className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Close case
                  </Button>
                ) : isNest && c.selectedNestClosed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md bg-white"
                    disabled={c.closingSelectedCase}
                    onClick={() => void c.handleReopenSelectedNestCase()}
                  >
                    Reopen case
                  </Button>
                ) : null}
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
            </div>

            {(isGmail && c.detail && !c.detailLoading) || isNest ? (
              <div className="shrink-0 border-b border-gray-100 px-5 pb-3">
                <InquiryPanelTabs
                  value={panelTab}
                  onChange={setPanelTab}
                  conversationLabel={isGmail ? "Enquiry" : "Messages"}
                />
              </div>
            ) : null}

            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto",
                isNest && panelTab === "conversation" && "relative flex flex-col overflow-hidden p-0",
                isNest && panelTab === "lightspeed" && "px-5 pb-6 pt-4",
                isGmail && "px-5 pb-6 pt-4",
              )}
            >
              {isGmail ? (
                c.detailLoading || !c.detail ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading email…
                  </div>
                ) : panelTab === "conversation" ? (
                  <div className="space-y-6">
                    <GmailInquiryThread detail={c.detail} />

                    {c.detail.citations?.length ? (
                      <Collapsible
                        title={`Sources (${c.detail.citations.length})`}
                        defaultOpen={false}
                        variant="inline"
                      >
                        <SourcesBody citations={c.detail.citations} />
                      </Collapsible>
                    ) : null}
                  </div>
                ) : (
                  <LightspeedPanelSection
                    loading={false}
                    context={c.lightspeedContext}
                    lookupHint={c.detail.sender_email}
                  />
                )
              ) : null}

              {isNest ? (
                panelTab === "conversation" ? (
                  <>
                    <NestThread
                      messages={nestMessages}
                      loading={c.nestDetailLoading}
                      scrollRef={nestThreadScrollRef}
                    />
                    {row.nestChatId && !c.selectedNestClosed ? (
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
                ) : (
                  <LightspeedPanelSection
                    loading={c.nestLightspeedLoading}
                    context={c.nestLightspeedContext}
                    lookupHint={c.selectedNestPhone}
                  />
                )
              ) : null}
            </div>

            {isGmail && c.detail && !c.detailLoading && panelTab === "conversation" ? (
              <div className="shrink-0">
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
                  layout="panel"
                  showCaseActions={false}
                />
              </div>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

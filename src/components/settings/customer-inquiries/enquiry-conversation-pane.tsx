"use client";

import * as React from "react";
import {
  Archive,
  ChevronLeft,
  Inbox,
  Loader2,
} from "@/components/layout/app-sidebar/dashboard-icons";
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
import { EnquiriesNavTabs, type EnquiriesNavTabItem } from "./enquiries-nav-tabs";
import { CHANNEL_META, type InboxChannel } from "./channel-meta";
import { ChannelChip } from "./enquiry-conversation-list";
import type { UnifiedInboxController } from "./use-unified-inbox-controller";
import type { LightspeedContext } from "./use-inquiries-controller";
import { NestThreadMessage, sameMessageGroup } from "@/components/settings/nest-chat-messages";
import { NestFloatingCompose } from "@/components/settings/nest-compose-pill";

type ConversationPaneTab = "conversation" | "lightspeed";

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
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading conversation…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <p className="mx-5 my-6 rounded-md border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
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

/** Thin strip under the header spelling out how this conversation reached the store. */
function ChannelOriginStrip({ channel }: { channel: InboxChannel }) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-2 md:px-5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      <p className="text-xs text-gray-500">{meta.origin}</p>
    </div>
  );
}

function EmptyConversationState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white">
        <Inbox className="h-5 w-5 text-gray-400" />
      </span>
      <p className="mt-4 text-sm font-medium text-gray-900">Select an enquiry</p>
      <p className="mt-1 max-w-xs text-sm text-gray-500">
        Choose a customer on the left to read the conversation and reply.
      </p>
    </div>
  );
}

export function EnquiryConversationPane({ c }: { c: UnifiedInboxController }) {
  const row = c.selectedRow;
  const isGmail = row?.source === "gmail";
  const isNest = row?.source === "nest";
  const nestThreadScrollRef = React.useRef<HTMLDivElement>(null);
  const nestMessages = c.nestDetail?.messages ?? [];
  const [paneTab, setPaneTab] = React.useState<ConversationPaneTab>("conversation");

  React.useEffect(() => {
    setPaneTab("conversation");
  }, [c.selectedKey]);

  React.useEffect(() => {
    if (!row || !isNest || paneTab !== "lightspeed") return;
    void c.ensureNestLightspeedContext();
  }, [row, isNest, paneTab, c.selectedKey, c.selectedNestPhone, c.ensureNestLightspeedContext]);

  React.useEffect(() => {
    if (!isNest) return;
    const el = nestThreadScrollRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(scrollToBottom);
    const timeout = window.setTimeout(scrollToBottom, 50);
    return () => window.clearTimeout(timeout);
  }, [isNest, c.selectedKey, nestMessages.length, c.nestDetailLoading]);

  if (!row) {
    return <EmptyConversationState />;
  }

  const paneTabs: EnquiriesNavTabItem<ConversationPaneTab>[] = [
    { id: "conversation", label: isGmail ? "Enquiry" : "Messages" },
    { id: "lightspeed", label: "Lightspeed", icon: LightspeedMark },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 pb-3 pt-4 md:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 h-7 w-7 shrink-0 rounded-md md:hidden"
            onClick={c.closePanel}
            aria-label="Back to enquiries"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-snug text-gray-900">
              {isGmail && row.subject ? row.subject : row.customerName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-500">
              {isGmail ? <GmailLogo className="h-3.5 w-auto" /> : <NestLogo className="h-3.5 w-3.5" />}
              <ChannelChip channel={c.selectedChannel ?? row.channel} />
              {isGmail ? (
                <>
                  <span className="truncate">{row.customerName}</span>
                  <span aria-hidden className="text-gray-300">
                    ·
                  </span>
                </>
              ) : null}
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
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <EnquiriesNavTabs
            size="sm"
            items={paneTabs}
            value={paneTab}
            onChange={setPaneTab}
            className="hidden sm:flex"
          />
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
        </div>
      </div>

      <div className="shrink-0 border-b border-gray-100 px-4 py-2 sm:hidden md:px-5">
        <EnquiriesNavTabs size="sm" items={paneTabs} value={paneTab} onChange={setPaneTab} />
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          isNest && paneTab === "conversation" && "relative flex flex-col overflow-hidden p-0",
          isNest && paneTab === "lightspeed" && "px-4 pb-6 pt-4 md:px-5",
          isGmail && "px-4 pb-6 pt-4 md:px-5",
        )}
      >
        {isGmail ? (
          c.detailLoading || !c.detail ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading email…
            </div>
          ) : paneTab === "conversation" ? (
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
          paneTab === "conversation" ? (
            <>
              <ChannelOriginStrip channel={c.selectedChannel ?? row.channel} />
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

      {isGmail && c.detail && !c.detailLoading && paneTab === "conversation" ? (
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
    </div>
  );
}

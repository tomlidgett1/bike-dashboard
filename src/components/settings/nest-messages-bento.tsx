"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send } from "lucide-react";
import { NestLogo } from "@/components/genie/nest-logo";
import { getBentoShellStyles, bentoCardShellClassName, bentoOuterWrapClassName, type BentoShellVariant } from "@/components/settings/bento-variant-styles";
import {
  BentoInboxDismissButton,
  BentoInboxEmptyState,
  BentoInboxPrimaryButton,
  useDismissibleIds,
} from "@/components/settings/bento-inbox-item-actions";
import { cn } from "@/lib/utils";

const MOCK_NEST_MESSAGES = [
  {
    id: "1",
    name: "Emma Walsh",
    phone: "0412 345 678",
    preview: "Hi! Is my Orbea ready for pickup today?",
    body: "Hi! Is my Orbea ready for pickup today? I can swing by after 4pm if that works.",
    draftReply:
      "Hi Emma — yes, your Orbea is ready. We're here until 5:30pm today if that suits.",
    receivedAt: "12 min ago",
  },
  {
    id: "2",
    name: "Marcus Chen",
    phone: "0423 891 204",
    preview: "Do you have the Giro helmet in matte black, size M?",
    body: "Do you have the Giro helmet in matte black, size M? Happy to pay over the phone if you can hold one.",
    draftReply:
      "Hi Marcus — we have one Giro matte black in M on the shelf. I can hold it under your name until close.",
    receivedAt: "38 min ago",
  },
  {
    id: "3",
    name: "Hannah Brooks",
    phone: "0401 772 991",
    preview: "Thanks for the service update — can I collect Saturday?",
    body: "Thanks for the service update. Can I collect Saturday morning? Need the bike for a ride Sunday.",
    draftReply:
      "Hi Hannah — Saturday works. We'll have it on the stand from 9am. See you then!",
    receivedAt: "1 hr ago",
  },
  {
    id: "4",
    name: "Liam O'Connor",
    phone: "0438 556 120",
    preview: "Just confirming my booking for the bike fit tomorrow.",
    body: "Just confirming my booking for the bike fit tomorrow at 2pm. Still good?",
    draftReply:
      "Hi Liam — all confirmed for 2pm tomorrow. Bring your shoes and usual kit if you can.",
    receivedAt: "2 hr ago",
  },
];

type NestMessage = (typeof MOCK_NEST_MESSAGES)[number];

type NestMessagesBentoVariant = BentoShellVariant;

const SLIDE_TRANSITION = { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] as const };

function MessageListItem({
  message,
  listItemBorder,
  onReply,
  onDismiss,
  ignoring,
}: {
  message: NestMessage;
  listItemBorder: string;
  onReply: (message: NestMessage) => void;
  onDismiss: (message: NestMessage) => void;
  ignoring?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full items-start gap-2.5 rounded-[18px] border bg-white p-3 shadow-sm transition-opacity duration-200",
        listItemBorder,
        ignoring && "pointer-events-none opacity-40",
      )}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
        <NestLogo className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1 pr-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] font-semibold text-gray-900">{message.name}</p>
          <span className="shrink-0 text-[10px] text-gray-400">{message.receivedAt}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-gray-500">{message.phone}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-900">{message.preview}</p>
      </div>

      <BentoInboxPrimaryButton
        label="Reply"
        onClick={() => onReply(message)}
        ignoring={ignoring}
      />

      <BentoInboxDismissButton onDismiss={() => onDismiss(message)} ignoring={ignoring} />
    </div>
  );
}

function ReplyFace({
  message,
  listItemBorder,
  replyText,
  onReplyChange,
  onBack,
  onSend,
  sending,
}: {
  message: NestMessage;
  listItemBorder: string;
  replyText: string;
  onReplyChange: (value: string) => void;
  onBack: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={sending}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          aria-label="Back to messages"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-gray-900">{message.name}</p>
          <p className="truncate text-[11px] text-gray-500">{message.phone}</p>
        </div>
        <NestLogo className="h-[18px] w-[18px] shrink-0" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.35, ease: [0.04, 0.62, 0.23, 0.98] }}
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border bg-white shadow-sm",
          listItemBorder,
        )}
      >
        <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Their message</p>
          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-gray-900">{message.body}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Your reply</p>
          <textarea
            value={replyText}
            onChange={(event) => onReplyChange(event.target.value)}
            disabled={sending}
            rows={6}
            className="mt-1.5 w-full resize-none rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 text-[11px] leading-relaxed text-gray-800 outline-none transition-colors focus:border-gray-300 focus:bg-white disabled:opacity-60"
          />
        </div>

        <div className="shrink-0 border-t border-gray-100 p-3">
          <motion.button
            type="button"
            onClick={onSend}
            disabled={sending || !replyText.trim()}
            whileTap={{ scale: 0.97 }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2.5 text-[13px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? (
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                Sending…
              </motion.span>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send via Nest
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Test footy-card bento — Nest recent customer messages with slide-up reply.
 */
export function NestMessagesBento({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: NestMessagesBentoVariant;
}) {
  const shell = getBentoShellStyles(variant);
  const { ignoringId, isDismissed, dismiss } = useDismissibleIds();
  const [showReply, setShowReply] = React.useState(false);
  const [activeMessage, setActiveMessage] = React.useState<NestMessage | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const panelClassName = cn("flex min-h-0 flex-1 flex-col", shell.panelClassName);
  const panelBg = shell.panelBg;

  function handleReply(message: NestMessage) {
    setActiveMessage(message);
    setReplyText(message.draftReply);
    setShowReply(true);
  }

  const dismissDelayMs = 400;

  function handleBack() {
    if (sending) return;
    setShowReply(false);
    window.setTimeout(() => {
      setActiveMessage(null);
      setReplyText("");
    }, dismissDelayMs);
  }

  async function handleSend() {
    if (!activeMessage || sending) return;
    setSending(true);
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    setSending(false);
    setShowReply(false);
    window.setTimeout(() => {
      setActiveMessage(null);
      setReplyText("");
    }, dismissDelayMs);
  }

  function handleDismiss(message: NestMessage) {
    if (activeMessage?.id === message.id) {
      handleBack();
    }
    dismiss(message.id);
  }

  const visibleMessages = MOCK_NEST_MESSAGES.filter((message) => !isDismissed(message.id));

  const messageList = (
    <ul className="-mx-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-0">
      <AnimatePresence initial={false}>
        {visibleMessages.length === 0 ? (
          <motion.li
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
          >
            <BentoInboxEmptyState message="No unread messages" />
          </motion.li>
        ) : (
          visibleMessages.map((message) => (
            <motion.li
              key={message.id}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.28, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="shrink-0"
            >
              <MessageListItem
                message={message}
                listItemBorder={shell.listItemBorder}
                onReply={handleReply}
                onDismiss={handleDismiss}
                ignoring={ignoringId === message.id}
              />
            </motion.li>
          ))
        )}
      </AnimatePresence>
    </ul>
  );

  const replyContent = activeMessage ? (
    <ReplyFace
      message={activeMessage}
      listItemBorder={shell.listItemBorder}
      replyText={replyText}
      onReplyChange={setReplyText}
      onBack={handleBack}
      onSend={handleSend}
      sending={sending}
    />
  ) : null;

  return (
    <div className={bentoCardShellClassName(className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Recent Customer Messages</h2>
        <NestLogo className="mt-0.5 h-[20px] w-[20px] shrink-0" />
      </div>

      <div className={bentoOuterWrapClassName(variant)}>
          <div className={cn("relative flex h-full min-h-0 flex-col", panelClassName)}>
            {messageList}
            <AnimatePresence>
              {showReply && activeMessage ? (
                <motion.div
                  key={activeMessage.id}
                  className={cn("absolute inset-0 flex min-h-0 flex-col overflow-hidden", panelBg)}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={SLIDE_TRANSITION}
                >
                  <div className="flex min-h-0 flex-1 flex-col p-3">{replyContent}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
      </div>
    </div>
  );
}

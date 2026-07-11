"use client";

import * as React from "react";
import { Loader2, Send } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type {
  InstagramConversationItem,
  InstagramInboxMessage,
} from "@/lib/customer-inquiries/instagram-types";

function formatMessageTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function InstagramBubble({
  message,
  showTail,
}: {
  message: InstagramInboxMessage;
  showTail: boolean;
}) {
  const isShop = message.role === "shop";
  return (
    <div className={cn("flex", isShop ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(78%,28rem)] whitespace-pre-wrap break-words px-3 py-2 text-[15px] leading-snug",
          "rounded-[18px]",
          isShop
            ? cn("bg-[#007AFF] text-white", showTail ? "rounded-br-[4px]" : "")
            : cn("bg-gray-100 text-gray-900", showTail ? "rounded-bl-[4px]" : ""),
        )}
      >
        {message.text || (message.has_attachments ? "[Attachment]" : "")}
      </div>
    </div>
  );
}

export function InstagramThread({
  conversation,
  scrollRef,
}: {
  conversation: InstagramConversationItem;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const messages = conversation.messages;

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
      className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain bg-white px-5 py-5"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {messages.map((message, index) => {
        const next = messages[index + 1];
        const showTail = !next || next.role !== message.role;
        const timeLabel =
          index === 0 ? formatMessageTime(message.created_at) : null;
        return (
          <React.Fragment key={message.id}>
            {timeLabel ? (
              <p className="pb-2 text-center text-[11px] text-gray-400">{timeLabel}</p>
            ) : null}
            <InstagramBubble message={message} showTail={showTail} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function InstagramReplyComposer({
  conversation,
  onSend,
  sending,
}: {
  conversation: InstagramConversationItem;
  onSend: (conversation: InstagramConversationItem, text: string) => Promise<void>;
  sending: boolean;
}) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setText("");
    setError(null);
  }, [conversation.conversation_id]);

  const canReply = Boolean(conversation.participant_id);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !canReply) return;
    setError(null);
    setText("");
    try {
      await onSend(conversation, trimmed);
    } catch (err) {
      setText(trimmed);
      setError(err instanceof Error ? err.message : "Could not send Instagram message.");
    }
  };

  if (!canReply) {
    return (
      <p className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-center text-xs text-gray-500">
        Replies aren&rsquo;t available for this conversation yet — open it in Instagram to
        respond.
      </p>
    );
  }

  return (
    <div>
      {error ? (
        <p className="mb-1.5 px-1 text-xs text-gray-500" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-1.5 rounded-[22px] border border-gray-200 bg-white py-1 pl-4 pr-1 shadow-sm">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Write a reply…"
          rows={1}
          className="max-h-32 min-h-[30px] flex-1 resize-none bg-transparent py-1 text-[15px] leading-snug text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || !text.trim()}
          aria-label="Send Instagram reply"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            text.trim() && !sending
              ? "bg-[#007AFF] text-white hover:bg-[#0071eb]"
              : "bg-gray-100 text-gray-400",
          )}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

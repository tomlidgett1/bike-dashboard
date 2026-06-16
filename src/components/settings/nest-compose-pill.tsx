"use client";

import * as React from "react";
import { Loader2, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { NestConversationMessage } from "@/lib/nest/types";

export type NestComposeSendHandlers = {
  onOptimistic: (message: NestConversationMessage) => void;
  onConfirmed: (tempId: number, message: NestConversationMessage) => void;
  onFailed: (tempId: number, error: string) => void;
};

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

export function NestComposePill({
  chatId,
  sendHandlers,
  placeholder = "iMessage",
  className,
}: {
  chatId: string;
  sendHandlers: NestComposeSendHandlers;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = React.useState("");
  const [inFlight, setInFlight] = React.useState(0);
  const [sendErr, setSendErr] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  function onInput(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    const el = event.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  async function send() {
    const content = text.trim();
    if (!content) return;

    const optimistic = buildOptimisticStaffMessage(content);
    setText("");
    setSendErr(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendHandlers.onOptimistic(optimistic);

    setInFlight((count) => count + 1);
    try {
      const message = await sendNestMessage(chatId, content);
      sendHandlers.onConfirmed(optimistic.id, message);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : "Could not send";
      sendHandlers.onFailed(optimistic.id, errMessage);
      setSendErr(errMessage);
    } finally {
      setInFlight((count) => Math.max(0, count - 1));
    }
  }

  const sending = inFlight > 0;

  return (
    <div className={cn("shrink-0", className)}>
      {sendErr ? (
        <div className="mb-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
          {sendErr}
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="w-full"
      >
        <div className="flex w-full items-end gap-2 rounded-full border border-gray-300 bg-white px-3 py-2 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mb-0.5 h-8 w-8 shrink-0 rounded-full text-gray-500 hover:text-gray-700"
            aria-label="Add attachment"
          >
            <Plus className="h-5 w-5" />
          </Button>
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
            className="max-h-[132px] min-h-[28px] flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[15px] leading-snug shadow-none focus-visible:ring-0"
            style={{ height: "auto" }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim()}
            className={cn(
              "mb-0.5 h-8 w-8 shrink-0 rounded-full",
              text.trim() ? "bg-[#007AFF] text-white hover:bg-[#007AFF]/90" : "bg-transparent text-gray-400",
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
  );
}

export function NestFloatingCompose({
  chatId,
  sendHandlers,
  placeholder,
}: {
  chatId: string;
  sendHandlers: NestComposeSendHandlers;
  placeholder?: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4 pt-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-white from-25% via-white/95 to-transparent"
      />
      <div className="pointer-events-auto relative w-full max-w-lg">
        <NestComposePill chatId={chatId} sendHandlers={sendHandlers} placeholder={placeholder} />
      </div>
    </div>
  );
}

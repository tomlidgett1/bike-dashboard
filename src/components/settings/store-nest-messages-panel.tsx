"use client";

import * as React from "react";
import {
  ChevronLeft,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { SettingsSection } from "@/components/dashboard/settings-primitives";
import {
  formatNestOutboundMessage,
  NEST_MESSAGE_PLACEHOLDER_HINT,
  type NestMessageTemplateSettings,
} from "@/lib/nest/message-format";
import {
  sanitiseNestConversationsResponse,
  type NestConversationDetail,
  type NestConversationListItem,
  type NestConversationMessage,
  type NestConversationsResponse,
  type NestLightspeedCustomer,
} from "@/lib/nest/types";
import { NestAutoServicePanel } from "@/components/settings/nest-auto-service-panel";
import { NestHiddenPickupSuggestionsPanel } from "@/components/settings/nest-hidden-pickup-suggestions";

const QUICK_REPLIES = [
  "Thanks, we'll get back to you shortly.",
  "We're looking into this now.",
  "Could you share a bit more detail?",
] as const;

/** Matches Nest business portal inbox (`PortalConversationsPanel`). */
const INBOX_INPUT_CLASS = cn(
  "w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-900",
  "outline-none transition-colors shadow-none",
  "focus:border-gray-400 focus:ring-2 focus:ring-gray-100",
  "placeholder:text-gray-400",
);

const INBOX_SECTION_HEADER_CLASS =
  "border-b border-gray-200 bg-gray-100 px-3.5 py-2.5 md:px-4";

const NEST_INBOX_BADGE_CLASS =
  "rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600";

const NEST_INBOX_ICON_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

const LAST_READ_KEY = "yj_nest_last_read";

function formatListTime(iso: string): string {
  const when = new Date(iso);
  const now = new Date();
  if (when.toDateString() === now.toDateString()) {
    return when.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  }
  const daysAgo = Math.abs(now.getTime() - when.getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo < 7) {
    return when.toLocaleDateString("en-AU", { weekday: "short" });
  }
  return when.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLastSeen(value: number | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isManualMessage(message: NestConversationMessage): boolean {
  const source = typeof message.metadata?.source === "string" ? message.metadata.source : "";
  const service = typeof message.metadata?.service === "string" ? message.metadata.service : "";
  const senderKind =
    typeof message.metadata?.sender_kind === "string" ? message.metadata.sender_kind : "";
  return (
    message.handle?.startsWith("staff@") === true ||
    senderKind === "staff" ||
    source.startsWith("brand_portal_") ||
    service.startsWith("brand_portal_")
  );
}

function splitAssistantBubbles(text: string): string[] {
  const parts = text
    .split(/\n\s*---\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()];
}

function sortChats(chats: NestConversationListItem[]): NestConversationListItem[] {
  return [...chats].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

function readLastReadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLastRead(chatId: string, iso: string) {
  if (typeof window === "undefined") return;
  const map = readLastReadMap();
  map[chatId] = iso;
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
}

function isConversationUnread(chat: NestConversationListItem): boolean {
  const anchor = chat.lastCustomerMessageAt || chat.lastMessageAt;
  if (!anchor) return false;
  const lastRead = readLastReadMap()[chat.chatId];
  if (!lastRead) return true;
  return new Date(anchor).getTime() > new Date(lastRead).getTime();
}

function markConversationRead(chat: NestConversationListItem) {
  const anchor = chat.lastCustomerMessageAt || chat.lastMessageAt;
  if (anchor) writeLastRead(chat.chatId, anchor);
}

async function fetchNestConversations(params: {
  chatId?: string;
  listOnly?: boolean;
  threadOnly?: boolean;
}): Promise<NestConversationsResponse> {
  const search = new URLSearchParams();
  if (params.chatId) search.set("chatId", params.chatId);
  if (params.listOnly) search.set("listOnly", "1");
  if (params.threadOnly) search.set("threadOnly", "1");

  const res = await fetch(`/api/store/nest-messages?${search.toString()}`, { cache: "no-store" });
  const data = (await res.json()) as NestConversationsResponse & { error?: string; configured?: boolean };

  if (!res.ok) {
    throw new Error(data.error || "Could not load Nest messages.");
  }

  return sanitiseNestConversationsResponse({
    chats: Array.isArray(data.chats) ? data.chats : [],
    selectedChatId: typeof data.selectedChatId === "string" ? data.selectedChatId : null,
    conversation:
      data.conversation && typeof data.conversation === "object"
        ? (data.conversation as NestConversationDetail)
        : null,
  });
}

async function searchNestCustomers(query: string): Promise<NestLightspeedCustomer[]> {
  const search = new URLSearchParams({ customerSearch: "1", q: query });
  const res = await fetch(`/api/store/nest-messages?${search.toString()}`, { cache: "no-store" });
  const data = (await res.json()) as { customers?: NestLightspeedCustomer[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Could not search customers.");
  return Array.isArray(data.customers) ? data.customers.slice(0, 8) : [];
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

async function startNestMessage(
  mobile: string,
  content: string,
  customerName?: string,
): Promise<{ chatId: string; message: NestConversationMessage }> {
  const res = await fetch("/api/store/nest-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "start_message",
      mobile,
      content,
      ...(customerName ? { customerName } : {}),
    }),
  });
  const data = (await res.json()) as {
    chatId?: string;
    message?: NestConversationMessage;
    error?: string;
  };
  if (!res.ok || !data.chatId || !data.message) {
    throw new Error(data.error || "Could not start message.");
  }
  return { chatId: data.chatId, message: data.message };
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={`${part}-${index}`} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </span>
  );
}

function ConversationRow({
  chat,
  active,
  onClick,
}: {
  chat: NestConversationListItem;
  active: boolean;
  onClick: () => void;
}) {
  const unread = isConversationUnread(chat);
  const displayTitle = chat.displayName || chat.title || chat.participantHandle || chat.chatId;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-md px-2.5 py-2 text-left transition-colors",
        active ? "bg-gray-100" : unread ? "bg-white hover:bg-gray-50" : "hover:bg-gray-50",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex min-w-0 flex-1 gap-2",
            unread && !active ? "items-start" : "items-center",
          )}
        >
          {unread && !active ? (
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-900" aria-label="Unread" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-[13px] text-gray-900",
                unread && !active ? "font-medium" : "font-normal",
              )}
            >
              {displayTitle}
            </p>
            {displayTitle !== chat.participantHandle && chat.participantHandle ? (
              <p className="mt-0.5 truncate text-xs text-gray-500">{chat.participantHandle}</p>
            ) : null}
            {unread && !active && chat.preview ? (
              <p className="mt-1 line-clamp-2 text-xs leading-snug text-gray-500">{chat.preview}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {chat.hasManualMessages ? (
              <span className={NEST_INBOX_BADGE_CLASS}>Manual</span>
            ) : null}
            {unread && !active ? (
              <span className={cn(NEST_INBOX_BADGE_CLASS, "text-gray-900")}>New</span>
            ) : null}
            <span className="text-xs text-gray-500">{formatListTime(chat.lastMessageAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function ThreadMessage({ message }: { message: NestConversationMessage }) {
  const isStaff = typeof message.handle === "string" && message.handle.startsWith("staff@");
  const isManual = isManualMessage(message);
  const kind =
    message.role === "system" ? "system" : message.role === "user" ? "user" : "assistant";
  const bubbles =
    kind === "assistant" ? splitAssistantBubbles(message.content) : [message.content];

  return (
    <div
      className={cn(
        "flex",
        kind === "user" ? "justify-end" : kind === "system" ? "justify-center" : "justify-start",
      )}
    >
      <div className={cn("max-w-[88%] space-y-1.5", kind === "user" && "items-end")}>
        {bubbles.map((bubble, index) => (
          <div
            key={`${message.id}-${index}`}
            className={cn(
              "rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
              kind === "user" && "rounded-br-md bg-[#37A9FD] text-white",
              kind === "assistant" &&
                !isStaff &&
                "rounded-bl-md border border-gray-200 bg-white text-gray-900",
              kind === "assistant" &&
                isStaff &&
                "rounded-bl-md border border-gray-200 bg-[#f0fdf4] text-gray-900",
              kind === "system" &&
                "rounded-md border border-gray-200 bg-white text-center text-gray-500",
            )}
          >
            <RichText text={bubble} />
          </div>
        ))}
        <div
          className={cn(
            "flex items-center gap-1.5 px-1",
            kind === "user" ? "justify-end" : "justify-start",
          )}
        >
          {isStaff ? (
            <span className={cn(NEST_INBOX_BADGE_CLASS, "text-gray-500")}>You</span>
          ) : null}
          {isManual ? (
            <span className={cn(NEST_INBOX_BADGE_CLASS, "text-gray-500")}>Manual</span>
          ) : null}
          <p className="text-[11px] text-gray-500">{formatMessageTime(message.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}

function ComposeBox({
  chatId,
  onSent,
}: {
  chatId: string;
  onSent: (message: NestConversationMessage) => void;
}) {
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
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
    if (!content || sending) return;
    setSending(true);
    setSendErr(null);
    try {
      const message = await sendNestMessage(chatId, content);
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      onSent(message);
    } catch (error) {
      setSendErr(error instanceof Error ? error.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-3.5 py-3 md:px-4">
      {sendErr ? <p className="mb-2 text-xs text-red-600">{sendErr}</p> : null}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {QUICK_REPLIES.map((snippet) => (
          <button
            key={snippet}
            type="button"
            onClick={() => {
              setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet));
              requestAnimationFrame(() => textareaRef.current?.focus());
            }}
            disabled={sending}
            className="inline-flex max-w-full items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="truncate">{snippet}</span>
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <textarea
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
          placeholder="Reply as the business"
          className={cn(INBOX_INPUT_CLASS, "min-h-[40px] flex-1 resize-none overflow-hidden leading-relaxed")}
          style={{ height: "auto" }}
          disabled={sending}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!text.trim() || sending}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
            text.trim() && !sending
              ? "bg-gray-900 text-white hover:bg-gray-800"
              : "cursor-not-allowed bg-gray-100 text-gray-400",
          )}
          aria-label="Send"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              Send
            </>
          )}
        </button>
      </div>
    </div>
  );
}

async function fetchNestMessageTemplates(): Promise<{
  templates: NestMessageTemplateSettings;
  storeName: string | null;
}> {
  const res = await fetch("/api/store/nest-settings", { cache: "no-store" });
  const data = (await res.json()) as {
    templates?: NestMessageTemplateSettings;
    storeName?: string | null;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "Could not load message settings.");
  return {
    templates: data.templates ?? { intro: "Hi {name},", signoff: "— {store}" },
    storeName: data.storeName ?? null,
  };
}

async function saveNestMessageTemplates(templates: NestMessageTemplateSettings): Promise<void> {
  const res = await fetch("/api/store/nest-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(templates),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Could not save message settings.");
}

function NestMessageTemplatesSettings() {
  const [intro, setIntro] = React.useState("Hi {name},");
  const [signoff, setSignoff] = React.useState("— {store}");
  const [storeName, setStoreName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchNestMessageTemplates()
      .then((data) => {
        if (cancelled) return;
        setIntro(data.templates.intro);
        setSignoff(data.templates.signoff);
        setStoreName(data.storeName);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load message settings.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = formatNestOutboundMessage("Your wheel true is ready for pickup.", {
    firstName: "Tom",
    storeName,
    templates: { intro, signoff },
  });

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveNestMessageTemplates({ intro: intro.trim(), signoff: signoff.trim() });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save message settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      title="Message intro and signoff"
      description="Used for outbound Nest texts such as work order pickup messages. Keep it short."
      className="mb-6"
    >
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading message settings…
        </div>
      ) : (
        <div className="space-y-4">
          {error ? (
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          ) : null}
          {saved ? (
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
              Message settings saved.
            </div>
          ) : null}

          <p className="text-xs text-gray-500">{NEST_MESSAGE_PLACEHOLDER_HINT}</p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-gray-900">Intro</span>
              <input
                type="text"
                value={intro}
                onChange={(event) => {
                  setIntro(event.target.value);
                  setSaved(false);
                }}
                placeholder="Hi {name},"
                className={INBOX_INPUT_CLASS}
                disabled={saving}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-gray-900">Signoff</span>
              <input
                type="text"
                value={signoff}
                onChange={(event) => {
                  setSignoff(event.target.value);
                  setSaved(false);
                }}
                placeholder="— {store}"
                className={INBOX_INPUT_CLASS}
                disabled={saving}
              />
            </label>
          </div>

          <div className="rounded-md border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-xs font-medium text-gray-500">Preview</p>
            <p className="mt-1 text-sm text-gray-800">{preview}</p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className={cn(
                NEST_INBOX_ICON_BUTTON_CLASS,
                "bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400",
              )}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

function StartMessageDialog({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (chatId: string, message: NestConversationMessage) => void;
}) {
  const [mobile, setMobile] = React.useState("");
  const [text, setText] = React.useState("");
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [selectedCustomerName, setSelectedCustomerName] = React.useState("");
  const [customers, setCustomers] = React.useState<NestLightspeedCustomer[]>([]);
  const [customerLoading, setCustomerLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setMobile("");
    setText("");
    setCustomerQuery("");
    setSelectedCustomerName("");
    setCustomers([]);
    setError(null);
  }, [open]);

  React.useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomers([]);
      setCustomerLoading(false);
      return;
    }
    let cancelled = false;
    setCustomerLoading(true);
    const id = window.setTimeout(() => {
      searchNestCustomers(q)
        .then((next) => {
          if (!cancelled) setCustomers(next);
        })
        .catch(() => {
          if (!cancelled) setCustomers([]);
        })
        .finally(() => {
          if (!cancelled) setCustomerLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [customerQuery]);

  async function send() {
    const mobileValue = mobile.trim();
    const content = text.trim();
    if (!mobileValue || !content || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await startNestMessage(
        mobileValue,
        content,
        selectedCustomerName || undefined,
      );
      onStarted(result.chatId, result.message);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start message");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 animate-in fade-in duration-200 sm:items-center">
      <div className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <div className={cn("flex items-start justify-between gap-4", INBOX_SECTION_HEADER_CLASS)}>
          <div>
            <h3 className="text-[13px] font-medium text-gray-900">New message</h3>
            <p className="mt-1 text-xs text-gray-500">
              Send a manual iMessage from your store. AI replies pause until the customer switches
              modes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={sending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
            aria-label="Close new message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {error ? (
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-900">Search Lightspeed customers</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Search name or mobile"
                className={cn(INBOX_INPUT_CLASS, "pl-9")}
                disabled={sending}
              />
            </div>
          </label>

          {customerLoading || customers.length > 0 ? (
            <div className="rounded-md border border-gray-200 bg-white p-2">
              {customerLoading ? (
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching Lightspeed…
                </div>
              ) : (
                <div className="space-y-1">
                  {customers.map((customer) => (
                    <button
                      key={customer.phone}
                      type="button"
                      onClick={() => {
                        setMobile(customer.phone);
                        setSelectedCustomerName(customer.name);
                        setCustomerQuery(customer.name);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {customer.name}
                        </span>
                        <span className="block truncate text-xs text-gray-500">{customer.phone}</span>
                      </span>
                      <span className={NEST_INBOX_BADGE_CLASS}>Use</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-900">Mobile number</span>
            <input
              type="tel"
              value={mobile}
              onChange={(event) => {
                setMobile(event.target.value);
                setSelectedCustomerName("");
              }}
              placeholder="0412 345 678"
              className={INBOX_INPUT_CLASS}
              disabled={sending}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-900">Message</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write your opening message"
              rows={4}
              className={cn(INBOX_INPUT_CLASS, "min-h-[120px] resize-none leading-relaxed")}
              disabled={sending}
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={sending}
            className={NEST_INBOX_ICON_BUTTON_CLASS}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!mobile.trim() || !text.trim() || sending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
              mobile.trim() && text.trim() && !sending
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "cursor-not-allowed bg-gray-100 text-gray-400",
            )}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Send message
          </button>
        </div>
      </div>
    </div>
  );
}

type NestPanelTab = "inbox" | "auto" | "settings";

export function StoreNestMessagesPanel() {
  const [activeTab, setActiveTab] = React.useState<NestPanelTab>("inbox");
  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [chats, setChats] = React.useState<NestConversationListItem[]>([]);
  const [selectedChatId, setSelectedChatId] = React.useState<string | null>(null);
  const [conversation, setConversation] = React.useState<NestConversationDetail | null>(null);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [showMobileThread, setShowMobileThread] = React.useState(false);
  const [newMessageOpen, setNewMessageOpen] = React.useState(false);
  const threadRef = React.useRef<HTMLDivElement>(null);

  const loadList = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchNestConversations({ listOnly: true });
      setConfigured(true);
      setChats(sortChats(data.chats));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load messages.";
      if (message.includes("not configured")) {
        setConfigured(false);
      } else {
        setConfigured(true);
        setError(message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadThread = React.useCallback(async (chatId: string, silent = false) => {
    if (!silent) setThreadLoading(true);
    try {
      const data = await fetchNestConversations({ chatId, threadOnly: true });
      setConversation(data.conversation);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Could not load conversation.");
      }
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  React.useEffect(() => {
    if (!selectedChatId) {
      setConversation(null);
      return;
    }
    void loadThread(selectedChatId);
  }, [selectedChatId, loadThread]);

  React.useEffect(() => {
    if (activeTab !== "inbox") return;
    const listInterval = window.setInterval(() => {
      void loadList(true);
    }, 20_000);
    return () => window.clearInterval(listInterval);
  }, [activeTab, loadList]);

  React.useEffect(() => {
    if (activeTab !== "inbox" || !selectedChatId) return;
    const threadInterval = window.setInterval(() => {
      void loadThread(selectedChatId, true);
    }, 5_000);
    return () => window.clearInterval(threadInterval);
  }, [activeTab, selectedChatId, loadThread]);

  React.useEffect(() => {
    if (!conversation || !threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [conversation?.messages.length, selectedChatId]);

  function openConversation(chat: NestConversationListItem) {
    markConversationRead(chat);
    setSelectedChatId(chat.chatId);
    setShowMobileThread(true);
  }

  function handleSent(message: NestConversationMessage) {
    if (!selectedChatId) return;
    setConversation((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, message],
          }
        : prev,
    );
    setChats((prev) =>
      sortChats(
        prev.map((chat) =>
          chat.chatId === selectedChatId
            ? {
                ...chat,
                preview: message.content.replace(/\s+/g, " ").trim().slice(0, 180),
                previewRole: message.role,
                lastMessageAt: message.createdAt,
                hasManualMessages: true,
                latestManualMessageAt: message.createdAt,
              }
            : chat,
        ),
      ),
    );
  }

  function handleStarted(chatId: string, message: NestConversationMessage) {
    setChats((prev) =>
      sortChats([
        {
          chatId,
          title: message.metadata?.customer_name
            ? String(message.metadata.customer_name)
            : chatId,
          displayName:
            typeof message.metadata?.customer_name === "string"
              ? message.metadata.customer_name
              : null,
          participantHandle:
            typeof message.metadata?.recipient_phone_e164 === "string"
              ? message.metadata.recipient_phone_e164
              : null,
          preview: message.content.replace(/\s+/g, " ").trim().slice(0, 180),
          previewRole: message.role,
          lastMessageAt: message.createdAt,
          hasManualMessages: true,
          latestManualMessageAt: message.createdAt,
          source: "customer",
        },
        ...prev.filter((chat) => chat.chatId !== chatId),
      ]),
    );
    setSelectedChatId(chatId);
    setConversation({
      chatId,
      title: chatId,
      displayName: null,
      participantHandle: null,
      source: "customer",
      lastSeen: null,
      messages: [message],
    });
    setShowMobileThread(true);
  }

  async function refreshAll() {
    setRefreshing(true);
    await loadList(true);
    if (selectedChatId) {
      await loadThread(selectedChatId, true);
    }
    setRefreshing(false);
  }

  const unreadCount = chats.filter(isConversationUnread).length;

  const tabDescription =
    activeTab === "inbox"
      ? "Customer iMessage conversations for your store. View threads, reply manually, or start a new message."
      : activeTab === "auto"
        ? "Customers due for a general or full service based on Lightspeed sales history."
        : "Message templates and dismissed pickup suggestions.";

  return (
    <>
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Image
              src="/nest-logo.png"
              alt="Nest"
              width={28}
              height={28}
              className="h-7 w-7 rounded-md object-contain"
            />
            <div>
              <h2 className="text-base font-medium text-gray-900">Nest</h2>
              <p className="mt-0.5 text-sm text-gray-500">{tabDescription}</p>
            </div>
          </div>

          {activeTab === "inbox" ? (
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? (
                <span className={cn(NEST_INBOX_BADGE_CLASS, "px-2 py-1 text-xs text-gray-900")}>
                  {unreadCount} unread
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing}
                className={NEST_INBOX_ICON_BUTTON_CLASS}
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setNewMessageOpen(true)}
                disabled={configured === false}
                className={cn(
                  NEST_INBOX_ICON_BUTTON_CLASS,
                  "bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                New message
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("inbox")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "inbox"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Inbox size={15} />
            Inbox
            {unreadCount > 0 ? (
              <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                {unreadCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("auto")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "auto"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Sparkles size={15} />
            Auto
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "settings"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Settings size={15} />
            Settings
          </button>
        </div>
      </div>

      {activeTab === "inbox" ? (
        <SettingsSection title="Messages" contentClassName="p-0">
          {configured === false ? (
            <div className="rounded-md border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
              Nest messaging is not configured for this environment yet. Add Nest Supabase and portal
              API environment variables to enable the inbox.
            </div>
          ) : loading && chats.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="rounded-md border border-gray-200 bg-white px-4 py-6 text-sm text-red-600">
              {error}
            </div>
          ) : (
            <div className="flex h-[min(70vh,640px)] min-h-[480px] flex-col overflow-hidden rounded-md border border-gray-200 bg-white md:flex-row">
              <aside
                className={cn(
                  "flex h-full min-h-0 w-full shrink-0 flex-col border-gray-200 bg-white md:w-[300px] md:border-r",
                  showMobileThread ? "hidden md:flex" : "flex",
                )}
              >
                <div className={cn("shrink-0", INBOX_SECTION_HEADER_CLASS)}>
                  <p className="text-[13px] font-medium text-gray-900">Threads</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {chats.length} conversation{chats.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {chats.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
                      <p className="text-[13px] font-medium text-gray-900">No conversations yet</p>
                      <p className="mt-1 text-xs text-gray-500">
                        When messages land for your store, they will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {chats.map((chat) => (
                        <ConversationRow
                          key={chat.chatId}
                          chat={chat}
                          active={chat.chatId === selectedChatId}
                          onClick={() => openConversation(chat)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </aside>

              <section
                className={cn(
                  "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white",
                  showMobileThread ? "flex" : "hidden md:flex",
                )}
              >
                {!selectedChatId || !conversation ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                    <div>
                      <p className="text-[13px] font-medium text-gray-900">Select a conversation</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Choose a thread to view messages and reply.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={cn("shrink-0", INBOX_SECTION_HEADER_CLASS)}>
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 md:hidden"
                          onClick={() => setShowMobileThread(false)}
                          aria-label="Back to inbox"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-gray-900">
                            {conversation.title}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-500">
                            {conversation.participantHandle ?? conversation.chatId}
                          </p>
                          {formatLastSeen(conversation.lastSeen) ? (
                            <p className="mt-1 text-xs text-gray-500">
                              Last seen {formatLastSeen(conversation.lastSeen)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div
                      ref={threadRef}
                      className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3.5 py-4 md:px-4"
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      {threadLoading && conversation.messages.length === 0 ? (
                        <div className="flex h-full items-center justify-center py-12">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading conversation…
                          </div>
                        </div>
                      ) : (
                        conversation.messages.map((message) => (
                          <ThreadMessage key={message.id} message={message} />
                        ))
                      )}
                    </div>

                    <ComposeBox chatId={selectedChatId} onSent={handleSent} />
                  </>
                )}
              </section>
            </div>
          )}
        </SettingsSection>
      ) : null}

      {activeTab === "auto" ? <NestAutoServicePanel /> : null}

      {activeTab === "settings" ? (
        <>
          <NestMessageTemplatesSettings />
          <NestHiddenPickupSuggestionsPanel />
        </>
      ) : null}

      <StartMessageDialog
        open={newMessageOpen}
        onOpenChange={setNewMessageOpen}
        onStarted={handleStarted}
      />
    </>
  );
}

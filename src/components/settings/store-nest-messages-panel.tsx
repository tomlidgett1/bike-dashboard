"use client";

import * as React from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { NestPickupSuggestionsDropdown } from "@/components/settings/nest-pickup-suggestions-dropdown";
import {
  NEST_OVERLAY_INNER_RADIUS_CLASS,
  NEST_OVERLAY_RADIUS_CLASS,
} from "@/components/settings/nest-pickup-suggestion-ui";
import {
  isNestConversationUnread,
  markNestConversationRead,
} from "@/lib/nest/conversation-read-state";

const NEST_TAB_BUTTON_CLASS =
  "flex shrink-0 items-center gap-1.5 border-b-2 pb-3 pt-1 text-sm font-medium transition-colors";

function nestTabClass(isActive: boolean) {
  return cn(
    NEST_TAB_BUTTON_CLASS,
    isActive
      ? "border-gray-900 text-gray-900"
      : "border-transparent text-gray-500 hover:border-gray-200 hover:text-gray-900",
  );
}

const IMESSAGE_OUTGOING = "#007AFF";
const IMESSAGE_INCOMING = "#E9E9EB";
const IMESSAGE_AI = "#F2F2F7";

const IMAGE_URL_PATTERN =
  /^https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp|avif)(?:\?[^\s]*)?$/i;

function isImageUrl(text: string): boolean {
  return IMAGE_URL_PATTERN.test(text.trim());
}

function NestChatBubble({
  children,
  variant,
  showTail = true,
  dense = false,
}: {
  children: React.ReactNode;
  variant: "incoming" | "outgoing" | "ai" | "system";
  showTail?: boolean;
  dense?: boolean;
}) {
  if (variant === "system") {
    return (
      <div className="rounded-full bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground">
        {children}
      </div>
    );
  }

  const isOutgoing = variant === "outgoing";
  const color = isOutgoing ? IMESSAGE_OUTGOING : variant === "ai" ? IMESSAGE_AI : IMESSAGE_INCOMING;

  return (
    <div className="relative max-w-full">
      <div
        className={cn(
          "relative overflow-visible text-[15px] leading-snug",
          dense ? "p-0.5" : "px-3 py-2",
          isOutgoing
            ? cn("rounded-[18px] text-white", showTail ? "rounded-br-[4px]" : "rounded-br-[18px]")
            : cn("rounded-[18px] text-foreground", showTail ? "rounded-bl-[4px]" : "rounded-bl-[18px]"),
        )}
        style={{ backgroundColor: color }}
      >
        {children}
        {showTail ? (
          <>
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute bottom-0 h-5 w-5",
                isOutgoing
                  ? "right-[-7px] rounded-bl-[16px_14px]"
                  : "left-[-7px] rounded-br-[16px_14px]",
              )}
              style={{ backgroundColor: color }}
            />
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute bottom-0 h-5 w-[26px] bg-white",
                isOutgoing ? "right-[-26px] rounded-bl-[10px]" : "left-[-26px] rounded-br-[10px]",
              )}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

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

function messageSide(message: NestConversationMessage): "outgoing" | "incoming" | "system" {
  const isStaff =
    (typeof message.handle === "string" && message.handle.startsWith("staff@")) ||
    isManualMessage(message);
  if (message.role === "system") return "system";
  if (isStaff) return "outgoing";
  return "incoming";
}

function sameMessageGroup(a: NestConversationMessage, b: NestConversationMessage): boolean {
  return messageSide(a) === messageSide(b) && messageSide(a) !== "system";
}

function sortChats(chats: NestConversationListItem[]): NestConversationListItem[] {
  return [...chats].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
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
  const data = (await res.json()) as {
    customers?: NestLightspeedCustomer[];
    error?: string;
    lightspeedConnected?: boolean;
  };

  if (!res.ok || data.error) {
    throw new Error(data.error || "Could not search Lightspeed customers.");
  }

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
  const unread = isNestConversationUnread(chat);
  const displayTitle = chat.displayName || chat.title || chat.participantHandle || chat.chatId;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-gray-300 bg-muted/50"
          : "border-transparent hover:border-gray-200 hover:bg-muted/30",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            unread && !active ? "bg-primary" : "bg-transparent",
          )}
          aria-hidden={!unread || active}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "truncate text-sm text-foreground",
                unread && !active ? "font-medium" : "font-normal",
              )}
            >
              {displayTitle}
            </p>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatListTime(chat.lastMessageAt)}
            </span>
          </div>
          {chat.preview ? (
            <p
              className={cn(
                "mt-0.5 truncate text-xs text-muted-foreground",
                unread && !active && "text-foreground/80",
              )}
            >
              {chat.preview}
            </p>
          ) : displayTitle !== chat.participantHandle && chat.participantHandle ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{chat.participantHandle}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function ThreadMessage({
  message,
  showTail = true,
}: {
  message: NestConversationMessage;
  showTail?: boolean;
}) {
  const isStaff =
    (typeof message.handle === "string" && message.handle.startsWith("staff@")) ||
    isManualMessage(message);
  const isCustomer = message.role === "user";
  const isSystem = message.role === "system";
  const isAi = message.role === "assistant" && !isStaff;
  const isOutgoing = isStaff;
  const bubbles =
    message.role === "assistant" ? splitAssistantBubbles(message.content) : [message.content];

  const bubbleVariant = isOutgoing ? "outgoing" : isAi ? "ai" : isCustomer ? "incoming" : "system";

  return (
    <div
      className={cn(
        "flex px-1",
        isSystem ? "justify-center" : isOutgoing ? "justify-end" : "justify-start",
      )}
    >
      <div className={cn("max-w-[min(78%,28rem)] space-y-1", isOutgoing && "items-end")}>
        {isAi ? (
          <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Nest
          </p>
        ) : null}
        {bubbles.map((bubble, index) => {
          const trimmed = bubble.trim();
          const imageOnly = isImageUrl(trimmed);

          return (
            <NestChatBubble
              key={`${message.id}-${index}`}
              variant={bubbleVariant}
              showTail={showTail && index === bubbles.length - 1}
              dense={imageOnly}
            >
              {imageOnly ? (
                <div className="overflow-hidden rounded-[14px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={trimmed}
                    alt="Shared image"
                    className="block max-h-72 max-w-full object-cover"
                  />
                </div>
              ) : (
                <RichText text={bubble} />
              )}
            </NestChatBubble>
          );
        })}
        {!isSystem ? (
          <p
            className={cn(
              "px-1 text-[11px] text-muted-foreground",
              isOutgoing ? "text-right" : "text-left",
            )}
          >
            {formatMessageTime(message.createdAt)}
            {isStaff ? " · You" : null}
          </p>
        ) : null}
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
    <div className="shrink-0 border-t border-gray-200/80 bg-white/90 px-4 py-3 backdrop-blur-sm md:px-5">
      {sendErr ? (
        <div className="mb-3 rounded-md border border-destructive/20 bg-white px-3 py-2 text-sm text-destructive">
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
            disabled={sending}
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
            placeholder="iMessage"
            className="max-h-[132px] min-h-[28px] flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[15px] leading-snug shadow-none focus-visible:ring-0"
            style={{ height: "auto" }}
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim() || sending}
            className={cn(
              "mb-0.5 h-8 w-8 shrink-0 rounded-full",
              text.trim() ? "bg-[#007AFF] text-white hover:bg-[#007AFF]/90" : "bg-transparent text-gray-400",
            )}
            aria-label="Send message"
          >
            {sending ? (
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
            <div className="space-y-2">
              <Label htmlFor="nest-intro">Intro</Label>
              <Input
                id="nest-intro"
                type="text"
                value={intro}
                onChange={(event) => {
                  setIntro(event.target.value);
                  setSaved(false);
                }}
                placeholder="Hi {name},"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nest-signoff">Signoff</Label>
              <Input
                id="nest-signoff"
                type="text"
                value={signoff}
                onChange={(event) => {
                  setSignoff(event.target.value);
                  setSaved(false);
                }}
                placeholder="— {store}"
                disabled={saving}
              />
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <p className="mt-1 text-sm text-foreground">{preview}</p>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </Button>
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
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
  const [customers, setCustomers] = React.useState<NestLightspeedCustomer[]>([]);
  const [customerLoading, setCustomerLoading] = React.useState(false);
  const [customerSearchError, setCustomerSearchError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setMobile("");
    setText("");
    setCustomerQuery("");
    setSelectedCustomerName("");
    setSelectedCustomerId(null);
    setCustomers([]);
    setCustomerSearchError(null);
    setError(null);
  }, [open]);

  React.useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomers([]);
      setCustomerLoading(false);
      setCustomerSearchError(null);
      return;
    }
    let cancelled = false;
    setCustomerLoading(true);
    setCustomerSearchError(null);
    const id = window.setTimeout(() => {
      searchNestCustomers(q)
        .then((next) => {
          if (!cancelled) setCustomers(next);
        })
        .catch((err) => {
          if (!cancelled) {
            setCustomers([]);
            setCustomerSearchError(
              err instanceof Error ? err.message : "Could not search Lightspeed customers.",
            );
          }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(40rem,90vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
          NEST_OVERLAY_RADIUS_CLASS,
        )}
        overlayClassName="animate-in fade-in duration-200"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <div className="flex items-start gap-3 pr-8">
            <Image
              src="/nest-logo.png"
              alt="Nest"
              width={28}
              height={28}
              className="shrink-0 rounded-full"
            />
            <div className="space-y-1.5">
              <DialogTitle>New message</DialogTitle>
              <DialogDescription>
                Search Lightspeed, choose a customer, and send a manual iMessage from your store.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          {error ? (
            <div
              className={cn(
                "border border-destructive/20 bg-white px-3 py-2.5 text-sm text-destructive",
                NEST_OVERLAY_INNER_RADIUS_CLASS,
              )}
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="nest-customer-search">Search Lightspeed customers</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="nest-customer-search"
                type="search"
                value={customerQuery}
                onChange={(event) => {
                  setCustomerQuery(event.target.value);
                  setSelectedCustomerName("");
                  setSelectedCustomerId(null);
                }}
                placeholder="Search name, mobile, or customer ID"
                className="pl-8"
                disabled={sending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Customer matches</Label>
            <div
              className={cn(
                "max-h-52 overflow-y-auto border border-border",
                NEST_OVERLAY_INNER_RADIUS_CLASS,
              )}
            >
              <div className="space-y-0.5 p-2">
                {customerQuery.trim().length < 2 ? (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                    Type at least 2 characters to search Lightspeed customers.
                  </p>
                ) : customerLoading ? (
                  <div className="flex items-center justify-center gap-2 px-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching Lightspeed…
                  </div>
                ) : customerSearchError ? (
                  <p className="px-2 py-8 text-center text-sm text-destructive">{customerSearchError}</p>
                ) : customers.length > 0 ? (
                  customers.map((customer) => (
                    <button
                      key={customer.customerId}
                      type="button"
                      onClick={() => {
                        setMobile(customer.phone);
                        setSelectedCustomerName(customer.name);
                        setSelectedCustomerId(customer.customerId);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 p-2.5 text-left transition-colors hover:bg-accent/60",
                        NEST_OVERLAY_INNER_RADIUS_CLASS,
                        selectedCustomerId === customer.customerId && "bg-accent/60",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {customer.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {customer.phone}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">Use</span>
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                    No Lightspeed customers matched that search.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nest-mobile">Mobile number</Label>
            <Input
              id="nest-mobile"
              type="tel"
              value={mobile}
              onChange={(event) => {
                setMobile(event.target.value);
                setSelectedCustomerName("");
                setSelectedCustomerId(null);
              }}
              placeholder="0412 345 678"
              disabled={sending}
            />
            {selectedCustomerName ? (
              <p className="text-xs text-muted-foreground">Sending to {selectedCustomerName}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nest-opening-message">Message</Label>
            <Textarea
              id="nest-opening-message"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write your opening message"
              rows={5}
              className="min-h-[140px] resize-none"
              disabled={sending}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void send()}
            disabled={!mobile.trim() || !text.trim() || sending}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type NestPanelTab = "inbox" | "auto" | "settings";

export function StoreNestMessagesPanel() {
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams.get("chatId");
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
  const [searchQuery, setSearchQuery] = React.useState("");
  const threadRef = React.useRef<HTMLDivElement>(null);

  const filteredChats = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((chat) => {
      const haystack = [
        chat.displayName,
        chat.title,
        chat.participantHandle,
        chat.preview,
        chat.chatId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [chats, searchQuery]);

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
    if (!chatIdFromUrl || loading) return;
    const chat = chats.find((item) => item.chatId === chatIdFromUrl);
    if (!chat) return;
    setActiveTab("inbox");
    setSelectedChatId(chat.chatId);
    setShowMobileThread(true);
    markNestConversationRead(chat);
  }, [chatIdFromUrl, chats, loading]);

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
    markNestConversationRead(chat);
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

  const unreadCount = chats.filter(isNestConversationUnread).length;

  const inboxToolbar =
    activeTab === "inbox" ? (
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refreshAll()}
          disabled={refreshing}
          className="gap-1.5"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
        <NestPickupSuggestionsDropdown
          disabled={configured === false}
          onMessageSent={() => void refreshAll()}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => setNewMessageOpen(true)}
          disabled={configured === false}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          New message
        </Button>
      </div>
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-end justify-between gap-3 border-b border-gray-200 px-4 pt-3 md:px-5">
        <nav
          className="-mb-px flex min-w-0 gap-5 overflow-x-auto"
          aria-label="Nest sections"
        >
          <button
            type="button"
            onClick={() => setActiveTab("inbox")}
            className={nestTabClass(activeTab === "inbox")}
          >
            <Inbox size={15} />
            Inbox
            {unreadCount > 0 ? (
              <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[10px] font-medium">
                {unreadCount}
              </Badge>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("auto")}
            className={nestTabClass(activeTab === "auto")}
          >
            <Sparkles size={15} />
            Auto
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={nestTabClass(activeTab === "settings")}
          >
            <Settings size={15} />
            Settings
          </button>
        </nav>
        {inboxToolbar ? (
          <div className="flex shrink-0 items-center gap-2 pb-3">{inboxToolbar}</div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {activeTab === "inbox" ? (
        <>
          {configured === false ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
              Nest messaging is not configured for this environment yet.
            </div>
          ) : loading && chats.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-1 overflow-hidden md:flex-row">
              <aside
                className={cn(
                  "flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-gray-200 bg-[#f6f6f6] md:h-full md:w-[min(340px,34%)] md:max-w-[380px] md:flex-none md:border-r",
                  showMobileThread ? "hidden md:flex" : "flex flex-1",
                )}
              >
                <div className="shrink-0 border-b border-gray-200/80 bg-[#f6f6f6] px-4 py-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search"
                      className="rounded-md border-gray-300 bg-white pl-9"
                    />
                  </div>
                  {unreadCount > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {unreadCount} unread conversation{unreadCount === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
                <div
                  className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  <div className="space-y-0.5 p-2">
                    {filteredChats.length === 0 ? (
                      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                        <Inbox className="mb-3 h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                        <p className="text-sm font-medium text-foreground">
                          {searchQuery.trim() ? "No matches" : "No conversations"}
                        </p>
                        <p className="mt-1.5 max-w-[220px] text-xs leading-relaxed text-muted-foreground">
                          {searchQuery.trim()
                            ? "Try a different name, number, or message."
                            : "When customers message your store, conversations appear here."}
                        </p>
                      </div>
                    ) : (
                      filteredChats.map((chat) => (
                        <ConversationRow
                          key={chat.chatId}
                          chat={chat}
                          active={chat.chatId === selectedChatId}
                          onClick={() => openConversation(chat)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </aside>

              <section
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white md:h-full",
                  showMobileThread ? "flex" : "hidden md:flex",
                )}
              >
                {!selectedChatId || !conversation ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
                    <Inbox className="mb-3 h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
                    <p className="text-base font-semibold tracking-tight text-foreground">
                      Select a message
                    </p>
                    <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                      Choose a conversation from the list to read and reply.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="shrink-0 border-b border-gray-200/80 bg-white/95 px-4 py-3 backdrop-blur-sm md:px-5">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="md:hidden"
                          onClick={() => setShowMobileThread(false)}
                          aria-label="Back to inbox"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <div className="min-w-0 flex-1 text-center md:text-left">
                          <p className="truncate text-sm text-muted-foreground">
                            To:{" "}
                            <span className="font-medium text-foreground">
                              {conversation.displayName || conversation.title}
                            </span>
                          </p>
                          {conversation.participantHandle ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {conversation.participantHandle}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div
                      ref={threadRef}
                      className="h-0 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-white px-5 py-5 md:px-10"
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      {threadLoading && conversation.messages.length === 0 ? (
                        <div className="flex h-full items-center justify-center py-16">
                          <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                        </div>
                      ) : (
                        conversation.messages.map((message, index) => {
                          const nextMessage = conversation.messages[index + 1];
                          const showTail = !nextMessage || !sameMessageGroup(message, nextMessage);
                          return (
                            <ThreadMessage
                              key={message.id}
                              message={message}
                              showTail={showTail}
                            />
                          );
                        })
                      )}
                    </div>

                    <ComposeBox chatId={selectedChatId} onSent={handleSent} />
                  </>
                )}
              </section>
            </div>
          )}
        </>
      ) : null}

      {activeTab === "auto" ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
          <NestAutoServicePanel />
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
          <NestMessageTemplatesSettings />
          <NestHiddenPickupSuggestionsPanel />
        </div>
      ) : null}
      </div>

      <StartMessageDialog
        open={newMessageOpen}
        onOpenChange={setNewMessageOpen}
        onStarted={handleStarted}
      />
    </div>
  );
}

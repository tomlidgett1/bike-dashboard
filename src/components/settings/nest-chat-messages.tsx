"use client";

import * as React from "react";
import { Bot } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { NestConversationMessage } from "@/lib/nest/types";

/** Manual staff send — classic iMessage blue */
export const IMESSAGE_OUTGOING = "#007AFF";
/** Nest bot send — lighter sky blue so it reads differently from staff */
export const IMESSAGE_BOT = "#5AC8FA";
export const IMESSAGE_INCOMING = "#E9E9EB";
export const IMESSAGE_AI = "#F2F2F7";

const IMAGE_URL_PATTERN =
  /^https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp|avif|heic|heif)(?:\?[^\s]*)?$/i;
const LINQ_CDN_PATTERN = /^https?:\/\/cdn\.linqapp\.com\/[^\s]+$/i;
const ANY_HTTP_URL_PATTERN = /https?:\/\/[^\s]+/gi;

const SYNTHETIC_INBOUND_PLACEHOLDERS = new Set([
  "what's in this image?",
  "whats in this image?",
]);

function isSyntheticInboundPlaceholder(text: string): boolean {
  return SYNTHETIC_INBOUND_PLACEHOLDERS.has(text.trim().toLowerCase());
}

function isImageUrl(text: string): boolean {
  const trimmed = text.trim();
  return IMAGE_URL_PATTERN.test(trimmed) || LINQ_CDN_PATTERN.test(trimmed);
}

type NestMediaItem = {
  url: string;
  mimeType?: string;
  filename?: string;
  attachmentId?: string;
};

function resolveNestMediaUrl(item: NestMediaItem): string {
  const attachmentId = item.attachmentId?.trim();
  if (attachmentId) {
    return `/api/store/linq-attachment?id=${encodeURIComponent(attachmentId)}`;
  }
  return item.url;
}

function asMediaItems(value: unknown): NestMediaItem[] {
  if (!Array.isArray(value)) return [];
  const items: NestMediaItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const attachmentId =
      typeof row.attachmentId === "string"
        ? row.attachmentId
        : typeof row.attachment_id === "string"
          ? row.attachment_id
          : undefined;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url && !attachmentId) continue;
    items.push({
      url: url || (attachmentId ? resolveNestMediaUrl({ url: "", attachmentId }) : ""),
      mimeType:
        typeof row.mimeType === "string"
          ? row.mimeType
          : typeof row.mime_type === "string"
            ? row.mime_type
            : undefined,
      filename: typeof row.filename === "string" ? row.filename : undefined,
      attachmentId,
    });
  }
  return items;
}

function extractImageUrlsFromContent(content: string): string[] {
  const matches = content.match(ANY_HTTP_URL_PATTERN) ?? [];
  return matches.map((url) => url.trim()).filter((url) => isImageUrl(url));
}

function stripImageUrlsFromContent(content: string, imageUrls: string[]): string {
  let next = content;
  for (const url of imageUrls) {
    next = next.split(url).join(" ");
  }
  return next.replace(/\s+/g, " ").trim();
}

function messageMedia(message: NestConversationMessage): {
  images: NestMediaItem[];
  text: string;
} {
  const fromMeta = asMediaItems(message.metadata?.images).filter((item) => {
    if (item.attachmentId) return true;
    if (item.mimeType?.startsWith("image/")) return true;
    return isImageUrl(item.url);
  });
  const fromContent: NestMediaItem[] = extractImageUrlsFromContent(message.content).map((url) => ({
    url,
  }));
  const seen = new Set<string>();
  const images: NestMediaItem[] = [];
  for (const item of [...fromMeta, ...fromContent]) {
    const key = item.attachmentId?.trim() || item.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    images.push(item);
  }
  const text = stripImageUrlsFromContent(message.content, images.map((item) => item.url));
  if (isSyntheticInboundPlaceholder(text)) {
    return { images, text: "" };
  }
  return { images, text };
}

export function RichText({ text }: { text: string }) {
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

type BubbleVariant =
  | "incoming"
  | "outgoing"
  | "bot"
  | "ai"
  | "system"
  | "store-left"
  | "store-bot-left"
  | "customer-right";

function bubbleColor(variant: BubbleVariant): string {
  switch (variant) {
    case "outgoing":
    case "store-left":
      return IMESSAGE_OUTGOING;
    case "bot":
    case "store-bot-left":
      return IMESSAGE_BOT;
    case "ai":
      return IMESSAGE_AI;
    case "incoming":
    case "customer-right":
      return IMESSAGE_INCOMING;
    default:
      return IMESSAGE_INCOMING;
  }
}

function isBlueBubble(variant: BubbleVariant): boolean {
  return (
    variant === "outgoing" ||
    variant === "bot" ||
    variant === "store-left" ||
    variant === "store-bot-left"
  );
}

function isRightSideBubble(variant: BubbleVariant): boolean {
  return variant === "outgoing" || variant === "bot" || variant === "customer-right";
}

export function NestChatBubble({
  children,
  variant,
  showTail = true,
  dense = false,
}: {
  children: React.ReactNode;
  variant: BubbleVariant;
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

  const isRightSide = isRightSideBubble(variant);
  const isBlue = isBlueBubble(variant);
  const color = bubbleColor(variant);

  return (
    <div className="relative max-w-full">
      <div
        className={cn(
          "relative overflow-visible text-[15px] leading-snug",
          dense ? "p-0.5" : "px-3 py-2",
          isRightSide
            ? cn(
                isBlue ? "text-white" : "text-foreground",
                "rounded-[18px]",
                showTail ? "rounded-br-[4px]" : "rounded-br-[18px]",
              )
            : cn(
                isBlue ? "text-white" : "text-foreground",
                "rounded-[18px]",
                showTail ? "rounded-bl-[4px]" : "rounded-bl-[18px]",
              ),
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
                isRightSide
                  ? "right-[-7px] rounded-bl-[16px_14px]"
                  : "left-[-7px] rounded-br-[16px_14px]",
              )}
              style={{ backgroundColor: color }}
            />
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute bottom-0 h-5 w-[26px] bg-white",
                isRightSide ? "right-[-26px] rounded-bl-[10px]" : "left-[-26px] rounded-br-[10px]",
              )}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isManualMessage(message: NestConversationMessage): boolean {
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

export type NestBubbleLayout = "nest" | "inbox";

function isStoreSideMessage(message: NestConversationMessage): boolean {
  const isStaff =
    (typeof message.handle === "string" && message.handle.startsWith("staff@")) ||
    isManualMessage(message);
  return message.role === "assistant" || isStaff;
}

function messageSide(
  message: NestConversationMessage,
  layout: NestBubbleLayout = "nest",
): "outgoing" | "bot" | "incoming" | "system" | "store" | "store-bot" | "customer" {
  if (message.role === "system") return "system";
  const isStaff =
    (typeof message.handle === "string" && message.handle.startsWith("staff@")) ||
    isManualMessage(message);
  const isBot = message.role === "assistant" && !isStaff;

  if (layout === "inbox") {
    if (message.role === "user") return "customer";
    if (isBot) return "store-bot";
    return "store";
  }
  if (isStaff) return "outgoing";
  if (isBot) return "bot";
  return "incoming";
}

export function sameMessageGroup(
  a: NestConversationMessage,
  b: NestConversationMessage,
  layout: NestBubbleLayout = "nest",
): boolean {
  return messageSide(a, layout) === messageSide(b, layout) && messageSide(a, layout) !== "system";
}

function BotBadge({ alignEnd }: { alignEnd?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-[#5AC8FA]/40 bg-[#5AC8FA]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#0077A8]",
        alignEnd ? "self-end" : "self-start",
      )}
    >
      <Bot className="h-3 w-3" />
      Bot
    </span>
  );
}

function NestImageBubble({
  url,
  attachmentId,
  filename,
  variant,
  showTail,
}: {
  url: string;
  attachmentId?: string;
  filename?: string;
  variant: BubbleVariant;
  showTail: boolean;
}) {
  const proxySrc = attachmentId?.trim()
    ? `/api/store/linq-attachment?id=${encodeURIComponent(attachmentId.trim())}`
    : null;
  const directSrc = url.trim() || null;
  const [src, setSrc] = React.useState<string | null>(proxySrc || directSrc);

  React.useEffect(() => {
    setSrc(proxySrc || directSrc);
  }, [proxySrc, directSrc]);

  if (!src) return null;

  return (
    <NestChatBubble variant={variant} showTail={showTail} dense>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-[14px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={filename?.trim() || "Customer photo"}
          className="block max-h-72 max-w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            if (directSrc && src !== directSrc) {
              setSrc(directSrc);
            }
          }}
        />
      </a>
    </NestChatBubble>
  );
}

export function NestThreadMessage({
  message,
  showTail = true,
  layout = "nest",
}: {
  message: NestConversationMessage;
  showTail?: boolean;
  layout?: NestBubbleLayout;
}) {
  const isStaff =
    (typeof message.handle === "string" && message.handle.startsWith("staff@")) ||
    isManualMessage(message);
  const isCustomer = message.role === "user";
  const isSystem = message.role === "system";
  const isStoreSide = isStoreSideMessage(message);
  const isAi = message.role === "assistant" && !isStaff;
  const isOutgoing = layout === "nest" && isStaff;
  const { images, text } = messageMedia(message);
  const bubbles =
    message.role === "assistant"
      ? splitAssistantBubbles(text || message.content)
      : text
        ? [text]
        : [];

  // Inbox mimics text messaging from the store's perspective:
  // customer on the left (grey), store/bot on the right (blue shades).
  const bubbleVariant: BubbleVariant =
    layout === "inbox"
      ? isSystem
        ? "system"
        : isCustomer
          ? "incoming"
          : isAi
            ? "bot"
            : "outgoing"
      : isOutgoing
        ? "outgoing"
        : isAi
          ? "store-bot-left"
          : isCustomer
            ? "incoming"
            : "system";

  const alignEnd = layout === "inbox" ? isStoreSide && !isSystem : isOutgoing;
  const isPending = message.metadata?.send_state === "pending";
  const showBotBadge = isAi;
  const hasRenderableContent = images.length > 0 || bubbles.some((bubble) => bubble.trim());

  if (!hasRenderableContent && !isSystem) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex px-1",
        isSystem ? "justify-center" : alignEnd ? "justify-end" : "justify-start",
        isPending && "opacity-80",
      )}
    >
      <div className={cn("flex max-w-[min(78%,28rem)] flex-col space-y-1", alignEnd && "items-end")}>
        {showBotBadge ? <BotBadge alignEnd={alignEnd} /> : null}
        {isStaff && !isSystem ? (
          <p
            className={cn(
              "px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
              alignEnd ? "text-right" : "text-left",
            )}
          >
            Staff
          </p>
        ) : null}
        {images.map((image, index) => (
          <NestImageBubble
            key={`${message.id}-img-${index}`}
            url={image.url}
            attachmentId={image.attachmentId}
            filename={image.filename}
            variant={bubbleVariant}
            showTail={
              showTail &&
              index === images.length - 1 &&
              bubbles.every((bubble) => !bubble.trim())
            }
          />
        ))}
        {bubbles.map((bubble, index) => {
          const trimmed = bubble.trim();
          if (!trimmed) return null;
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
                    loading="lazy"
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
              alignEnd ? "text-right" : "text-left",
            )}
          >
            {formatMessageTime(message.createdAt)}
            {isStaff ? " · You" : isAi ? " · Nest" : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

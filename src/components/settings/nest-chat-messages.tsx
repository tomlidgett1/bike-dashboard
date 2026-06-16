"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { NestConversationMessage } from "@/lib/nest/types";

export const IMESSAGE_OUTGOING = "#007AFF";
export const IMESSAGE_INCOMING = "#E9E9EB";
export const IMESSAGE_AI = "#F2F2F7";

const IMAGE_URL_PATTERN =
  /^https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp|avif)(?:\?[^\s]*)?$/i;

function isImageUrl(text: string): boolean {
  return IMAGE_URL_PATTERN.test(text.trim());
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

export function NestChatBubble({
  children,
  variant,
  showTail = true,
  dense = false,
}: {
  children: React.ReactNode;
  variant: "incoming" | "outgoing" | "ai" | "system" | "store-left" | "customer-right";
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

  const isRightSide = variant === "outgoing" || variant === "customer-right";
  const isBlue =
    variant === "outgoing" || variant === "store-left";
  const color = isBlue ? IMESSAGE_OUTGOING : variant === "ai" ? IMESSAGE_AI : IMESSAGE_INCOMING;

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
): "outgoing" | "incoming" | "system" | "store" | "customer" {
  if (message.role === "system") return "system";
  if (layout === "inbox") {
    if (message.role === "user") return "customer";
    return "store";
  }
  const isStaff =
    (typeof message.handle === "string" && message.handle.startsWith("staff@")) ||
    isManualMessage(message);
  if (isStaff) return "outgoing";
  return "incoming";
}

export function sameMessageGroup(
  a: NestConversationMessage,
  b: NestConversationMessage,
  layout: NestBubbleLayout = "nest",
): boolean {
  return messageSide(a, layout) === messageSide(b, layout) && messageSide(a, layout) !== "system";
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
  const bubbles =
    message.role === "assistant" ? splitAssistantBubbles(message.content) : [message.content];

  const bubbleVariant =
    layout === "inbox"
      ? isSystem
        ? "system"
        : isCustomer
          ? "customer-right"
          : "store-left"
      : isOutgoing
        ? "outgoing"
        : isStoreSide
          ? "store-left"
          : isCustomer
            ? "incoming"
            : "system";

  const alignEnd = layout === "inbox" ? isCustomer : isOutgoing;
  const isPending = message.metadata?.send_state === "pending";

  return (
    <div
      className={cn(
        "flex px-1",
        isSystem ? "justify-center" : alignEnd ? "justify-end" : "justify-start",
        isPending && "opacity-80",
      )}
    >
      <div className={cn("max-w-[min(78%,28rem)] space-y-1", alignEnd && "items-end")}>
        {isAi && layout === "nest" ? (
          <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Nest
          </p>
        ) : null}
        {isStoreSide && layout === "inbox" && isAi ? (
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
              alignEnd ? "text-right" : "text-left",
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

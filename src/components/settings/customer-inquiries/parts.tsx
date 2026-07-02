"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ExternalLink,
  EyeOff,
  Loader2,
  Send,
  Sparkles,
  UserX,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CustomerInquiryDetail } from "@/lib/customer-inquiries/client";
import type {
  CustomerInquiryListItem,
  CustomerInquiryStatus,
} from "@/lib/customer-inquiries/types";
import type { LightspeedContext, StatusFilter } from "./use-inquiries-controller";

export const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "draft_ready", label: "Ready" },
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "sent", label: "Sent" },
  { id: "ignored", label: "Ignored" },
];

const INTENT_LABELS: Record<string, string> = {
  technical_question: "Technical",
  service_booking: "Service",
  stock_check: "Stock",
  quote_request: "Quote",
  warranty: "Warranty",
  order_status: "Order",
  general_reply: "General",
};

export function statusLabel(status: CustomerInquiryStatus): string {
  if (status === "draft_ready") return "Ready";
  if (status === "processing") return "Processing";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function intentLabel(intent: string | null | undefined): string | null {
  if (!intent) return null;
  return INTENT_LABELS[intent] ?? null;
}

export function senderName(
  item: Pick<
    CustomerInquiryListItem,
    "sender_name" | "sender_email" | "lightspeed_customer_name"
  >,
): string {
  const cached = item.lightspeed_customer_name?.trim();
  if (cached) return cached;
  return item.sender_name?.trim() || item.sender_email || "Customer";
}

export function initials(name: string): string {
  const parts = name
    .replace(/[<>"]/g, "")
    .replace(/\(.+?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

export function enquirySummary(item: CustomerInquiryListItem): string {
  const preview = firstLine(item.body_preview || item.snippet);
  if (preview) return preview.slice(0, 160);
  const subject = item.subject?.trim();
  if (subject && !/^re:/i.test(subject)) return subject;
  return "Customer enquiry";
}

export function relativeTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function fullTime(value: string | null): string {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ---------- brand marks ---------- */

export function GmailMark({ className }: { className?: string }) {
  return (
    <Image
      src="/gmail.png"
      alt="Gmail"
      width={1280}
      height={960}
      className={cn("h-3.5 w-auto object-contain", className)}
      unoptimized
    />
  );
}

export function LightspeedMark({ className }: { className?: string }) {
  return (
    <Image
      src="/ls.png"
      alt="Lightspeed"
      width={20}
      height={20}
      className={cn("h-4 w-4 rounded-full object-cover", className)}
      unoptimized
    />
  );
}

/* ---------- atoms ---------- */

export function Avatar({
  name,
  size = "md",
  muted = false,
  withGmail = false,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  muted?: boolean;
  withGmail?: boolean;
}) {
  const dims = size === "lg" ? "h-12 w-12 text-sm" : size === "sm" ? "h-9 w-9 text-[12px]" : "h-11 w-11 text-sm";
  return (
    <span className="relative shrink-0">
      <span
        className={cn(
          "flex items-center justify-center rounded-full font-semibold",
          dims,
          muted ? "bg-gray-100 text-gray-400" : "bg-gray-200/70 text-gray-700",
        )}
      >
        {initials(name)}
      </span>
      {withGmail ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-1 ring-gray-200">
          <GmailMark className="h-2.5" />
        </span>
      ) : null}
    </span>
  );
}

export function StatusChip({ status, className }: { status: CustomerInquiryStatus; className?: string }) {
  const ready = status === "draft_ready";
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] font-medium",
        ready ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-500",
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export function FilterTabs({
  value,
  onChange,
  className,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5 overflow-x-auto rounded-md bg-gray-100 p-0.5", className)}>
      {STATUS_FILTERS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            value === item.id
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- content blocks (shared by every design) ---------- */

export function MessageBlock({
  detail,
  gmailAccountEmail,
}: {
  detail: CustomerInquiryDetail;
  gmailAccountEmail?: string | null;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
        <GmailMark />
        <span>{gmailAccountEmail ? `via ${gmailAccountEmail}` : "via Gmail"}</span>
      </div>
      {detail.subject ? (
        <p className="text-sm font-semibold text-gray-900">{detail.subject}</p>
      ) : null}
      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
        {detail.body_preview || detail.snippet}
      </p>
    </div>
  );
}

export function CustomerMessageCard({
  detail,
}: {
  detail: CustomerInquiryDetail;
}) {
  const body = detail.body_preview || detail.snippet;
  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
          <GmailMark />
          {senderName(detail)} asked
        </div>
        {detail.subject ? (
          <p className="mt-1 text-sm font-semibold text-gray-900">{detail.subject}</p>
        ) : null}
      </div>
      <div className="max-h-[40vh] overflow-y-auto px-4 py-3">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">{body}</p>
      </div>
    </div>
  );
}

function gmailThreadMessages(detail: CustomerInquiryDetail) {
  if (detail.thread_messages?.length) return detail.thread_messages;
  return [
    {
      message_id: detail.id,
      role: "customer" as const,
      from: detail.sender_email,
      from_name: senderName(detail),
      body: detail.body_preview || detail.snippet,
      received_at: detail.received_at,
      date_label: null,
      is_latest_customer: true,
    },
  ];
}

function dayKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toDateString();
}

function dayLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function timeOnly(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

const GMAIL_CLAMP_THRESHOLD = 420;

function GmailMessageBody({
  body,
  clampable,
  emphasised,
}: {
  body: string;
  clampable: boolean;
  emphasised: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const shouldClamp = clampable && !expanded && body.length > GMAIL_CLAMP_THRESHOLD;

  return (
    <div>
      <p
        className={cn(
          "whitespace-pre-wrap text-[13px] leading-relaxed",
          emphasised ? "text-gray-800" : "text-gray-600",
          shouldClamp && "line-clamp-5",
        )}
      >
        {body || "—"}
      </p>
      {clampable && body.length > GMAIL_CLAMP_THRESHOLD ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800"
        >
          {expanded ? "Show less" : "Show full message"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Conversation-style email thread: customer messages sit left with an avatar,
 * shop replies sit right on a tinted card, with day separators between groups.
 * Older messages clamp so the newest exchange stays in view.
 */
export function GmailInquiryThread({ detail }: { detail: CustomerInquiryDetail }) {
  const messages = gmailThreadMessages(detail);

  return (
    <div className="space-y-4">
      {messages.map((message, index) => {
        const isShop = message.role === "shop";
        const isLatestCustomer = Boolean(message.is_latest_customer);
        const isLast = index === messages.length - 1;
        const prev = messages[index - 1];
        const showDay =
          index === 0 || dayKey(message.received_at) !== dayKey(prev?.received_at ?? null);
        const day = dayLabel(message.received_at);

        return (
          <React.Fragment key={message.message_id}>
            {showDay && day ? (
              <div className="flex items-center gap-3 py-1" aria-hidden>
                <span className="h-px flex-1 bg-gray-100" />
                <span className="text-[11px] font-medium text-gray-400">{day}</span>
                <span className="h-px flex-1 bg-gray-100" />
              </div>
            ) : null}

            <article className={cn("flex gap-2.5", isShop ? "justify-end" : "justify-start")}>
              {!isShop ? <Avatar name={message.from_name || "Customer"} size="sm" /> : null}
              <div className={cn("min-w-0 max-w-[min(88%,34rem)]", isShop && "flex flex-col items-end")}>
                <div
                  className={cn(
                    "flex items-baseline gap-2 px-1 pb-1",
                    isShop && "flex-row-reverse",
                  )}
                >
                  <p className="truncate text-[12px] font-medium text-gray-700">
                    {isShop ? "You" : message.from_name}
                  </p>
                  <time className="shrink-0 text-[11px] text-gray-400">
                    {timeOnly(message.received_at) || message.date_label || ""}
                  </time>
                </div>
                <div
                  className={cn(
                    "rounded-xl border px-3.5 py-2.5",
                    isShop
                      ? "rounded-tr-sm border-amber-200/70 bg-amber-50/70"
                      : "rounded-tl-sm border-gray-200 bg-white",
                    isLatestCustomer && messages.length > 1 && "border-gray-300 shadow-sm",
                  )}
                >
                  <GmailMessageBody
                    body={message.body}
                    clampable={!isLast && !isLatestCustomer && messages.length > 1}
                    emphasised={isLatestCustomer && messages.length > 1}
                  />
                </div>
              </div>
            </article>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** @deprecated Prefer GmailInquiryThread in the slide panel. Kept for design previews. */
export function ThreadTimeline({ detail }: { detail: CustomerInquiryDetail }) {
  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white p-4">
      <GmailInquiryThread detail={detail} />
    </div>
  );
}

export function LightspeedBody({ context }: { context: LightspeedContext }) {
  if (!context.matched) {
    return (
      <p className="text-[13px] text-gray-500">
        {context.summary || "No matching Lightspeed customer found for this sender."}
      </p>
    );
  }

  const sales = context.sales_summary;
  const money = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return "$0.00";
    return value.toLocaleString("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatPurchaseDate = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
  };

  const recentPurchases = sales?.recent_purchases ?? [];

  return (
    <div className="space-y-4 text-[13px] text-gray-700">
      {context.customer_name ? (
        <p className="text-sm font-medium text-gray-900">{context.customer_name}</p>
      ) : null}

      {sales && sales.sale_count > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-[11px] text-gray-400">Lifetime spend</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">{money(sales.total_spend)}</p>
          </div>
          <div className="rounded-md border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-[11px] text-gray-400">Purchases</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">{sales.sale_count}</p>
          </div>
        </div>
      ) : null}

      {recentPurchases.length > 0 ? (
        <div>
          <p className="text-[11px] font-medium text-gray-400">Recent purchases</p>
          <ul className="mt-1.5 space-y-2">
            {recentPurchases.map((purchase, idx) => (
              <li
                key={`${purchase.purchased_at}-${purchase.description}-${idx}`}
                className="rounded-md border border-gray-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[12px] font-medium leading-snug text-gray-900">
                    {purchase.description}
                  </p>
                  {purchase.total != null ? (
                    <p className="shrink-0 text-[12px] text-gray-600">{money(purchase.total)}</p>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  {formatPurchaseDate(purchase.purchased_at)}
                  {purchase.quantity != null && purchase.quantity !== 1
                    ? ` · Qty ${purchase.quantity}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : sales && sales.sale_count === 0 ? (
        <p className="text-[13px] text-gray-500">No completed purchases on record.</p>
      ) : null}

      {context.customer_phone ? (
        <p className="text-[12px] text-gray-500">{context.customer_phone}</p>
      ) : null}

      {context.bikes?.length ? (
        <div>
          <p className="text-[11px] font-medium text-gray-400">Bikes</p>
          <ul className="mt-1.5 space-y-1 text-[12px] text-gray-600">
            {context.bikes.map((bike, idx) => (
              <li key={`${bike.serial ?? bike.label ?? idx}`}>
                {bike.label || "Bike"}
                {bike.serial ? ` · ${bike.serial}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {context.recent_workorders?.length ? (
        <div>
          <p className="text-[11px] font-medium text-gray-400">Recent workorders</p>
          <ul className="mt-1.5 space-y-1 text-[12px] text-gray-600">
            {context.recent_workorders.map((wo) => (
              <li key={wo.id}>{wo.title || `Workorder ${wo.id}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function SourcesBody({
  citations,
}: {
  citations: Array<{ url: string; title: string; excerpt?: string | null }>;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] text-gray-400">
        Reference for staff only — not added to the customer reply.
      </p>
      <ul className="space-y-3">
        {citations.map((citation) => (
          <li key={citation.url} className="rounded-md border border-gray-200 bg-white p-3">
            <a
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 text-[13px] font-medium text-gray-800 hover:text-gray-900"
            >
              <span className="truncate">{citation.title || citation.url}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </a>
            {citation.excerpt ? (
              <blockquote className="mt-2 border-l-2 border-gray-200 pl-3 text-[12px] leading-relaxed text-gray-600">
                “{citation.excerpt}”
              </blockquote>
            ) : (
              <p className="mt-2 text-[12px] text-gray-400">No excerpt captured for this source.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Collapsible({
  title,
  icon,
  badge,
  defaultOpen = true,
  variant = "card",
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  variant?: "card" | "inline";
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const isInline = variant === "inline";

  return (
    <div className={cn(isInline ? "border-t border-gray-100 pt-4" : "rounded-md border border-gray-200 bg-white")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between text-left",
          isInline ? "pb-3" : "px-5 py-3.5",
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
          {icon}
          {title}
          {badge}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className={cn(isInline ? "pb-1" : "border-t border-gray-100 px-5 pb-5 pt-3")}>
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function MatchBadge({ matched }: { matched?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        matched ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-400",
      )}
    >
      {matched ? "Matched" : "No match"}
    </span>
  );
}

export function ReplyComposer({
  detail,
  draft,
  setDraft,
  onRegenerate,
  regenerating,
  onSend,
  onIgnore,
  onUnignore = () => {},
  onBanSender,
  sending,
  banning,
  revising,
  reviseInstruction,
  setReviseInstruction,
  onRevise,
  actionMessage,
  layout = "card",
  showCaseActions = true,
}: {
  detail: CustomerInquiryDetail;
  draft: string;
  setDraft: (next: string) => void;
  onRegenerate: () => void;
  regenerating: boolean;
  onSend: () => void;
  onIgnore: () => void;
  onUnignore?: () => void;
  onBanSender?: () => void;
  sending: boolean;
  banning?: boolean;
  revising?: boolean;
  reviseInstruction?: string;
  setReviseInstruction?: (value: string) => void;
  onRevise?: () => void;
  actionMessage: string | null;
  layout?: "card" | "panel";
  showCaseActions?: boolean;
}) {
  const locked = detail.status === "sent";
  const ignored = detail.status === "ignored";
  const isPanel = layout === "panel";

  return (
    <div
      className={cn(
        isPanel
          ? "border-t border-gray-200 bg-white"
          : "overflow-hidden rounded-md border border-gray-200 bg-white",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3",
          isPanel ? "px-5 pt-3" : "border-b border-gray-100 px-4 py-3",
        )}
      >
        <p className="text-sm font-medium text-gray-900">Reply</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 rounded-md text-gray-600"
          onClick={onRegenerate}
          disabled={regenerating || detail.status === "sent"}
        >
          {regenerating ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          Regenerate
        </Button>
      </div>

      <div className={cn(isPanel ? "px-5 pb-3 pt-2" : "p-4")}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={locked || ignored}
          rows={isPanel ? 4 : 12}
          className={cn(
            "block max-h-[280px] w-full resize-y rounded-md bg-gray-50 px-3.5 py-3 text-[13px] leading-relaxed text-gray-800 outline-none ring-1 ring-gray-200 transition-shadow focus:bg-white focus:ring-gray-300 disabled:text-gray-500",
            isPanel ? "min-h-[88px]" : "min-h-[140px]",
          )}
          placeholder="Draft reply will appear once processing completes."
        />

        {!locked && !ignored && setReviseInstruction && onRevise ? (
          <details className="mt-3 group">
            <summary className="cursor-pointer list-none text-xs font-medium text-gray-500 marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1">
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" />
                Adjust with AI
              </span>
            </summary>
            <div className="mt-2 space-y-2">
              <textarea
                value={reviseInstruction ?? ""}
                onChange={(event) => setReviseInstruction(event.target.value)}
                rows={2}
                placeholder='e.g. "Mention we can hold the bike until Saturday."'
                className="w-full resize-none rounded-md bg-gray-50 px-3 py-2 text-[12px] leading-relaxed text-gray-800 outline-none ring-1 ring-gray-200 focus:bg-white focus:ring-gray-300"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md bg-white"
                onClick={onRevise}
                disabled={revising || !draft.trim() || !reviseInstruction?.trim()}
              >
                {revising ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Apply
              </Button>
            </div>
          </details>
        ) : null}

        {ignored ? (
          <p className="mt-2.5 text-[12px] text-gray-500">
            This enquiry is closed. Reopen it to edit or send a reply.
          </p>
        ) : null}
        {actionMessage ? <p className="mt-2.5 text-[12px] text-gray-600">{actionMessage}</p> : null}
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          isPanel ? "border-t border-gray-100 px-5 py-3" : "border-t border-gray-100 bg-[#fafaf9] px-4 py-3",
        )}
      >
        <Button
          type="button"
          className="rounded-md bg-[#FFC72C] text-gray-900 hover:bg-[#E6B328]"
          onClick={onSend}
          disabled={
            sending ||
            !draft.trim() ||
            detail.status === "sent" ||
            detail.status === "ignored" ||
            detail.status === "processing"
          }
        >
          <Send className="mr-1.5 h-4 w-4" />
          Send reply
        </Button>
        {showCaseActions ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-md bg-white"
            onClick={ignored ? onUnignore : onIgnore}
            disabled={locked}
          >
            <EyeOff className="mr-1.5 h-4 w-4" />
            {ignored ? "Reopen" : "Close case"}
          </Button>
        ) : null}
        {onBanSender ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-md text-gray-600"
            onClick={onBanSender}
            disabled={locked || banning}
          >
            {banning ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <UserX className="mr-1.5 h-4 w-4" />
            )}
            Ban sender
          </Button>
        ) : null}
      </div>
    </div>
  );
}

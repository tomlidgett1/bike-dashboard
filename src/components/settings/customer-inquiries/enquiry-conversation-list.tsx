"use client";

import { AlertCircle, Inbox } from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { GoogleReviewsLogo } from "@/components/genie/google-reviews-logo";
import { InstagramLogo } from "@/components/genie/instagram-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import { cn } from "@/lib/utils";
import { CHANNEL_META, type InboxChannel } from "./channel-meta";
import type { UnifiedInboxController, UnifiedInboxRow } from "./use-unified-inbox-controller";
import {
  GoogleBusinessConnectCard,
  SHOW_GOOGLE_BUSINESS_CONNECT,
} from "./google-business-connect-card";

function SourceMark({ row }: { row: UnifiedInboxRow }) {
  return (
    <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
      {row.source === "gmail" ? (
        <GmailLogo className="m-auto h-4 w-auto max-w-[22px] object-contain" />
      ) : row.source === "instagram" ? (
        <InstagramLogo />
      ) : row.source === "google" ? (
        <GoogleReviewsLogo />
      ) : (
        <NestLogo className="h-full w-full rounded-none object-cover" />
      )}
    </span>
  );
}

export function ChannelChip({
  channel,
  className,
}: {
  channel: InboxChannel;
  className?: string;
}) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-px text-[10px] font-medium leading-4",
        meta.chipClass,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      {meta.label}
    </span>
  );
}

/** Left-list badge: Nest threads are Staff Message or Bot Message only. */
export function MessageKindBadge({ row }: { row: UnifiedInboxRow }) {
  if (row.source !== "nest") return null;
  const isStaff = Boolean(row.nestItem?.hasManualMessages);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1 py-0 text-[9px] font-medium leading-3",
        isStaff
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-gray-200 bg-gray-100 text-gray-600",
      )}
    >
      {isStaff ? "Staff Message" : "Bot Message"}
    </span>
  );
}

function ConversationRow({
  row,
  selected,
  onSelect,
  onPrefetch,
  relativeTime,
}: {
  row: UnifiedInboxRow;
  selected: boolean;
  onSelect: () => void;
  onPrefetch: () => void;
  relativeTime: (value: string | null) => string;
}) {
  const unread = row.isUnread;

  return (
    <button
      type="button"
      onClick={onSelect}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
        selected
          ? "bg-gray-100"
          : unread
            ? "bg-[#f2f2f7] hover:bg-[#ebebf0]"
            : "hover:bg-gray-50",
      )}
    >
      <SourceMark row={row} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-sm text-gray-900",
                unread ? "font-semibold" : "font-medium",
              )}
            >
              {row.customerName}
            </p>
            {row.source === "instagram" &&
            row.customerContact.startsWith("@") &&
            row.customerContact !== row.customerName ? (
              <p className="truncate text-[11px] text-gray-400">{row.customerContact}</p>
            ) : null}
            {row.source === "google" && row.googleReviewItem?.star_rating ? (
              <p className="truncate text-[11px] text-gray-400">
                {row.googleReviewItem.star_rating}★ Google review
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {row.source === "nest" ? <MessageKindBadge row={row} /> : null}
            <span
              className={cn(
                "text-[11px] tabular-nums",
                unread ? "font-medium text-[#007AFF]" : "text-gray-400",
              )}
            >
              {relativeTime(row.receivedAt)}
            </span>
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {unread ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#007AFF]" aria-hidden />
          ) : null}
          <p
            className={cn(
              "truncate text-xs",
              unread ? "font-medium text-gray-800" : "text-gray-500",
            )}
          >
            {row.preview}
          </p>
        </div>
      </div>
    </button>
  );
}

export function EnquiryConversationList({ c }: { c: UnifiedInboxController }) {
  if (c.listLoading && c.allRows.length === 0) {
    return null;
  }

  if (c.listLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          role="status"
          aria-label="Loading enquiries"
          className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500"
        />
      </div>
    );
  }

  if (c.listError) {
    return (
      <div className="mx-3 mt-4 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-2 text-sm text-gray-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
          <span>{c.listError}</span>
        </div>
      </div>
    );
  }

  if (c.filteredRows.length === 0) {
    const googleNeedsConnect =
      SHOW_GOOGLE_BUSINESS_CONNECT &&
      c.sourceTab === "google" &&
      c.googleReviewsStatusReady &&
      !c.googleReviewsConnected;

    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        {googleNeedsConnect ? (
          <div className="w-full max-w-md text-left">
            <GoogleBusinessConnectCard
              compact
              onConnected={() => void c.handleRefreshAll()}
            />
          </div>
        ) : (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white">
              <Inbox className="h-5 w-5 text-gray-400" />
            </span>
            <p className="mt-4 text-sm font-medium text-gray-900">
              {c.searchActive
                ? "No enquiries match your search"
                : c.statusTab === "unread"
                  ? "No unread enquiries"
                  : c.sourceTab === "google"
                    ? "No Google reviews yet"
                    : "No enquiries here yet"}
            </p>
            <p className="mt-1 max-w-[240px] text-xs text-gray-500">
              {c.searchActive
                ? "Try a different name, email, or subject line."
                : c.sourceTab === "google"
                  ? "Google reviews will show up here when they're available."
                  : "New Gmail, Instagram, Nest and Google review messages will show up here automatically."}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
      {c.filteredRows.map((row) => (
        <ConversationRow
          key={row.key}
          row={row}
          selected={c.selectedKey === row.key}
          onSelect={() => c.openRow(row)}
          onPrefetch={() => c.prefetchRow(row)}
          relativeTime={c.relativeTime}
        />
      ))}
    </div>
  );
}

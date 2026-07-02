"use client";

import { AlertCircle, Inbox, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import { cn } from "@/lib/utils";
import { CHANNEL_META, type InboxChannel } from "./channel-meta";
import type { UnifiedInboxController, UnifiedInboxRow } from "./use-unified-inbox-controller";

const STATUS_TEXT_CLASS: Record<UnifiedInboxRow["statusTone"], string> = {
  unread: "text-blue-700",
  ready: "text-violet-700",
  responded: "text-emerald-700",
  ignored: "text-gray-400",
  processing: "text-amber-700",
  error: "text-red-700",
  neutral: "text-gray-500",
};

function SourceMark({ row }: { row: UnifiedInboxRow }) {
  return (
    <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
      {row.source === "gmail" ? (
        <GmailLogo className="m-auto h-4 w-auto max-w-[22px] object-contain" />
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
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium leading-4",
        meta.chipClass,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      {meta.label}
    </span>
  );
}

function ConversationRow({
  row,
  selected,
  onSelect,
  relativeTime,
}: {
  row: UnifiedInboxRow;
  selected: boolean;
  onSelect: () => void;
  relativeTime: (value: string | null) => string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
        selected ? "bg-gray-100" : "hover:bg-gray-50",
      )}
    >
      <SourceMark row={row} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm text-gray-900",
              row.needsAction ? "font-semibold" : "font-medium",
            )}
          >
            {row.customerName}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
            {relativeTime(row.receivedAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {row.needsAction ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden />
          ) : null}
          <p
            className={cn(
              "truncate text-xs",
              row.needsAction ? "text-gray-700" : "text-gray-500",
            )}
          >
            {row.preview}
          </p>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          <ChannelChip channel={row.channel} />
          {row.intentLabel ? (
            <span className="text-gray-400">{row.intentLabel}</span>
          ) : null}
          <span aria-hidden className="text-gray-300">
            ·
          </span>
          <span className={cn("font-medium", STATUS_TEXT_CLASS[row.statusTone])}>
            {row.statusLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

export function EnquiryConversationList({ c }: { c: UnifiedInboxController }) {
  if (c.listLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading enquiries…
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
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white">
          <Inbox className="h-5 w-5 text-gray-400" />
        </span>
        <p className="mt-4 text-sm font-medium text-gray-900">
          {c.searchActive
            ? "No enquiries match your search"
            : c.statusTab === "needs_action"
              ? "Nothing needs action right now"
              : "No enquiries here yet"}
        </p>
        <p className="mt-1 max-w-[240px] text-xs text-gray-500">
          {c.searchActive
            ? "Try a different name, email, or subject line."
            : "New Gmail and Nest messages will show up here automatically."}
        </p>
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
          relativeTime={c.relativeTime}
        />
      ))}
    </div>
  );
}

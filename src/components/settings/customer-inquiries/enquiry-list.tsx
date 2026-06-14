"use client";

import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Avatar,
  FilterTabs,
  enquirySummary,
  relativeTime,
  senderName,
  statusLabel,
} from "./parts";
import type { InquiriesController } from "./use-inquiries-controller";

export function EnquiryList({
  c,
  className,
}: {
  c: InquiriesController;
  className?: string;
}) {
  return (
    <aside className={cn("flex min-h-0 flex-col border-r border-gray-200 bg-white", className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2.5 pt-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Enquiries</h2>
          {!c.loading ? (
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
              {c.inquiries.length}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-md px-2.5"
          onClick={() => void c.handleRefresh()}
          disabled={c.refreshing}
        >
          {c.refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <div className="shrink-0 px-4 pb-3">
        <FilterTabs value={c.filter} onChange={c.setFilter} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {c.loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : c.error ? (
          <div className="mx-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
              <span>{c.error}</span>
            </div>
          </div>
        ) : c.inquiries.length === 0 ? (
          <div className="mx-2 mt-6 flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 ring-1 ring-black/[0.05]">
              <Inbox className="h-5 w-5 text-gray-400" />
            </span>
            <p className="mt-3 text-sm font-medium text-gray-900">Nothing here yet</p>
            <p className="mt-1 text-[12.5px] text-gray-500">New emails appear after each sync.</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {c.inquiries.map((item) => {
              const name = senderName(item);
              const selected = item.id === c.selectedId;
              const isReady = item.status === "draft_ready";
              const muted = item.status === "sent" || item.status === "ignored";
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => c.setSelectedId(item.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      selected ? "bg-gray-100" : "hover:bg-gray-50",
                    )}
                  >
                    <Avatar name={name} size="sm" muted={muted} withGmail />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-[13px] font-semibold",
                            muted ? "text-gray-500" : "text-gray-900",
                          )}
                        >
                          {name}
                        </p>
                        <span className="shrink-0 text-[11px] text-gray-400">
                          {relativeTime(item.received_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-[12.5px] text-gray-500">
                          {enquirySummary(item)}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          {item.thread_message_count > 1 ? (
                            <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              {item.thread_message_count}
                            </span>
                          ) : null}
                          {isReady ? (
                            <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              Ready
                            </span>
                          ) : item.status !== "new" ? (
                            <span className="text-[10px] font-medium text-gray-400">
                              {statusLabel(item.status)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

export function DetailEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.05]">
        <Inbox className="h-5 w-5 text-gray-400" />
      </span>
      <p className="mt-4 text-sm font-medium text-gray-900">Select an enquiry</p>
      <p className="mt-1 max-w-xs text-[13px] text-gray-500">
        Pick a customer on the left to see their message, Lightspeed history, and the AI drafted
        reply.
      </p>
    </div>
  );
}

export function DetailLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-gray-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading enquiry…
    </div>
  );
}

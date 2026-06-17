"use client";

import { AlertCircle, Inbox, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { UnifiedInboxController, UnifiedInboxRow } from "./use-unified-inbox-controller";

function StatusBadge({ row }: { row: UnifiedInboxRow }) {
  const toneClass: Record<UnifiedInboxRow["statusTone"], string> = {
    unread: "border-blue-200 bg-blue-50 text-blue-800",
    ready: "border-indigo-200 bg-indigo-50 text-indigo-800",
    responded: "border-emerald-200 bg-emerald-50 text-emerald-800",
    ignored: "border-gray-200 bg-gray-50 text-gray-500",
    processing: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-800",
    neutral: "border-gray-200 bg-white text-gray-500",
  };

  const dotClass: Record<UnifiedInboxRow["statusTone"], string> = {
    unread: "bg-blue-600",
    ready: "bg-indigo-600",
    responded: "bg-emerald-600",
    ignored: "bg-gray-400",
    processing: "bg-amber-500",
    error: "bg-red-600",
    neutral: "bg-gray-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        toneClass[row.statusTone],
      )}
    >
      {row.needsAction ? (
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass[row.statusTone])}
          aria-hidden
        />
      ) : null}
      {row.statusLabel}
    </span>
  );
}

function SourceMark({ row }: { row: UnifiedInboxRow }) {
  return (
    <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
      {row.source === "gmail" ? (
        <GmailLogo className="m-auto h-4 w-auto max-w-[22px] object-contain" />
      ) : (
        <NestLogo className="h-full w-full rounded-none object-cover" />
      )}
    </span>
  );
}

export function UnifiedInboxTable({ c }: { c: UnifiedInboxController }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {c.listLoading ? (
        <div className="flex items-center justify-center py-24 text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading enquiries…
        </div>
      ) : c.listError ? (
        <div className="mx-2 mt-6 max-w-lg rounded-md border border-gray-200 bg-white p-4 sm:mx-3 lg:mx-4">
          <div className="flex items-start gap-2 text-sm text-gray-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
            <span>{c.listError}</span>
          </div>
        </div>
      ) : c.filteredRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white">
            <Inbox className="h-5 w-5 text-gray-400" />
          </span>
          <p className="mt-4 text-sm font-medium text-gray-900">
            {c.searchActive
              ? "No enquiries match your search"
              : c.inboxTab === "needs_action"
                ? "Nothing needs action right now"
                : "No enquiries match this filter"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            {c.searchActive
              ? "Try a different name, email, or subject line."
              : c.inboxTab === "needs_action"
                ? "New Gmail and Nest messages stay here until you reply or close the enquiry."
                : "Try another tab, or refresh to pull the latest Gmail and Nest messages."}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm">
            <TableRow className="border-gray-200 hover:bg-transparent">
              <TableHead className="w-[52px] pl-2 sm:pl-3 lg:pl-4">Source</TableHead>
              <TableHead className="min-w-[160px]">Customer</TableHead>
              <TableHead className="hidden min-w-[140px] lg:table-cell">Subject</TableHead>
              <TableHead className="min-w-[200px]">Message</TableHead>
              <TableHead className="hidden w-[100px] md:table-cell">Type</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="hidden w-[72px] pr-2 text-right sm:table-cell sm:pr-3 lg:pr-4">
                When
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {c.filteredRows.map((row) => {
              const selected = c.selectedKey === row.key;
              return (
                <TableRow
                  key={row.key}
                  data-state={selected ? "selected" : undefined}
                  className={cn(
                    "cursor-pointer border-gray-100",
                    row.needsAction && !selected && "bg-white",
                    selected && "bg-gray-100",
                  )}
                  onClick={() => c.openRow(row)}
                >
                  <TableCell className="pl-2 sm:pl-3 lg:pl-4">
                    <SourceMark row={row} />
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-sm text-gray-900",
                          row.needsAction ? "font-semibold" : "font-medium",
                        )}
                      >
                        {row.customerName}
                      </p>
                      <p className="truncate text-xs text-gray-500">{row.customerContact}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden max-w-[200px] lg:table-cell">
                    <p className="truncate text-sm text-gray-800">{row.subject}</p>
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <p
                      className={cn(
                        "truncate text-sm",
                        row.needsAction ? "text-gray-800" : "text-gray-500",
                      )}
                    >
                      {row.preview}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.intentLabel ? (
                      <span className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {row.intentLabel}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge row={row} />
                  </TableCell>
                  <TableCell className="hidden pr-2 text-right text-xs tabular-nums text-gray-500 sm:table-cell sm:pr-3 lg:pr-4">
                    {c.relativeTime(row.receivedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

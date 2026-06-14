"use client";

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnquiryList, DetailEmpty, DetailLoading } from "./enquiry-list";
import {
  Avatar,
  LightspeedBody,
  LightspeedMark,
  MatchBadge,
  MessageBlock,
  ReplyComposer,
  SourcesBody,
  StatusChip,
  fullTime,
  senderName,
} from "./parts";
import type { InquiriesController } from "./use-inquiries-controller";

export function DesignThreePane({ c }: { c: InquiriesController }) {
  const { detail } = c;

  return (
    <div className="flex h-full min-h-0 bg-white">
      <EnquiryList c={c} className={cn("w-full lg:w-[300px] lg:shrink-0", c.selectedId && "hidden lg:flex")} />

      {!c.selectedId ? (
        <div className="hidden flex-1 bg-[#f6f6f4] lg:block">
          <DetailEmpty />
        </div>
      ) : c.detailLoading || !detail ? (
        <div className="flex flex-1 bg-[#f6f6f4]">
          <DetailLoading />
        </div>
      ) : (
        <div className={cn("min-h-0 min-w-0 flex-1 flex-col lg:flex", c.selectedId ? "flex" : "hidden")}>
          <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
            <button
              type="button"
              onClick={() => c.setSelectedId(null)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Avatar name={senderName(detail)} size="sm" withGmail />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{senderName(detail)}</p>
              <p className="truncate text-[12px] text-gray-500">{detail.sender_email}</p>
            </div>
            <StatusChip status={detail.status} />
          </div>

          <div className="flex min-h-0 flex-1">
            {/* middle: message + context */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-r border-gray-200 bg-[#f6f6f4] p-5">
              <div className="mx-auto max-w-xl space-y-3">
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="mb-3 text-[11px] text-gray-400">{fullTime(detail.received_at)}</div>
                  <MessageBlock detail={detail} gmailAccountEmail={c.gmailAccountEmail} />
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <p className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
                    <LightspeedMark /> Lightspeed
                    <MatchBadge matched={c.lightspeedContext?.matched} />
                  </p>
                  {c.lightspeedContext ? (
                    <LightspeedBody context={c.lightspeedContext} />
                  ) : (
                    <p className="text-[13px] text-gray-500">No Lightspeed context.</p>
                  )}
                </div>

                {detail.citations?.length ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <p className="mb-3 text-sm font-medium text-gray-900">
                      Sources ({detail.citations.length})
                    </p>
                    <SourcesBody citations={detail.citations} />
                  </div>
                ) : null}
              </div>
            </div>

            {/* right: reply composer always visible */}
            <div className="hidden min-h-0 w-[420px] shrink-0 flex-col bg-white xl:flex">
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <ReplyComposer
                  detail={detail}
                  draft={c.draft}
                  setDraft={c.setDraft}
                  onRegenerate={() => void c.handleRegenerate()}
                  regenerating={c.regenerating}
                  onSend={() => c.setSendConfirmOpen(true)}
                  onIgnore={() => void c.handleIgnore()}
                  onUnignore={() => void c.handleUnignore()}
                  sending={c.sending}
                  actionMessage={c.actionMessage}
                />
              </div>
            </div>
          </div>

          {/* reply composer for < xl (stacked under) */}
          <div className="shrink-0 border-t border-gray-200 bg-white p-5 xl:hidden">
            <ReplyComposer
              detail={detail}
              draft={c.draft}
              setDraft={c.setDraft}
              onRegenerate={() => void c.handleRegenerate()}
              regenerating={c.regenerating}
              onSend={() => c.setSendConfirmOpen(true)}
              onIgnore={() => void c.handleIgnore()}
              onUnignore={() => void c.handleUnignore()}
              sending={c.sending}
              actionMessage={c.actionMessage}
            />
          </div>
        </div>
      )}
    </div>
  );
}

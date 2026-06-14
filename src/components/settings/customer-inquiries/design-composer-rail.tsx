"use client";

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnquiryList, DetailEmpty, DetailLoading } from "./enquiry-list";
import {
  Avatar,
  LightspeedBody,
  LightspeedMark,
  MatchBadge,
  CustomerMessageCard,
  ReplyComposer,
  SourcesBody,
  StatusChip,
  senderName,
} from "./parts";
import type { InquiriesController } from "./use-inquiries-controller";

export function DesignComposerRail({ c }: { c: InquiriesController }) {
  const { detail } = c;

  return (
    <div className="flex h-full min-h-0 bg-white">
      <EnquiryList c={c} className={cn("w-full lg:w-[300px] lg:shrink-0", c.selectedId && "hidden lg:flex")} />

      <section className={cn("min-h-0 min-w-0 flex-1 flex-col bg-[#f6f6f4]", c.selectedId ? "flex" : "hidden lg:flex")}>
        {!c.selectedId ? (
          <DetailEmpty />
        ) : c.detailLoading || !detail ? (
          <DetailLoading />
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* center: reply hero */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5 lg:p-7">
              <div className="mx-auto flex h-full max-w-2xl flex-col">
                <button
                  type="button"
                  onClick={() => c.setSelectedId(null)}
                  className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 lg:hidden"
                >
                  <ArrowLeft className="h-4 w-4" /> Enquiries
                </button>

                <CustomerMessageCard detail={detail} />

                <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-md border border-gray-200 bg-white p-5">
                  <ReplyComposer
                    detail={detail}
                    draft={c.draft}
                    setDraft={c.setDraft}
                    onRegenerate={() => void c.handleRegenerate()}
                    regenerating={c.regenerating}
                    onSend={() => c.setSendConfirmOpen(true)}
                    onIgnore={() => void c.handleIgnore()}
                    onBanSender={() => c.setBanConfirmOpen(true)}
                    sending={c.sending}
                    banning={c.banning}
                    actionMessage={c.actionMessage}
                  />
                </div>
              </div>
            </div>

            {/* right: context rail */}
            <aside className="hidden min-h-0 w-[320px] shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-5 lg:block">
              <div className="flex items-center gap-3">
                <Avatar name={senderName(detail)} size="md" withGmail />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{senderName(detail)}</p>
                  <p className="truncate text-[12px] text-gray-500">{detail.sender_email}</p>
                </div>
              </div>
              <div className="mt-3">
                <StatusChip status={detail.status} />
              </div>

              <div className="my-5 h-px bg-gray-100" />

              <p className="mb-2.5 flex items-center gap-2 text-[13px] font-medium text-gray-900">
                <LightspeedMark /> Lightspeed
                <MatchBadge matched={c.lightspeedContext?.matched} />
              </p>
              {c.lightspeedContext ? (
                <LightspeedBody context={c.lightspeedContext} />
              ) : (
                <p className="text-[13px] text-gray-500">No Lightspeed context.</p>
              )}

              {detail.citations?.length ? (
                <>
                  <div className="my-5 h-px bg-gray-100" />
                  <p className="mb-2.5 text-[13px] font-medium text-gray-900">
                    Sources ({detail.citations.length})
                  </p>
                  <SourcesBody citations={detail.citations} />
                </>
              ) : null}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}

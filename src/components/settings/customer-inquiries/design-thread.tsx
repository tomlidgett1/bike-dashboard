"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnquiryList, DetailEmpty, DetailLoading } from "./enquiry-list";
import {
  Avatar,
  GmailMark,
  LightspeedBody,
  LightspeedMark,
  MatchBadge,
  ReplyComposer,
  SourcesBody,
  StatusChip,
  fullTime,
  senderName,
} from "./parts";
import type { InquiriesController } from "./use-inquiries-controller";

export function DesignThread({ c }: { c: InquiriesController }) {
  const { detail } = c;
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  React.useEffect(() => {
    setDetailsOpen(false);
  }, [c.selectedId]);

  return (
    <div className="flex h-full min-h-0 bg-white">
      <EnquiryList c={c} className={cn("w-full lg:w-[360px] lg:shrink-0", c.selectedId && "hidden lg:flex")} />

      <section className={cn("min-h-0 min-w-0 flex-1 flex-col bg-[#f6f6f4]", c.selectedId ? "flex" : "hidden lg:flex")}>
        {!c.selectedId ? (
          <DetailEmpty />
        ) : c.detailLoading || !detail ? (
          <DetailLoading />
        ) : (
          <>
            {/* top bar with context chips */}
            <div className="shrink-0 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3 px-5 py-3">
                <button
                  type="button"
                  onClick={() => c.setSelectedId(null)}
                  className="inline-flex items-center text-gray-500 hover:text-gray-900 lg:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <Avatar name={senderName(detail)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{senderName(detail)}</p>
                  <p className="truncate text-[12px] text-gray-500">{detail.sender_email}</p>
                </div>
                <div className="hidden items-center gap-1.5 sm:flex">
                  <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-medium text-gray-500">
                    <GmailMark className="h-3" /> Gmail
                  </span>
                  <button
                    type="button"
                    onClick={() => setDetailsOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <LightspeedMark className="h-3.5 w-3.5" />
                    Lightspeed
                    <MatchBadge matched={c.lightspeedContext?.matched} />
                    <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 transition-transform", detailsOpen && "rotate-180")} />
                  </button>
                </div>
                <StatusChip status={detail.status} className="shrink-0" />
              </div>

              <AnimatePresence initial={false}>
                {detailsOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-4 border-t border-gray-100 px-5 py-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-[13px] font-medium text-gray-900">
                          <LightspeedMark /> Lightspeed
                        </p>
                        {c.lightspeedContext ? (
                          <LightspeedBody context={c.lightspeedContext} />
                        ) : (
                          <p className="text-[13px] text-gray-500">No Lightspeed context.</p>
                        )}
                      </div>
                      {detail.citations?.length ? (
                        <div>
                          <p className="mb-2 text-[13px] font-medium text-gray-900">
                            Sources ({detail.citations.length})
                          </p>
                          <SourcesBody citations={detail.citations} />
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* conversation */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-7">
              <div className="mx-auto max-w-2xl">
                <div className="flex items-start gap-3">
                  <Avatar name={senderName(detail)} size="sm" withGmail />
                  <div className="min-w-0">
                    <div className="rounded-2xl rounded-tl-md border border-gray-200 bg-white p-4">
                      {detail.subject ? (
                        <p className="mb-1.5 text-[13px] font-semibold text-gray-900">
                          {detail.subject}
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
                        {detail.body_preview || detail.snippet}
                      </p>
                    </div>
                    <p className="mt-1 px-1 text-[11px] text-gray-400">
                      {fullTime(detail.received_at)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* composer */}
            <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 lg:px-7">
              <div className="mx-auto max-w-2xl">
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
          </>
        )}
      </section>
    </div>
  );
}

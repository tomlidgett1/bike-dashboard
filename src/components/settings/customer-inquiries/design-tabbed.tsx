"use client";

import * as React from "react";
import { motion } from "framer-motion";
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

type Tab = "reply" | "message" | "context";

export function DesignTabbed({ c }: { c: InquiriesController }) {
  const [tab, setTab] = React.useState<Tab>("reply");
  const { detail } = c;

  React.useEffect(() => {
    setTab("reply");
  }, [c.selectedId]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "reply", label: "Reply" },
    { id: "message", label: "Message" },
    { id: "context", label: "Context" },
  ];

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
            <div className="shrink-0 border-b border-gray-200 bg-white px-5 py-4 lg:px-8">
              <button
                type="button"
                onClick={() => c.setSelectedId(null)}
                className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 lg:hidden"
              >
                <ArrowLeft className="h-4 w-4" /> Enquiries
              </button>
              <div className="flex items-center gap-3.5">
                <Avatar name={senderName(detail)} size="md" withGmail />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-base font-semibold text-gray-900">
                      {senderName(detail)}
                    </p>
                    <StatusChip status={detail.status} />
                  </div>
                  <p className="truncate text-[13px] text-gray-500">{detail.sender_email}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-0.5 rounded-md bg-gray-100 p-0.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      tab === t.id
                        ? "bg-white text-gray-800 shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70",
                    )}
                  >
                    {t.label}
                    {t.id === "context" && c.lightspeedContext?.matched ? (
                      <LightspeedMark className="h-3.5 w-3.5" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-8">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="mx-auto h-full max-w-2xl"
              >
                {tab === "reply" ? (
                  <div className="h-full rounded-xl border border-gray-200 bg-white p-5">
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
                ) : null}

                {tab === "message" ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="mb-3 text-[11px] text-gray-400">{fullTime(detail.received_at)}</div>
                    <MessageBlock detail={detail} gmailAccountEmail={c.gmailAccountEmail} />
                  </div>
                ) : null}

                {tab === "context" ? (
                  <div className="space-y-3">
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
                ) : null}
              </motion.div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

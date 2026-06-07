"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { cn } from "@/lib/utils";
import type { GmailEmailsPayload } from "@/lib/types/genie-agent";

const CARD_EASE = [0.04, 0.62, 0.23, 0.98] as const;
const SCROLL_MAX_ITEMS = 4;
const ROW_HEIGHT_ESTIMATE = 72;
const SCROLL_MAX_HEIGHT = SCROLL_MAX_ITEMS * ROW_HEIGHT_ESTIMATE;

function EmailRow({
  subject,
  from,
  snippet,
  dateLabel,
}: {
  subject: string;
  from: string;
  snippet: string;
  dateLabel: string | null;
}) {
  return (
    <div className="border-b border-gray-100 py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{subject}</p>
        {dateLabel ? <span className="shrink-0 text-[10px] text-gray-400">{dateLabel}</span> : null}
      </div>
      <p className="mt-0.5 truncate text-[11px] font-medium text-gray-600">{from}</p>
      {snippet ? <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-500">{snippet}</p> : null}
    </div>
  );
}

export function GmailEmailSearchCard({ payload }: { payload: GmailEmailsPayload }) {
  const [expanded, setExpanded] = React.useState(false);
  const count = payload.emails.length;
  const isScrollable = count > SCROLL_MAX_ITEMS;

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: CARD_EASE }}
      className="w-full max-w-md"
    >
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/[0.06]">
            <GmailLogo />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight text-gray-900">Gmail</p>
            <p className="truncate text-[11px] text-gray-500">
              {payload.title}
              {payload.scan_stats?.scan_mode === "full" && payload.scan_stats.total_matched > 0
                ? ` · scanned ${payload.scan_stats.total_matched.toLocaleString("en-AU")} emails`
                : null}
              {payload.scan_stats?.capped
                ? " · scan limit reached"
                : null}
              {count > 0 ? ` · showing ${count} email${count === 1 ? "" : "s"}` : ""}
              {payload.truncated ? " · more available" : ""}
            </p>
          </div>
        </div>

        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={expanded ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{
            height: { delay: 0.1, duration: 0.4, ease: CARD_EASE },
            opacity: { delay: 0.14, duration: 0.3, ease: CARD_EASE },
          }}
          className="overflow-hidden"
        >
          <div className="px-3.5 pb-3.5">
            {count === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-4 text-xs text-gray-500">
                <Mail className="h-4 w-4 shrink-0" />
                No emails matched “{payload.query}”.
              </div>
            ) : (
              <div className="relative">
                <div
                  className={cn(
                    "rounded-md bg-gray-50 px-2.5",
                    isScrollable && "overflow-y-auto overscroll-contain [scrollbar-width:thin]",
                  )}
                  style={isScrollable ? { maxHeight: SCROLL_MAX_HEIGHT } : undefined}
                >
                  {payload.emails.map((email) => (
                    <EmailRow
                      key={email.message_id}
                      subject={email.subject}
                      from={email.from}
                      snippet={email.snippet}
                      dateLabel={email.date_label}
                    />
                  ))}
                </div>
                {isScrollable ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-md bg-gradient-to-t from-gray-50 to-transparent"
                  />
                ) : null}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

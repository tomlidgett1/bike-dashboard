"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Inbox,
  MessageSquareReply,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { cn } from "@/lib/utils";
import type {
  GmailContactCandidate,
  GmailEmailPreview,
  GmailEmailsPayload,
  GmailMessageContent,
} from "@/lib/types/genie-agent";

const CARD_EASE = [0.04, 0.62, 0.23, 0.98] as const;
const SEARCH_PREVIEW_LIMIT = 3;
const SEARCH_EXPANDED_LIMIT = 8;

function countLabel(value: number, singular: string, plural = `${singular}s`): string {
  return `${value.toLocaleString("en-AU")} ${value === 1 ? singular : plural}`;
}

function safeText(value: string | null | undefined, fallback = "Unknown"): string {
  return value?.trim() || fallback;
}

function senderLabel(candidate: GmailContactCandidate): string {
  return safeText(candidate.display_name ?? candidate.email_address ?? candidate.from);
}

function roleLabel(role: GmailContactCandidate["role_hint"]): string {
  if (role === "sales") return "Sales";
  if (role === "support") return "Support";
  if (role === "automated") return "Automated";
  return "Contact";
}

function uniqueMessages(
  bodies: GmailMessageContent[] | undefined,
  emails: GmailEmailPreview[],
): Array<GmailMessageContent | GmailEmailPreview> {
  const seen = new Set<string>();
  const rows: Array<GmailMessageContent | GmailEmailPreview> = [];
  for (const message of [...(bodies ?? []), ...emails]) {
    const key = `${message.connected_account_id ?? ""}:${message.message_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(message);
  }
  return rows;
}

function modeCopy(payload: GmailEmailsPayload): {
  title: string;
  eyebrow: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  if (payload.ui_mode === "contact_analysis") {
    return { title: "Contact analysis", eyebrow: "Gmail history", icon: UsersRound };
  }
  if (payload.ui_mode === "thread_context") {
    return { title: "Email context", eyebrow: "Gmail evidence", icon: FileText };
  }
  if (payload.ui_mode === "reply_context") {
    return { title: "Reply context", eyebrow: "Gmail draft prep", icon: MessageSquareReply };
  }
  return { title: "Search summary", eyebrow: "Gmail search", icon: Search };
}

function StatPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600">
      {children}
    </span>
  );
}

function GmailCardShell({
  payload,
  children,
}: {
  payload: GmailEmailsPayload;
  children: React.ReactNode;
}) {
  const copy = modeCopy(payload);
  const Icon = copy.icon;
  const total = payload.scan_stats?.total_matched ?? payload.emails.length;
  const mailboxCount = payload.scan_stats?.mailboxes_searched ?? payload.connected_mailboxes?.length ?? 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: CARD_EASE }}
      className="w-full max-w-lg"
    >
      <div className="overflow-hidden rounded-lg bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/[0.06]">
              <GmailLogo />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold text-gray-900">{copy.title}</p>
                <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-gray-50 px-2 text-[10px] font-medium text-gray-500">
                  <Icon className="h-3 w-3" />
                  {copy.eyebrow}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
                {payload.ui_summary || payload.title}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <StatPill>{countLabel(total, "match", "matches")}</StatPill>
            <StatPill>{countLabel(mailboxCount, "mailbox", "mailboxes")}</StatPill>
            {payload.scan_stats?.scan_mode === "full" ? <StatPill>Full history</StatPill> : null}
            {payload.scan_stats?.oldest_date_label && payload.scan_stats?.newest_date_label ? (
              <StatPill>
                {payload.scan_stats.oldest_date_label} - {payload.scan_stats.newest_date_label}
              </StatPill>
            ) : null}
            {payload.scan_stats?.capped ? <StatPill>Scan limit reached</StatPill> : null}
          </div>
        </div>

        <div className="px-4 py-3">{children}</div>
      </div>
    </motion.div>
  );
}

function EmailRow({
  email,
  bodyText,
  compact = false,
}: {
  email: GmailEmailPreview;
  bodyText?: string;
  compact?: boolean;
}) {
  return (
    <div className="border-b border-gray-100 py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{safeText(email.subject, "(No subject)")}</p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-gray-600">{safeText(email.from)}</p>
        </div>
        {email.date_label ? (
          <span className="shrink-0 text-[10px] text-gray-400">{email.date_label}</span>
        ) : null}
      </div>
      {email.mailbox_label ? (
        <p className="mt-1 truncate text-[10px] font-medium text-gray-400">{email.mailbox_label}</p>
      ) : null}
      {bodyText ? (
        <p className={cn("mt-1.5 text-xs leading-relaxed text-gray-600", compact ? "line-clamp-2" : "line-clamp-3")}>
          {bodyText}
        </p>
      ) : email.snippet ? (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">{email.snippet}</p>
      ) : null}
    </div>
  );
}

function EmptyState({ payload }: { payload: GmailEmailsPayload }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-4 text-xs text-gray-500">
      <Inbox className="h-4 w-4 shrink-0" />
      <span>No emails matched &quot;{payload.query}&quot;.</span>
    </div>
  );
}

function ContactAnalysisView({ payload }: { payload: GmailEmailsPayload }) {
  const analysis = payload.contact_analysis;
  const primary = analysis?.earliest_likely_sales_contact ?? analysis?.earliest_any_contact ?? null;

  if (!analysis || !primary) {
    return <EmptyState payload={payload} />;
  }

  const alternates = analysis.likely_sales_contacts
    .filter((candidate) => candidate.from !== primary.from)
    .slice(0, 2);
  const excluded = analysis.support_or_automated_senders.slice(0, 2);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
            <UserRound className="h-4 w-4 text-gray-500" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-gray-900">{senderLabel(primary)}</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-200">
                {roleLabel(primary.role_hint)}
              </span>
            </div>
            {primary.email_address ? (
              <p className="mt-0.5 truncate text-xs text-gray-500">{primary.email_address}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatPill>{primary.first_seen_label ?? "Unknown first date"}</StatPill>
              <StatPill>{countLabel(primary.email_count, "email")}</StatPill>
            </div>
            {primary.sample_subjects.length ? (
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">
                {primary.sample_subjects.slice(0, 2).join(" / ")}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {alternates.length ? (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">Other likely contacts</p>
          <div className="divide-y divide-gray-100 rounded-md border border-gray-100 px-3">
            {alternates.map((candidate) => (
              <div key={candidate.from} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="min-w-0 truncate font-medium text-gray-800">{senderLabel(candidate)}</span>
                <span className="shrink-0 text-gray-400">{candidate.first_seen_label ?? "Unknown date"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {excluded.length ? (
        <div className="rounded-md border border-gray-100 bg-white px-3 py-2 text-xs text-gray-500">
          Excluded likely support/automated senders: {excluded.map((candidate) => senderLabel(candidate)).join(", ")}.
        </div>
      ) : null}
    </div>
  );
}

function EvidenceView({ payload, reply }: { payload: GmailEmailsPayload; reply?: boolean }) {
  const rows = uniqueMessages(payload.message_bodies, payload.emails).slice(0, reply ? 3 : 4);

  if (rows.length === 0) return <EmptyState payload={payload} />;

  return (
    <div className="space-y-3">
      {reply ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Correspondent</p>
            <p className="mt-1 truncate text-xs font-medium text-gray-800">
              {payload.correspondent_hint?.email ?? payload.correspondent_hint?.name ?? "From matching thread"}
            </p>
          </div>
          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Sent context</p>
            <p className="mt-1 truncate text-xs font-medium text-gray-800">
              {payload.includes_sent_context ? "Included" : "Not found yet"}
            </p>
          </div>
        </div>
      ) : null}

      {payload.answer_readiness?.ready_to_answer === false && payload.answer_readiness.gaps.length ? (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{payload.answer_readiness.gaps[0]}</span>
        </div>
      ) : null}

      <div className="rounded-md border border-gray-100 px-3">
        {rows.map((row) => (
          <EmailRow
            key={`${row.connected_account_id ?? ""}:${row.message_id}`}
            email={row}
            bodyText={"body_text" in row ? row.body_text : undefined}
            compact={reply}
          />
        ))}
      </div>
    </div>
  );
}

function SearchSummaryView({ payload }: { payload: GmailEmailsPayload }) {
  const [expanded, setExpanded] = React.useState(false);
  const rows = payload.emails.slice(0, expanded ? SEARCH_EXPANDED_LIMIT : SEARCH_PREVIEW_LIMIT);
  const total = payload.scan_stats?.total_matched ?? payload.emails.length;
  const hasMore = payload.emails.length > SEARCH_PREVIEW_LIMIT || payload.truncated;

  if (total === 0) return <EmptyState payload={payload} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Query</p>
          <p className="mt-1 truncate text-xs font-medium text-gray-800">{payload.query}</p>
        </div>
        <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Newest match</p>
          <p className="mt-1 truncate text-xs font-medium text-gray-800">
            {payload.scan_stats?.newest_date_label ?? payload.emails[0]?.date_label ?? "Unknown"}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-gray-100 px-3">
        {rows.map((email) => (
          <EmailRow key={`${email.connected_account_id ?? ""}:${email.message_id}`} email={email} compact />
        ))}
      </div>

      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show more
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

export function GmailEmailSearchCard({ payload }: { payload: GmailEmailsPayload }) {
  if (payload.ui_mode === "hidden") return null;

  let content: React.ReactNode;
  if (payload.ui_mode === "contact_analysis") {
    content = <ContactAnalysisView payload={payload} />;
  } else if (payload.ui_mode === "thread_context") {
    content = <EvidenceView payload={payload} />;
  } else if (payload.ui_mode === "reply_context") {
    content = <EvidenceView payload={payload} reply />;
  } else {
    content = <SearchSummaryView payload={payload} />;
  }

  return <GmailCardShell payload={payload}>{content}</GmailCardShell>;
}

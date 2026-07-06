"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Inbox,
  Loader2,
  MessageCircle,
  PhoneMissed,
  Timer,
  Users,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  CHANNEL_META,
  type InboxChannel,
} from "@/components/settings/customer-inquiries/channel-meta";
import { EnquiriesNavTabs } from "@/components/settings/customer-inquiries/enquiries-nav-tabs";
import { storeSettingsHeaderActionClass } from "@/components/settings/actions-page-header";
import {
  FloatingCard,
  FloatingCardPageBody,
  FloatingCardPageHeader,
  FloatingCardPageTitleRow,
} from "@/components/layout/floating-card-page";
import { cn } from "@/lib/utils";

type RangeKey = "7d" | "30d" | "90d" | "all";

const RANGE_TABS = [
  { id: "7d" as const, label: "7 days" },
  { id: "30d" as const, label: "30 days" },
  { id: "90d" as const, label: "90 days" },
  { id: "all" as const, label: "All time" },
];

type AnalyticsResponse = {
  range: RangeKey;
  totals: {
    conversations: number;
    nestConversations: number;
    emailInquiries: number;
    awaitingReply: number;
  };
  channels: Record<InboxChannel, number>;
  messages: {
    customer: number;
    nestAuto: number;
    manualStaff: number;
    automationRate: number | null;
  };
  conversationLength: {
    avgMessages: number | null;
    medianMessages: number | null;
    avgDurationMinutes: number | null;
    medianDurationMinutes: number | null;
  };
  response: {
    medianFirstReplySeconds: number | null;
  };
  missedCalls: {
    total: number;
    engaged: number;
    engagementRate: number | null;
  };
  activity: {
    daily: { date: string; nest: number; email: number }[];
    hourHistogram: number[];
    weekdayHistogram: number[];
  };
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function formatReplyTime(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} hrs`;
}

function formatPercent(ratio: number | null): string {
  if (ratio == null) return "—";
  return `${Math.round(ratio * 100)}%`;
}

function SectionCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-white p-5", className)}>
      <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
      {subtitle ? <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ChannelBreakdown({ channels }: { channels: Record<InboxChannel, number> }) {
  const total = Object.values(channels).reduce((a, b) => a + b, 0);
  const order: InboxChannel[] = ["website_chat", "missed_call", "email", "store_outreach"];

  return (
    <div className="space-y-3">
      {order.map((channel) => {
        const meta = CHANNEL_META[channel];
        const count = channels[channel] ?? 0;
        const share = total > 0 ? count / total : 0;
        const Icon = meta.icon;
        return (
          <div key={channel} className="flex items-center gap-3">
            <span className="inline-flex w-36 shrink-0 items-center gap-1.5 text-xs font-medium text-gray-600">
              <Icon className="h-3 w-3 shrink-0 text-gray-400" />
              {meta.label}
            </span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gray-800/80"
                style={{ width: `${Math.max(share * 100, count > 0 ? 2 : 0)}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-sm tabular-nums text-gray-700">
              {count}
              <span className="ml-1 text-xs text-gray-400">{total > 0 ? `${Math.round(share * 100)}%` : ""}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DailyVolumeChart({ daily }: { daily: AnalyticsResponse["activity"]["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.nest + d.email));
  // Keep the chart readable on long ranges: cap at the last 45 bars.
  const bars = daily.slice(-45);

  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]">
        {bars.map((d) => {
          const totalCount = d.nest + d.email;
          return (
            <div
              key={d.date}
              className="group relative flex min-w-0 flex-1 flex-col justify-end self-stretch"
              title={`${d.date}: ${d.nest} Nest, ${d.email} email`}
            >
              {totalCount > 0 ? (
                <>
                  {d.email > 0 ? (
                    <div
                      className="w-full rounded-t-[2px] bg-gray-300"
                      style={{ height: `${(d.email / max) * 100}%` }}
                    />
                  ) : null}
                  {d.nest > 0 ? (
                    <div
                      className={cn("w-full bg-gray-800/80", d.email === 0 && "rounded-t-[2px]")}
                      style={{ height: `${(d.nest / max) * 100}%` }}
                    />
                  ) : null}
                </>
              ) : (
                <div className="h-[2px] w-full rounded-full bg-gray-100" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>{bars[0]?.date}</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-gray-800/80" /> Nest chats
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-gray-300" /> Email
          </span>
        </span>
        <span>{bars[bars.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function WeekdayChart({ weekdayHistogram }: { weekdayHistogram: number[] }) {
  const max = Math.max(1, ...weekdayHistogram);
  return (
    <div className="flex h-24 items-end gap-2">
      {weekdayHistogram.map((count, i) => (
        <div key={WEEKDAY_LABELS[i]} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 self-stretch justify-end">
          <div
            className="w-full max-w-9 rounded-t-[3px] bg-gray-800/80"
            style={{ height: `${Math.max((count / max) * 100, 2)}%` }}
            title={`${WEEKDAY_LABELS[i]}: ${count} customer messages`}
          />
          <span className="text-[10px] text-gray-400">{WEEKDAY_LABELS[i]}</span>
        </div>
      ))}
    </div>
  );
}

function busiestHourLabel(hourHistogram: number[]): string {
  const max = Math.max(...hourHistogram);
  if (max <= 0) return "—";
  const hour = hourHistogram.indexOf(max);
  const to = (hour + 1) % 24;
  const fmt = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
  return `${fmt(hour)}–${fmt(to)}`;
}

export function CustomerInquiriesAnalyticsPanel() {
  const [range, setRange] = React.useState<RangeKey>("30d");
  const [data, setData] = React.useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/store/customer-inquiries/analytics?range=${range}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as AnalyticsResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Could not load analytics.");
        if (!cancelled) setData(body);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <>
      <FloatingCardPageHeader>
        <FloatingCardPageTitleRow
          title="Enquiry analytics"
          icon={Inbox}
          actions={
            <Link
              href="/settings/store/customer-inquiries"
              className={storeSettingsHeaderActionClass()}
            >
              <ArrowLeft className="size-[15px]" />
              Back to enquiries
            </Link>
          }
        />
      </FloatingCardPageHeader>

      <FloatingCardPageBody>
        <FloatingCard className="bg-gray-50/60">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <EnquiriesNavTabs items={RANGE_TABS} value={range} onChange={setRange} size="sm" />
              {loading ? (
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
                </span>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
                {error}
              </div>
            ) : !data ? (
              <div className="flex items-center justify-center p-16">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard
                    label="Conversations"
                    value={data.totals.conversations}
                    icon={MessageCircle}
                    subMetric={{ value: data.totals.awaitingReply, label: "awaiting a reply" }}
                  />
                  <StatCard
                    label="Customer messages"
                    value={data.messages.customer}
                    icon={Users}
                    subMetric={{
                      value:
                        data.conversationLength.avgMessages != null
                          ? data.conversationLength.avgMessages.toFixed(1)
                          : "—",
                      label: "avg messages / conversation",
                    }}
                  />
                  <StatCard
                    label="Nest replies sent"
                    value={data.messages.nestAuto}
                    icon={Bot}
                    subMetric={{
                      value: formatPercent(data.messages.automationRate),
                      label: `answered by Nest (${data.messages.manualStaff} manual)`,
                    }}
                  />
                  <StatCard
                    label="Median first reply"
                    value={formatReplyTime(data.response.medianFirstReplySeconds)}
                    icon={Timer}
                    subMetric={{
                      value: formatDuration(data.conversationLength.medianDurationMinutes),
                      label: "median conversation length",
                    }}
                  />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <SectionCard
                    title="Where enquiries come from"
                    subtitle="How each conversation reached the store"
                  >
                    <ChannelBreakdown channels={data.channels} />
                  </SectionCard>

                  <SectionCard
                    title="Missed calls rescued"
                    subtitle="Callers Nest texted back after nobody could answer"
                  >
                    <div className="flex items-center gap-6">
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
                        <PhoneMissed className="size-6" />
                      </div>
                      <div className="flex flex-1 items-baseline gap-6">
                        <div>
                          <p className="text-2xl font-semibold tabular-nums text-gray-900">
                            {data.missedCalls.total}
                          </p>
                          <p className="text-xs text-gray-500">missed calls texted back</p>
                        </div>
                        <div>
                          <p className="text-2xl font-semibold tabular-nums text-gray-900">
                            {formatPercent(data.missedCalls.engagementRate)}
                          </p>
                          <p className="text-xs text-gray-500">
                            replied and became a conversation ({data.missedCalls.engaged})
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
                      Every rescued call is a customer who would otherwise have rung off — Nest
                      keeps them talking until the team is free.
                    </p>
                  </SectionCard>
                </div>

                <SectionCard
                  title="New conversations per day"
                  subtitle="Nest chats and email enquiries started each day"
                >
                  <DailyVolumeChart daily={data.activity.daily} />
                </SectionCard>

                <div className="grid gap-3 lg:grid-cols-2">
                  <SectionCard
                    title="Busiest days"
                    subtitle="Customer messages by day of week (Melbourne time)"
                  >
                    <WeekdayChart weekdayHistogram={data.activity.weekdayHistogram} />
                  </SectionCard>

                  <SectionCard title="At a glance" subtitle="Quick reads for the period">
                    <dl className="space-y-2.5 text-sm">
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-500">Busiest hour for messages</dt>
                        <dd className="font-medium tabular-nums text-gray-900">
                          {busiestHourLabel(data.activity.hourHistogram)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-500">Nest conversations</dt>
                        <dd className="font-medium tabular-nums text-gray-900">
                          {data.totals.nestConversations}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-500">Email enquiries</dt>
                        <dd className="font-medium tabular-nums text-gray-900">
                          {data.totals.emailInquiries}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-500">Average conversation duration</dt>
                        <dd className="font-medium tabular-nums text-gray-900">
                          {formatDuration(data.conversationLength.avgDurationMinutes)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-500">Manual staff messages</dt>
                        <dd className="font-medium tabular-nums text-gray-900">
                          {data.messages.manualStaff}
                        </dd>
                      </div>
                    </dl>
                  </SectionCard>
                </div>
              </>
            )}
          </div>
        </FloatingCard>
      </FloatingCardPageBody>
    </>
  );
}

// Client-side helpers shared by the Lifecycle tab components.

import type { LifecycleStage } from "@/lib/crm/lifecycle/types";

export const STAGE_LABELS: Record<LifecycleStage, string> = {
  new: "New",
  active: "Active",
  vip: "High value",
  reactivated: "Reactivated",
  at_risk: "At risk",
  dormant: "Dormant",
  churned: "Churned",
  prospect: "Prospects",
};

export const STAGE_DESCRIPTIONS: Record<LifecycleStage, string> = {
  new: "Made their first purchase recently — the welcome window.",
  active: "Purchased within the store's normal repurchase rhythm.",
  vip: "Active and in the top tier of lifetime spend.",
  reactivated: "Were slipping away, then came back and purchased again.",
  at_risk: "Overdue for their next purchase — starting to drift.",
  dormant: "Long past their usual gap — prime win-back targets.",
  churned: "No purchase in a very long time; likely lost without action.",
  prospect: "On the list but haven't purchased yet.",
};

/** Three-or-four-word card subtitles a layman parses instantly. */
export const STAGE_PLAIN: Record<LifecycleStage, string> = {
  new: "Just bought for the first time",
  active: "Buying regularly",
  vip: "Your best customers",
  reactivated: "Recently came back",
  at_risk: "Starting to drift away",
  dormant: "Haven't bought in a long time",
  churned: "Haven't been back in years",
  prospect: "Never bought anything yet",
};

export const STAGE_ORDER: LifecycleStage[] = [
  "new",
  "active",
  "vip",
  "reactivated",
  "at_risk",
  "dormant",
  "churned",
  "prospect",
];

/** Ordered grayscale for the distribution bar — a chart, not a chip. */
export const STAGE_BAR_SHADES: Record<LifecycleStage, string> = {
  new: "bg-zinc-400",
  active: "bg-zinc-800",
  vip: "bg-zinc-950",
  reactivated: "bg-zinc-600",
  at_risk: "bg-zinc-500",
  dormant: "bg-zinc-300",
  churned: "bg-zinc-200",
  prospect: "bg-zinc-100",
};

export function formatMoney(value: number): string {
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatShortDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

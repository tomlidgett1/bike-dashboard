import { formatPriceAUD, formatPriceAUDFull } from "@/lib/marketplace/pricing";

export { formatPriceAUD, formatPriceAUDFull };

/** "$1,235" for whole prices, "$617.50" when there are cents. */
export function formatMoney(value: number | null | undefined): string {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? formatPriceAUD(n) : formatPriceAUDFull(n);
}

/** Compact "last sold" label from a days-since count + ISO date. */
export function formatLastSold(
  daysSinceSold: number | null | undefined,
  lastSoldAt: string | null | undefined,
): string {
  if (lastSoldAt == null && (daysSinceSold == null || daysSinceSold < 0)) {
    return "Never sold";
  }
  if (daysSinceSold == null) return "—";
  if (daysSinceSold === 0) return "Today";
  if (daysSinceSold === 1) return "Yesterday";
  if (daysSinceSold < 30) return `${daysSinceSold}d ago`;
  if (daysSinceSold < 365) return `${Math.round(daysSinceSold / 30)}mo ago`;
  return `${Math.round(daysSinceSold / 365)}y ago`;
}

export function formatMargin(margin: number | null | undefined): string {
  if (margin == null) return "—";
  return `${Math.round(margin)}%`;
}

/** "Mon 25 Jun" style short window date in Melbourne time. */
export function formatCycleDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Australia/Melbourne",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatCycleWindow(startsAt: string, endsAt: string): string {
  return `${formatCycleDate(startsAt)} → ${formatCycleDate(endsAt)}`;
}

import { STORE_ANALYTICS_TIMEZONE } from "@/lib/constants/store-analytics";

/**
 * Format a YYYY-MM-DD analytics bucket (Melbourne calendar day) for display.
 */
export function formatStoreAnalyticsDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: STORE_ANALYTICS_TIMEZONE,
      day: "numeric",
      month: "short",
    }).format(new Date(dateStr));
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Midday UTC keeps the intended Melbourne calendar day when formatting.
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return new Intl.DateTimeFormat("en-AU", {
    timeZone: STORE_ANALYTICS_TIMEZONE,
    day: "numeric",
    month: "short",
  }).format(anchor);
}

/** e.g. "AEDT" or "AEST" */
export function getStoreAnalyticsTimezoneShortLabel(at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: STORE_ANALYTICS_TIMEZONE,
    timeZoneName: "shortGeneric",
  }).formatToParts(at);

  return parts.find((part) => part.type === "timeZoneName")?.value ?? "Melbourne";
}

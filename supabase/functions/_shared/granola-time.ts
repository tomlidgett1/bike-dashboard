/** Granola MCP returns UTC ISO instants; format them in the user's IANA zone for display. */

export function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function formatIsoInstantInTimeZone(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

/** Match UTC ISO instants (Z or explicit +00:00) in tool text from Granola MCP. */
const ISO_UTC_INSTANT_RE =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|\+00:00|-00:00)/g;

export function localiseGranolaMcpText(text: string, userTimeZone: string | null | undefined): string {
  const tz = typeof userTimeZone === "string" ? userTimeZone.trim() : "";
  if (!tz || !isValidIanaTimeZone(tz)) return text;

  return text.replace(ISO_UTC_INSTANT_RE, (match) => formatIsoInstantInTimeZone(match, tz));
}

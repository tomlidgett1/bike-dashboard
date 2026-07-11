export const DEFAULT_SAFE_TOOLKITS = ["gmail", "outlook", "notion"] as const;

export function normaliseToolkitSlug(value: string): string {
  const lower = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (lower === "google_drive" || lower === "gdrive" || lower === "google_docs") return "googledrive";
  if (lower === "google_sheets" || lower === "sheets") return "googlesheets";
  if (lower === "google_calendar") return "googlecalendar";
  return lower.replace(/_/g, "");
}

export function allowedToolkitsForRequest(args: {
  requested: string[];
  profileAllowed?: string[];
}): string[] {
  const requested = args.requested.map(normaliseToolkitSlug).filter(Boolean);
  const profile = (args.profileAllowed ?? []).map(normaliseToolkitSlug).filter(Boolean);
  const baseline = DEFAULT_SAFE_TOOLKITS.map(normaliseToolkitSlug);
  return [...new Set([...baseline, ...profile, ...requested])];
}

export type EmailProvider = "gmail" | "outlook";

export function normaliseEmailProvider(value: string | null | undefined): EmailProvider | null {
  const lower = value?.toLowerCase().replace(/[_\s-]+/g, "") ?? "";
  if (
    lower === "gmail" ||
    lower === "googlemail" ||
    lower === "googlegmail" ||
    lower.includes("gmail")
  ) return "gmail";
  if (
    lower === "outlook" ||
    lower === "microsoftoutlook" ||
    lower === "office365" ||
    lower === "microsoft365mail" ||
    lower.includes("outlook")
  ) {
    return "outlook";
  }
  return null;
}

export function toolkitForEmailProvider(provider: EmailProvider): string {
  return provider === "gmail" ? "gmail" : "outlook";
}

export function normaliseComposioToolkitSlug(value: string): string {
  const lower = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (lower === "googlemail" || lower === "google_mail" || lower === "google_gmail" || lower === "googlegmail") {
    return "gmail";
  }
  if (lower === "microsoft_outlook" || lower === "microsoftoutlook" || lower === "office365" || lower === "microsoft365mail") {
    return "outlook";
  }
  if (lower === "google_drive" || lower === "gdrive" || lower === "google_docs") return "googledrive";
  if (lower === "google_sheets" || lower === "sheets") return "googlesheets";
  if (lower === "google_calendar") return "googlecalendar";
  return lower;
}

export function toolkitForApp(app: string): string[] {
  const lower = normaliseComposioToolkitSlug(app);
  if (lower === "email_provider") return ["gmail", "outlook"];
  if (lower.includes("notion")) return ["notion"];
  return [lower];
}

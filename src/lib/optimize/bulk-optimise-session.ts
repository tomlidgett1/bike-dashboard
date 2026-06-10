export const BULK_OPTIMISE_STORAGE_KEY = "store-bulk-optimise-ids";

export function readBulkOptimiseIds(): string[] {
  try {
    const raw = sessionStorage.getItem(BULK_OPTIMISE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeBulkOptimiseIds(ids: string[]) {
  try {
    sessionStorage.setItem(BULK_OPTIMISE_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

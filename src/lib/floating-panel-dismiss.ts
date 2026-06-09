const OPTIMIZE_DISMISSED_KEY = "optimize-dismissed-job-ids";
const GENIE_DISMISSED_KEY = "genie-dismissed-job-ids";

function readDismissedIds(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissedIds(storageKey: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify([...ids]));
  } catch {
    // Ignore quota errors
  }
}

export function loadOptimizeDismissedIds() {
  return readDismissedIds(OPTIMIZE_DISMISSED_KEY);
}

export function saveOptimizeDismissedIds(ids: Set<string>) {
  writeDismissedIds(OPTIMIZE_DISMISSED_KEY, ids);
}

export function loadGenieDismissedIds() {
  return readDismissedIds(GENIE_DISMISSED_KEY);
}

export function saveGenieDismissedIds(ids: Set<string>) {
  writeDismissedIds(GENIE_DISMISSED_KEY, ids);
}

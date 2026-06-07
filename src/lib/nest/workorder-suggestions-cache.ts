import type { NestPickupSuggestion } from "@/lib/nest/pickup-suggestions";

type CachedWorkorderSuggestions = {
  storeOwnerId: string;
  suggestions: NestPickupSuggestion[];
  savedAt: string;
};

const CACHE_KEY = "yj_nest_workorder_suggestions_v1";

export function suggestionKey(suggestion: Pick<NestPickupSuggestion, "id" | "workorderId">): string {
  return suggestion.workorderId || suggestion.id;
}

function isNestPickupSuggestion(value: unknown): value is NestPickupSuggestion {
  if (!value || typeof value !== "object") return false;
  const suggestion = value as NestPickupSuggestion;
  return (
    typeof suggestion.id === "string" &&
    typeof suggestion.workorderId === "string" &&
    typeof suggestion.customerId === "string" &&
    typeof suggestion.customerName === "string" &&
    (typeof suggestion.mobile === "string" || suggestion.mobile === null) &&
    typeof suggestion.workSummary === "string" &&
    typeof suggestion.label === "string" &&
    typeof suggestion.messageDraft === "string" &&
    typeof suggestion.finishedAt === "string" &&
    typeof suggestion.statusName === "string" &&
    typeof suggestion.canSend === "boolean"
  );
}

function isNestPickupSuggestionList(value: unknown): value is NestPickupSuggestion[] {
  return Array.isArray(value) && value.every(isNestPickupSuggestion);
}

export function readCachedWorkorderSuggestionsEntry(): CachedWorkorderSuggestions | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedWorkorderSuggestions;
    if (!parsed?.storeOwnerId || !isNestPickupSuggestionList(parsed.suggestions)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function readCachedWorkorderSuggestions(): NestPickupSuggestion[] | null {
  return readCachedWorkorderSuggestionsEntry()?.suggestions ?? null;
}

export function writeCachedWorkorderSuggestions(
  storeOwnerId: string,
  suggestions: NestPickupSuggestion[],
): void {
  if (typeof window === "undefined") return;

  const payload: CachedWorkorderSuggestions = {
    storeOwnerId,
    suggestions,
    savedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function parseWorkorderSuggestionsResponse(json: unknown): {
  storeOwnerId: string | null;
  suggestions: NestPickupSuggestion[];
} | null {
  if (!json || typeof json !== "object") return null;

  const data = json as {
    storeOwnerId?: unknown;
    suggestions?: unknown;
  };

  const suggestions = Array.isArray(data.suggestions)
    ? data.suggestions.filter(isNestPickupSuggestion)
    : [];

  const storeOwnerId = typeof data.storeOwnerId === "string" ? data.storeOwnerId : null;

  return { storeOwnerId, suggestions };
}

export function findNewWorkorderSuggestionIds(
  previous: NestPickupSuggestion[],
  next: NestPickupSuggestion[],
): string[] {
  const previousIds = new Set(previous.map(suggestionKey));
  return next.map(suggestionKey).filter((id) => id && !previousIds.has(id));
}

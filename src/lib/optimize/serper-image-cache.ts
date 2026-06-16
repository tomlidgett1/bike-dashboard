import type { SpeedSearchCandidate } from "@/lib/admin/image-qa-speed";

export interface CachedImageRunShape {
  phase: "idle" | "selecting" | "ready";
  candidates: SpeedSearchCandidate[];
  selectedCandidates: SpeedSearchCandidate[];
  selectedUrls: string[];
  primaryUrl: string | null;
  photoSystem?: "smart_product_photos";
  reasoning?: string;
}

const emptyCachedRun = (): CachedImageRunShape => ({
  phase: "idle",
  candidates: [],
  selectedCandidates: [],
  selectedUrls: [],
  primaryUrl: null,
});

export interface SerperAiSelectionCache {
  selectedCandidates: SpeedSearchCandidate[];
  selectedUrls: string[];
  primaryUrl: string;
  photoSystem?: "smart_product_photos";
  reasoning?: string;
}

export interface SerperImageCacheEntry {
  canonicalProductId: string;
  searchQuery: string | null;
  fetchedAt: string | null;
  candidates: SpeedSearchCandidate[];
  aiSelection: SerperAiSelectionCache | null;
}

export function imageRunFromSerperCache(
  entry: SerperImageCacheEntry | null | undefined,
): CachedImageRunShape | null {
  if (!entry) return null;

  if (entry.aiSelection?.primaryUrl && entry.aiSelection.selectedCandidates.length > 0) {
    return {
      ...emptyCachedRun(),
      phase: "ready",
      candidates: entry.candidates,
      selectedCandidates: entry.aiSelection.selectedCandidates,
      selectedUrls: entry.aiSelection.selectedUrls,
      primaryUrl: entry.aiSelection.primaryUrl,
      photoSystem: entry.aiSelection.photoSystem,
      reasoning: entry.aiSelection.reasoning,
    };
  }

  if (entry.candidates.length > 0) {
    return {
      ...emptyCachedRun(),
      phase: "selecting",
      candidates: entry.candidates,
    };
  }

  return null;
}

export function parseSerperCacheRow(row: {
  id: string;
  serper_candidates?: unknown;
  serper_candidates_search_query?: string | null;
  serper_candidates_fetched_at?: string | null;
  serper_ai_selection?: unknown;
}): SerperImageCacheEntry {
  const candidates = Array.isArray(row.serper_candidates)
    ? (row.serper_candidates as SpeedSearchCandidate[])
    : [];

  const rawAi = row.serper_ai_selection as Partial<SerperAiSelectionCache> | null;
  const aiSelection =
    rawAi?.primaryUrl && Array.isArray(rawAi.selectedCandidates)
      ? {
          selectedCandidates: rawAi.selectedCandidates as SpeedSearchCandidate[],
          selectedUrls: Array.isArray(rawAi.selectedUrls) ? rawAi.selectedUrls : [],
          primaryUrl: rawAi.primaryUrl,
          photoSystem:
            rawAi.photoSystem === "smart_product_photos"
              ? ("smart_product_photos" as const)
              : undefined,
          reasoning: rawAi.reasoning,
        }
      : null;

  return {
    canonicalProductId: row.id,
    searchQuery: row.serper_candidates_search_query ?? null,
    fetchedAt: row.serper_candidates_fetched_at ?? null,
    candidates,
    aiSelection,
  };
}

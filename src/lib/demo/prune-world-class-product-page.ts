import type {
  WorldClassBrandStory,
  WorldClassComparison,
  WorldClassHighlight,
  WorldClassImage,
  WorldClassInsight,
  WorldClassKeyStat,
  WorldClassProductKind,
  WorldClassProductPage,
  WorldClassResearchMeta,
  WorldClassRiderFit,
  WorldClassSource,
  WorldClassSpecSection,
  WorldClassTechItem,
  WorldClassVideo,
} from "./world-class-product-page-types";

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Prose must never contain URLs — the model occasionally leaks citations. */
function cleanProse(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  const stripped = text
    // Markdown links → keep the label only.
    .replace(/\[([^\]]*)\]\((?:https?:\/\/|www\.)[^)]*\)/gi, "$1")
    // Bare URLs.
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "")
    // Bare domains left behind, e.g. "media.trekbikes.com".
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|cc|bike|au)(?:\/\S*)?/gi, "")
    // Empty brackets and doubled punctuation left after removal.
    .replace(/\(\s*[,;.\s]*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[,.;:\s]+$/g, (match) => (match.trim().startsWith(".") ? "." : ""))
    .trim();
  return stripped.length > 0 ? stripped : null;
}

function cleanProseList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanProse(item))
    .filter((item): item is string => !!item);
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item))
    .filter((item): item is string => !!item);
}

function pruneKeyStats(value: unknown): WorldClassKeyStat[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = cleanString(row.label);
      const val = cleanString(row.value);
      if (!label || !val) return null;
      return { label, value: val };
    })
    .filter((item): item is WorldClassKeyStat => !!item);
}

function pruneHighlights(value: unknown): WorldClassHighlight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = cleanString(row.title);
      const description = cleanProse(row.description);
      if (!title || !description) return null;
      return { title, description };
    })
    .filter((item): item is WorldClassHighlight => !!item);
}

function pruneSpecifications(value: unknown): WorldClassSpecSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = cleanString(row.title);
      if (!title) return null;
      const specs = Array.isArray(row.specs)
        ? row.specs
            .map((spec) => {
              if (!spec || typeof spec !== "object") return null;
              const s = spec as Record<string, unknown>;
              const label = cleanString(s.label);
              const val = cleanString(s.value);
              if (!label || !val) return null;
              return { label, value: val };
            })
            .filter(
              (spec): spec is { label: string; value: string } => !!spec,
            )
        : [];
      if (specs.length === 0) return null;
      return { title, specs };
    })
    .filter((item): item is WorldClassSpecSection => !!item);
}

function pruneTechnology(value: unknown): WorldClassTechItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = cleanString(row.name);
      const description = cleanProse(row.description);
      if (!name || !description) return null;
      return { name, description };
    })
    .filter((item): item is WorldClassTechItem => !!item);
}

function pruneRiderFit(value: unknown): WorldClassRiderFit | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const bestFor = cleanProseList(row.bestFor);
  const notIdealFor = cleanProseList(row.notIdealFor);
  const ridingStyles = cleanStringList(row.ridingStyles);
  const sizingNotes = cleanProse(row.sizingNotes);
  if (
    bestFor.length === 0 &&
    notIdealFor.length === 0 &&
    ridingStyles.length === 0 &&
    !sizingNotes
  ) {
    return null;
  }
  return { bestFor, notIdealFor, ridingStyles, sizingNotes };
}

function pruneBrandStory(value: unknown): WorldClassBrandStory | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = cleanString(row.name);
  const paragraphs = cleanProseList(row.paragraphs);
  if (!name || paragraphs.length === 0) return null;
  return {
    name,
    established: cleanString(row.established),
    origin: cleanString(row.origin),
    tagline: cleanProse(row.tagline),
    paragraphs,
    highlights: cleanProseList(row.highlights),
  };
}

function pruneComparisons(
  value: unknown,
  competitorImages?: Map<string, string | null>,
): WorldClassComparison[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const competitor = cleanString(row.competitor);
      const summary = cleanProse(row.summary);
      if (!competitor || !summary) return null;
      const imageUrl = competitorImages?.get(competitor) ?? null;
      return {
        competitor,
        summary,
        thisBikeWins: cleanProseList(
          row.thisBikeWins ?? row.thisProductWins,
        ),
        competitorWins: cleanProseList(row.competitorWins),
        competitorImageUrl: imageUrl?.startsWith("http") ? imageUrl : null,
      };
    })
    .filter((item): item is WorldClassComparison => !!item);
}

function pruneInsights(value: unknown): WorldClassInsight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = cleanString(row.title);
      const body = cleanProse(row.body);
      if (!title || !body) return null;
      return { title, body };
    })
    .filter((item): item is WorldClassInsight => !!item);
}

/** Strip tracking params; the query string rarely changes the page content. */
function normaliseSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["ref", "gclid", "scope"].includes(key)) {
        parsed.searchParams.delete(key);
      }
    }
    const cleaned = parsed.toString();
    return cleaned.endsWith("?") ? cleaned.slice(0, -1) : cleaned;
  } catch {
    return url;
  }
}

/** Same article regardless of remaining query params / trailing slash. */
function sourceDedupeKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

function pruneSources(value: unknown): WorldClassSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Map<string, WorldClassSource>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const rawUrl = cleanString(row.url);
    if (!rawUrl || !rawUrl.startsWith("http")) continue;
    const url = normaliseSourceUrl(rawUrl);
    const key = sourceDedupeKey(url);
    const existing = seen.get(key);
    if (existing) {
      // Prefer the shorter (cleaner) URL and upgrade the official flag.
      if (url.length < existing.url.length) existing.url = url;
      if (row.isOfficialBrand === true && !existing.isOfficialBrand) {
        existing.isOfficialBrand = true;
      }
      continue;
    }
    seen.set(key, {
      url,
      title: cleanString(row.title) || url,
      isOfficialBrand: row.isOfficialBrand === true,
    });
  }
  return [...seen.values()];
}

export function pruneImages(images: WorldClassImage[]): WorldClassImage[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.url?.startsWith("http")) return false;
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

export function pruneVideos(videos: WorldClassVideo[]): WorldClassVideo[] {
  const seen = new Set<string>();
  return videos.filter((video) => {
    if (!video.videoId || !/^[\w-]{11}$/.test(video.videoId)) return false;
    if (seen.has(video.videoId)) return false;
    seen.add(video.videoId);
    return true;
  });
}

/** Merge key stats, official first, deduplicating on normalised label. */
function mergeKeyStats(
  official: WorldClassKeyStat[],
  editorial: WorldClassKeyStat[],
): WorldClassKeyStat[] {
  const seen = new Set(official.map((stat) => stat.label.toLowerCase().trim()));
  const merged = [...official];
  for (const stat of editorial) {
    const key = stat.label.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(stat);
  }
  return merged.slice(0, 10);
}

/**
 * Assemble the final page from the two research passes.
 * Official extraction wins for identity, specs and technology;
 * the editorial pass supplies editorial copy, fit, brand story and comparisons.
 */
export function buildWorldClassProductPage(input: {
  query: string;
  productKind?: WorldClassProductKind;
  official: Record<string, unknown>;
  editorial: Record<string, unknown>;
  research: WorldClassResearchMeta;
  images: WorldClassImage[];
  videos: WorldClassVideo[];
  citationSources?: WorldClassSource[];
  brandLogoUrl?: string | null;
  competitorImages?: Map<string, string | null>;
}): WorldClassProductPage {
  const { official, editorial } = input;
  const productKind: WorldClassProductKind =
    input.productKind === "non_bike" ? "non_bike" : "bike";
  const fallbackName = productKind === "non_bike" ? "Product" : "Bicycle";
  const productName =
    cleanString(official.productName) || input.query.trim() || fallbackName;

  const allSources = pruneSources([
    ...(Array.isArray(official.sources) ? official.sources : []),
    ...(Array.isArray(editorial.sources) ? editorial.sources : []),
    ...(input.citationSources ?? []),
  ]);
  // Official brand pages always lead the source list.
  const sources = [
    ...allSources.filter((source) => source.isOfficialBrand),
    ...allSources.filter((source) => !source.isOfficialBrand),
  ];

  return {
    productKind,
    productName,
    brand: cleanString(official.brand),
    brandLogoUrl:
      input.brandLogoUrl?.startsWith("http") === true ? input.brandLogoUrl : null,
    model: cleanString(official.model),
    modelYear: cleanString(official.modelYear),
    bikeType:
      productKind === "bike" ? cleanString(official.bikeType) : null,
    productCategory:
      productKind === "non_bike"
        ? cleanString(official.productCategory) ||
          cleanString(official.bikeType)
        : null,
    tagline: cleanProse(editorial.tagline),
    heroSummary: cleanProse(editorial.heroSummary),
    keyStats: mergeKeyStats(
      pruneKeyStats(official.keyStats),
      pruneKeyStats(editorial.keyStats),
    ),
    overviewParagraphs: cleanProseList(editorial.overviewParagraphs),
    idealRider: cleanProse(editorial.idealRider),
    highlights: pruneHighlights(editorial.highlights),
    specifications: pruneSpecifications(official.specifications),
    technology: pruneTechnology(official.technology),
    riderFit: pruneRiderFit(editorial.riderFit),
    brandStory: pruneBrandStory(editorial.brandStory),
    comparisons: pruneComparisons(editorial.comparisons, input.competitorImages),
    expertInsights: pruneInsights(editorial.expertInsights),
    images: pruneImages(input.images),
    videos: pruneVideos(input.videos),
    sources,
    research: {
      ...input.research,
      officialSourceCount: sources.filter((s) => s.isOfficialBrand).length,
      totalSourceCount: sources.length,
    },
    generatedAt: new Date().toISOString(),
    query: input.query.trim(),
  };
}

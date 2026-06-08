export interface BikeSpecItem {
  label: string;
  value: string;
}

export interface BikeSpecSection {
  title: string;
  specs: BikeSpecItem[];
}

export interface BikeSpecSource {
  url: string;
  title: string;
  is_official_brand: boolean;
}

export interface BikeSpecsMetadata {
  primary_source_url: string;
  primary_source_title: string;
  brand_website?: string | null;
  discovered_at?: string;
  sources: BikeSpecSource[];
}

export interface BikeSpecsData {
  sections: BikeSpecSection[];
  metadata?: BikeSpecsMetadata | null;
}

export function parseBikeSpecs(raw: unknown): BikeSpecsData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as BikeSpecsData;
  if (!Array.isArray(data.sections)) return null;

  const metadata =
    data.metadata && typeof data.metadata === "object"
      ? {
          primary_source_url: String(data.metadata.primary_source_url || "").trim(),
          primary_source_title: String(data.metadata.primary_source_title || "").trim(),
          brand_website: data.metadata.brand_website
            ? String(data.metadata.brand_website).trim()
            : null,
          discovered_at: data.metadata.discovered_at
            ? String(data.metadata.discovered_at)
            : undefined,
          sources: Array.isArray(data.metadata.sources)
            ? data.metadata.sources
                .filter((source) => source && source.url)
                .map((source) => ({
                  url: String(source.url).trim(),
                  title: String(source.title || source.url).trim(),
                  is_official_brand: !!source.is_official_brand,
                }))
            : [],
        }
      : null;

  return {
    sections: data.sections
      .filter((section) => section && typeof section.title === "string")
      .map((section) => ({
        title: section.title,
        specs: Array.isArray(section.specs)
          ? section.specs
              .filter((spec) => spec && spec.label && spec.value)
              .map((spec) => ({
                label: String(spec.label).trim(),
                value: String(spec.value).trim(),
              }))
          : [],
      }))
      .filter((section) => section.specs.length > 0),
    metadata:
      metadata &&
      metadata.primary_source_url &&
      metadata.sources.length > 0
        ? metadata
        : metadata?.sources.length
          ? metadata
          : null,
  };
}

export function hasBikeSpecs(data: BikeSpecsData | null | undefined): boolean {
  return !!data?.sections?.some((section) => section.specs.length > 0);
}

export function hasBikeSpecSources(data: BikeSpecsData | null | undefined): boolean {
  return !!data?.metadata?.sources?.length;
}

export const BIKE_SPEC_SECTION_HINTS = [
  "General",
  "Frame",
  "Brakes",
  "Wheels & Tyres",
  "Cockpit",
  "Groupset",
  "Saddle",
] as const;

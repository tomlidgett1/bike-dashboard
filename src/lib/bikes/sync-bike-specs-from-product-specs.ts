import { resolveBrandWebsite } from "@/lib/bikes/brand-websites";
import {
  hasBikeSpecs,
  parseBikeSpecs,
  type BikeSpecSection,
  type BikeSpecSource,
  type BikeSpecsData,
} from "@/lib/types/bike-specs";

function parseBulletLine(line: string): { label: string; value: string } | null {
  const trimmed = line.trim();
  if (!/^[-•*]\s+/.test(trimmed)) return null;

  const content = trimmed.replace(/^[-•*]\s+/, "");

  const boldDash = content.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
  if (boldDash) {
    return { label: boldDash[1].trim(), value: boldDash[2].trim() };
  }

  const boldColon = content.match(/^\*\*(.+?)\*\*\s*:\s*(.+)$/);
  if (boldColon) {
    return { label: boldColon[1].trim(), value: boldColon[2].trim() };
  }

  const colonIdx = content.indexOf(":");
  if (colonIdx > 0) {
    return {
      label: content
        .slice(0, colonIdx)
        .replace(/^\*\*|\*\*$/g, "")
        .trim(),
      value: content.slice(colonIdx + 1).trim(),
    };
  }

  return null;
}

/** Parse markdown spec sheets from the Product Optimise copy flow into structured sections. */
export function parseProductSpecsMarkdown(text: string): BikeSpecSection[] | null {
  const sections: BikeSpecSection[] = [];
  let current: BikeSpecSection | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (sectionMatch) {
      if (current && current.specs.length > 0) sections.push(current);
      current = { title: sectionMatch[1].trim(), specs: [] };
      continue;
    }

    const bullet = parseBulletLine(line);
    if (!bullet?.label || !bullet.value) continue;

    if (!current) {
      current = { title: "Specifications", specs: [] };
    }
    current.specs.push(bullet);
  }

  if (current && current.specs.length > 0) sections.push(current);
  return sections.length > 0 ? sections : null;
}

export function buildBikeSpecsFromProductSpecs(
  productSpecs: string,
  sources: BikeSpecSource[],
  brand?: string | null,
): BikeSpecsData | null {
  const sections = parseProductSpecsMarkdown(productSpecs);
  if (!sections?.length) return null;

  const official = sources.filter((source) => source.is_official_brand);
  const primary = official[0] ?? sources[0];

  return {
    sections,
    metadata: sources.length
      ? {
          primary_source_url: primary?.url ?? "",
          primary_source_title: primary?.title ?? "Manufacturer specifications",
          brand_website: resolveBrandWebsite(brand ?? undefined) ?? null,
          discovered_at: new Date().toISOString(),
          sources,
        }
      : null,
  };
}

/** Build structured bike_specs from optimise-flow product_specs when bike_specs is empty. */
export function syncBikeSpecsFromProductSpecs(options: {
  productSpecs: string | null | undefined;
  existingBikeSpecs: unknown;
  productSpecSources?: BikeSpecSource[] | null;
  brand?: string | null;
}): BikeSpecsData | null {
  const existing = parseBikeSpecs(options.existingBikeSpecs);
  if (hasBikeSpecs(existing)) return existing;

  const text = options.productSpecs?.trim();
  if (!text) return null;

  return buildBikeSpecsFromProductSpecs(
    text,
    options.productSpecSources ?? [],
    options.brand,
  );
}

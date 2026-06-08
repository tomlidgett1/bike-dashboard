import type { BikeSpecExploreImage } from "@/lib/ai/bike-spec-explore-schema";
import {
  getOfficialSearchDomains,
  isOfficialSpecSourceUrl,
} from "@/lib/bikes/official-spec-sources";

interface SerperImageHit {
  title?: string;
  imageUrl?: string;
  link?: string;
  domain?: string;
}

const MAX_IMAGES = 4;
const SERPER_RESULTS_PER_QUERY = 12;

function isBlockedRetailerUrl(url: string): boolean {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const blocked = [
      "amazon.",
      "ebay.",
      "wiggle.",
      "pushys.",
      "rei.com",
      "evanscycles",
      "chainreaction",
      "probikeshop",
      "jensonusa",
      "competitivecyclist",
      "decathlon.",
      "backcountry",
      "bikeexchange",
      "facebook.",
      "instagram.",
      "pinterest.",
      "reddit.",
      "youtube.",
      "google.",
      "bing.",
    ];
    return blocked.some((fragment) => domain.includes(fragment));
  } catch {
    return true;
  }
}

function isUsableImageHit(hit: SerperImageHit): boolean {
  const url = hit.imageUrl?.trim();
  const sourceUrl = hit.link?.trim();
  if (!url?.startsWith("https://")) return false;
  if (isBlockedRetailerUrl(url)) return false;
  if (sourceUrl && isBlockedRetailerUrl(sourceUrl)) return false;
  return true;
}

function hitToExploreImage(
  hit: SerperImageHit,
  fallbackCaption: string
): BikeSpecExploreImage | null {
  if (!isUsableImageHit(hit)) return null;

  const url = hit.imageUrl!.trim();
  const source_url = hit.link?.trim() || url;
  const caption = (hit.title || hit.domain || fallbackCaption).trim();

  return {
    url,
    caption,
    source_url,
    source_title: (hit.title || hit.domain || source_url).trim(),
  };
}

async function searchSerperImagesDirect(
  query: string,
  apiKey: string
): Promise<SerperImageHit[]> {
  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: SERPER_RESULTS_PER_QUERY,
      gl: "au",
    }),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as { images?: SerperImageHit[] };
  return data.images ?? [];
}

async function searchSerperImagesViaEdge(query: string): Promise<SerperImageHit[]> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) return [];

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/search-product-images`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ searchQuery: query }),
    }
  );

  if (!response.ok) return [];

  const data = (await response.json()) as {
    success?: boolean;
    results?: Array<{
      url?: string;
      title?: string;
      domain?: string;
    }>;
  };

  if (!data.success || !Array.isArray(data.results)) return [];

  return data.results.map((result) => ({
    imageUrl: result.url,
    title: result.title,
    link: result.url,
    domain: result.domain,
  }));
}

async function runSerperQuery(query: string): Promise<SerperImageHit[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (apiKey) {
    const direct = await searchSerperImagesDirect(query, apiKey);
    if (direct.length > 0) return direct;
  }
  return searchSerperImagesViaEdge(query);
}

function buildSerperQueries(specValue: string, officialDomains: string[]): string[] {
  const queries: string[] = [];

  for (const domain of officialDomains.slice(0, 3)) {
    queries.push(`site:${domain} ${specValue}`);
  }

  if (officialDomains.length > 0) {
    queries.push(`${specValue} site:${officialDomains[0]}`);
  }

  queries.push(`${specValue} bicycle component official`);

  return Array.from(new Set(queries));
}

function rankExploreImages(
  images: BikeSpecExploreImage[],
  options: { bikeBrand?: string | null; specValue: string }
): BikeSpecExploreImage[] {
  return [...images].sort((a, b) => {
    const aOfficial = isOfficialSpecSourceUrl(a.source_url, options) ? 0 : 1;
    const bOfficial = isOfficialSpecSourceUrl(b.source_url, options) ? 0 : 1;
    if (aOfficial !== bOfficial) return aOfficial - bOfficial;

    const aImageOfficial = isOfficialSpecSourceUrl(a.url, options) ? 0 : 1;
    const bImageOfficial = isOfficialSpecSourceUrl(b.url, options) ? 0 : 1;
    return aImageOfficial - bImageOfficial;
  });
}

export async function searchBikeSpecImages(options: {
  specValue: string;
  bikeBrand?: string | null;
}): Promise<BikeSpecExploreImage[]> {
  const sourceOptions = {
    bikeBrand: options.bikeBrand,
    specValue: options.specValue,
  };
  const officialDomains = getOfficialSearchDomains(sourceOptions);
  const queries = buildSerperQueries(options.specValue, officialDomains);

  const seenUrls = new Set<string>();
  const collected: BikeSpecExploreImage[] = [];

  for (const query of queries) {
    if (collected.length >= MAX_IMAGES * 3) break;

    const hits = await runSerperQuery(query);
    for (const hit of hits) {
      const image = hitToExploreImage(hit, options.specValue);
      if (!image || seenUrls.has(image.url)) continue;

      seenUrls.add(image.url);
      collected.push(image);
    }
  }

  const ranked = rankExploreImages(collected, sourceOptions);

  const official = ranked.filter((image) =>
    isOfficialSpecSourceUrl(image.source_url, sourceOptions)
  );
  const other = ranked.filter(
    (image) => !isOfficialSpecSourceUrl(image.source_url, sourceOptions)
  );

  return [...official, ...other].slice(0, MAX_IMAGES);
}

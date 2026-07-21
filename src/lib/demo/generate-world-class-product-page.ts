import OpenAI from "openai";
import {
  brandWebsiteDomain,
  resolveBrandWebsite,
} from "@/lib/bikes/brand-websites";
import { extractYoutubeVideoId } from "@/lib/genie/youtube-video-search";
import { searchBrandLogoImages } from "@/lib/store/brand-logo-serper";
import { buildWorldClassProductPage } from "./prune-world-class-product-page";
import {
  verifyCompetitorImages,
  verifyWorldClassImages,
} from "./verify-world-class-images";
import {
  editorialPromptForKind,
  editorialSchemaForKind,
  officialExtractPromptForKind,
  officialExtractSchemaForKind,
} from "./world-class-product-page-schema";
import type {
  GenerateProgressEvent,
  WorldClassImage,
  WorldClassProductKind,
  WorldClassProductPage,
  WorldClassSource,
  WorldClassVideo,
} from "./world-class-product-page-types";

const MODEL = "gpt-5.4";
const FAST_MODEL = "gpt-5.4-mini";

type ResponseOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{ type?: string; url?: string; title?: string }>;
  }>;
};

type SerperImageHit = {
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  link?: string;
  domain?: string;
};

type SerperVideoHit = {
  title?: string;
  link?: string;
  imageUrl?: string;
  channel?: string;
  duration?: string;
};

export type GenerateWorldClassOptions = {
  productName: string;
  /** Bike (default) or accessory/part. */
  productKind?: WorldClassProductKind;
  onProgress?: (event: GenerateProgressEvent) => void | Promise<void>;
};

function normaliseProductKind(kind: unknown): WorldClassProductKind {
  return kind === "non_bike" ? "non_bike" : "bike";
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function isOnDomain(url: string, domain: string | null): boolean {
  if (!domain) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const target = domain.toLowerCase();
    return host === target || host.endsWith(`.${target}`);
  } catch {
    return false;
  }
}

function extractCitations(
  output: ResponseOutputItem[] | undefined,
  officialDomain: string | null,
): WorldClassSource[] {
  const seen = new Set<string>();
  const citations: WorldClassSource[] = [];
  for (const item of output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type !== "output_text") continue;
      for (const ann of content.annotations ?? []) {
        if (ann.type !== "url_citation" || !ann.url || seen.has(ann.url)) continue;
        seen.add(ann.url);
        citations.push({
          url: ann.url,
          title: ann.title || ann.url,
          isOfficialBrand: isOnDomain(ann.url, officialDomain),
        });
      }
    }
  }
  return citations;
}

function countWebSearches(output: ResponseOutputItem[] | undefined): number {
  return (output ?? []).filter((item) => item.type === "web_search_call").length;
}

function guessBrandFromName(productName: string): string | null {
  const first = productName.trim().split(/\s+/)[0];
  if (!first || first.length < 2) return null;
  return first;
}

function isBlockedImageHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const blocked = [
      "facebook.",
      "instagram.",
      "pinterest.",
      "reddit.",
      "tiktok.",
      "google.",
      "bing.",
      "ebay.",
      "amazon.",
    ];
    return blocked.some((fragment) => host.includes(fragment));
  } catch {
    return true;
  }
}

async function searchSerperImages(
  query: string,
  num: number,
): Promise<SerperImageHit[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (apiKey) {
    const response = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num, gl: "au" }),
    });
    if (response.ok) {
      const data = (await response.json()) as { images?: SerperImageHit[] };
      return data.images ?? [];
    }
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
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
    },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as {
    success?: boolean;
    results?: Array<{ url?: string; title?: string; domain?: string }>;
  };
  if (!data.success || !Array.isArray(data.results)) return [];
  return data.results.map((result) => ({
    imageUrl: result.url,
    title: result.title,
    link: result.url,
    domain: result.domain,
  }));
}

async function searchSerperVideos(
  query: string,
  num: number,
): Promise<SerperVideoHit[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (apiKey) {
    const response = await fetch("https://google.serper.dev/videos", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num, gl: "au" }),
    });
    if (response.ok) {
      const data = (await response.json()) as { videos?: SerperVideoHit[] };
      return data.videos ?? [];
    }
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return [];

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/search-youtube-videos`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ searchQuery: query, limit: num }),
    },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as {
    success?: boolean;
    results?: Array<{
      title?: string;
      link?: string | null;
      channel?: string | null;
      thumbnailUrl?: string | null;
    }>;
  };
  if (!data.success || !Array.isArray(data.results)) return [];
  return data.results.map((result) => ({
    title: result.title,
    link: result.link ?? undefined,
    channel: result.channel ?? undefined,
    imageUrl: result.thumbnailUrl ?? undefined,
  }));
}

/** Meaningful tokens from a product name (drops filler words and tiny tokens). */
function productNameTokens(productName: string): string[] {
  return productName
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((token) => token.length >= 2 && !["the", "and", "gen", "with"].includes(token));
}

function scoreImageHit(
  hit: SerperImageHit,
  tokens: string[],
  brand: string | null,
  brandDomain: string | null,
): number {
  const haystack = `${hit.title ?? ""} ${hit.link ?? ""} ${hit.domain ?? ""}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }
  if (brand && haystack.includes(brand.toLowerCase())) score += 2;
  if (brandDomain && haystack.includes(brandDomain.toLowerCase())) score += 6;
  return score;
}

async function discoverProductImages(
  productName: string,
  brand: string | null,
  brandDomain: string | null,
  productKind: WorldClassProductKind,
): Promise<WorldClassImage[]> {
  // Plain variants are required: the Supabase edge search 500s on operator
  // queries (site:, quotes), which only work via the direct Serper API.
  const queries: string[] = [];
  if (brandDomain) {
    queries.push(`site:${brandDomain} ${productName}`);
  }
  if (productKind === "non_bike") {
    queries.push(`${productName} product photo`);
    queries.push(`${productName} official`);
    queries.push(`${productName} detail`);
    queries.push(`${productName} cycling`);
  } else {
    queries.push(`${productName} bike`);
    queries.push(`${productName} review photos`);
    queries.push(`${productName} riding action`);
  }

  const tokens = productNameTokens(productName);
  // Require at least the model portion (non-brand tokens) to loosely match.
  const minScore = Math.max(2, Math.floor(tokens.length / 2));

  const seen = new Set<string>();
  const scored: Array<{ image: WorldClassImage; score: number }> = [];

  for (const [index, query] of queries.entries()) {
    const hits = await searchSerperImages(query, 14);
    for (const hit of hits) {
      const url = hit.imageUrl?.trim();
      if (!url?.startsWith("http") || seen.has(url)) continue;
      if (isBlockedImageHost(url)) continue;
      if (hit.link && isBlockedImageHost(hit.link)) continue;
      seen.add(url);

      const score = scoreImageHit(hit, tokens, brand, brandDomain);
      if (score < minScore) continue;

      const role: WorldClassImage["role"] = /riding|action|lifestyle|in use/i.test(
        query,
      )
        ? "lifestyle"
        : index === 0 || /detail/i.test(query)
          ? "detail"
          : "gallery";

      scored.push({
        image: {
          url,
          caption: (hit.title || productName).trim() || productName,
          sourceUrl: hit.link?.startsWith("http") ? hit.link : null,
          role,
        },
        score,
      });
    }
    if (scored.length >= 40) break;
  }

  // Generous cap: this is only a candidate pool — the vision verification
  // pass downstream is the real filter, and it works best with options.
  scored.sort((a, b) => b.score - a.score);
  const images = scored.slice(0, 22).map((entry) => entry.image);
  if (images[0]) images[0] = { ...images[0], role: "hero" };
  return images;
}

async function discoverProductVideos(
  productName: string,
  brand: string | null,
  productKind: WorldClassProductKind,
): Promise<WorldClassVideo[]> {
  const queries =
    productKind === "non_bike"
      ? [
          `${productName} review`,
          `${productName} setup`,
          brand ? `${brand} ${productName} official` : `${productName} official`,
        ]
      : [
          `${productName} review`,
          `${productName} first ride`,
          brand ? `${brand} ${productName} official` : `${productName} official`,
        ];

  const seen = new Set<string>();
  const videos: WorldClassVideo[] = [];

  for (const query of queries) {
    if (videos.length >= 4) break;
    const hits = await searchSerperVideos(query, 8);
    for (const hit of hits) {
      const link = hit.link?.trim();
      if (!link) continue;
      const videoId = extractYoutubeVideoId(link);
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      videos.push({
        videoId,
        title: (hit.title || productName).trim() || productName,
        channel: hit.channel?.trim() || null,
        thumbnailUrl:
          hit.imageUrl?.startsWith("http") ? hit.imageUrl : null,
      });
      if (videos.length >= 4) break;
    }
  }

  return videos;
}

const IMAGE_PROBE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Confirm an image URL actually serves bytes — kills 403/404/hotlink-dead links. */
async function isImageUrlLoadable(url: string): Promise<boolean> {
  const probe = async (init: RequestInit): Promise<Response | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const head = await probe({
    method: "HEAD",
    headers: { "User-Agent": IMAGE_PROBE_UA },
  });
  if (head?.ok) {
    const type = head.headers.get("content-type") ?? "";
    return type === "" || type.startsWith("image/");
  }

  // Some CDNs reject HEAD; retry with a tiny ranged GET before giving up.
  const get = await probe({
    headers: { "User-Agent": IMAGE_PROBE_UA, Range: "bytes=0-2047" },
  });
  if (!get?.ok) return false;
  const type = get.headers.get("content-type") ?? "";
  get.body?.cancel().catch(() => {});
  return type === "" || type.startsWith("image/");
}

async function filterLoadableImages(
  images: WorldClassImage[],
): Promise<WorldClassImage[]> {
  const checks = await Promise.all(
    images.map(async (image) => ((await isImageUrlLoadable(image.url)) ? image : null)),
  );
  return checks.filter((image): image is WorldClassImage => !!image);
}

/** Find one clean product photo of a rival, preferring its brand's own site. */
async function discoverCompetitorImage(
  competitor: string,
  productKind: WorldClassProductKind,
): Promise<string | null> {
  const tokens = productNameTokens(competitor);
  const brandSite = resolveBrandWebsite(competitor.split(/\s+/)[0]);
  const domain = brandSite ? brandWebsiteDomain(brandSite) : null;
  // NOTE: the Supabase edge search rejects queries with operators (site:, quotes),
  // so plain queries must always be present as fallbacks.
  const queries = [
    ...(domain ? [`site:${domain} ${competitor}`] : []),
    productKind === "bike" ? `${competitor} bike` : `${competitor} cycling`,
    `${competitor} product photo`,
  ];

  for (const query of queries) {
    const hits = await searchSerperImages(query, 10);
    let best: SerperImageHit | null = null;
    let bestScore = 1;
    for (const hit of hits) {
      const url = hit.imageUrl?.trim();
      if (!url?.startsWith("http")) continue;
      if (isBlockedImageHost(url)) continue;
      if (hit.link && isBlockedImageHost(hit.link)) continue;
      const score = scoreImageHit(hit, tokens, null, domain);
      if (score > bestScore) {
        best = hit;
        bestScore = score;
      }
    }
    if (best?.imageUrl) {
      const url = best.imageUrl.trim();
      if (await isImageUrlLoadable(url)) return url;
    }
  }
  return null;
}

async function discoverCompetitorImages(
  editorialData: Record<string, unknown>,
  productKind: WorldClassProductKind,
): Promise<Map<string, string | null>> {
  const names = Array.isArray(editorialData.comparisons)
    ? editorialData.comparisons
        .map((item) =>
          item && typeof item === "object"
            ? (item as { competitor?: unknown }).competitor
            : null,
        )
        .filter((name): name is string => typeof name === "string" && !!name.trim())
    : [];

  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        return [name, await discoverCompetitorImage(name, productKind)] as const;
      } catch {
        return [name, null] as const;
      }
    }),
  );
  return new Map(entries);
}

async function discoverBrandLogo(
  brand: string | null,
  brandDomain: string | null,
  productKind: WorldClassProductKind,
): Promise<string | null> {
  if (!brand) return null;
  try {
    const logoQuery =
      productKind === "non_bike"
        ? `${brand} cycling brand logo transparent png`
        : `${brand} bicycle brand logo transparent png`;
    const { results } = await searchBrandLogoImages({
      query: logoQuery,
      brandName: brand,
    });
    if (results.length === 0) return null;
    // Prefer a logo hosted on (or sourced from) the brand's own domain.
    const official = brandDomain
      ? results.find((hit) =>
          `${hit.url} ${hit.sourceUrl ?? ""} ${hit.domain ?? ""}`
            .toLowerCase()
            .includes(brandDomain.toLowerCase()),
        )
      : null;
    return (official ?? results[0]).url;
  } catch {
    return null;
  }
}

type ResearchPassResult = {
  data: Record<string, unknown>;
  citations: WorldClassSource[];
  webSearchCount: number;
};

/**
 * Run one structured research pass with hosted web search.
 * Retries once with a harder instruction if the model cited no web pages —
 * uncited output means it answered from memory, which we refuse.
 */
async function runResearchPass(
  openai: OpenAI,
  options: {
    instructions: string;
    input: string;
    schemaName: string;
    schema: Record<string, unknown>;
    officialDomain: string | null;
    requireCitations: boolean;
  },
): Promise<ResearchPassResult> {
  let webSearchCount = 0;

  const runOnce = async (extraNudge?: string): Promise<ResearchPassResult | null> => {
    const response = await openai.responses.create({
      model: MODEL,
      instructions: options.instructions,
      tools: [
        {
          type: "web_search_preview" as const,
          search_context_size: "high" as const,
          user_location: { type: "approximate" as const, country: "AU" },
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: options.schemaName,
          strict: true,
          schema: options.schema,
        },
      },
      input: extraNudge ? `${options.input}\n\n${extraNudge}` : options.input,
    });

    const output = response.output as ResponseOutputItem[] | undefined;
    webSearchCount += countWebSearches(output);

    let outputText = "";
    for (const item of output ?? []) {
      if (item.type !== "message") continue;
      for (const content of item.content ?? []) {
        if (content.type === "output_text" && content.text) {
          outputText += content.text;
        }
      }
    }

    const data = extractJsonObject(outputText);
    if (!data) return null;

    const citations = extractCitations(output, options.officialDomain);
    const sourcesInData = Array.isArray(data.sources) ? data.sources.length : 0;
    if (options.requireCitations && citations.length === 0 && sourcesInData === 0) {
      return null;
    }
    return { data, citations, webSearchCount };
  };

  const first = await runOnce();
  if (first) return { ...first, webSearchCount };

  const retry = await runOnce(
    "IMPORTANT: your previous attempt was rejected because it cited no web pages. You MUST use the web search tool now — open real pages, extract only what they publish, and list every page in sources. Content without live web sources will be discarded.",
  );
  if (retry) return { ...retry, webSearchCount };

  throw new Error(
    "Research pass could not verify this product from live web sources. Check the brand and model name.",
  );
}

/**
 * Resolve the brand's official website domain from the live web when it is
 * not in the known-brands map. Never guessed from training data alone —
 * the lookup itself runs through hosted web search.
 */
async function resolveOfficialDomainOnline(
  openai: OpenAI,
  productName: string,
  guessedBrand: string | null,
  productKind: WorldClassProductKind,
): Promise<{ brand: string | null; domain: string | null }> {
  const known = resolveBrandWebsite(guessedBrand);
  if (known) {
    return { brand: guessedBrand, domain: brandWebsiteDomain(known) };
  }

  const productLabel =
    productKind === "non_bike"
      ? "cycling accessory or component"
      : "bicycle";

  try {
    const response = await openai.responses.create({
      model: FAST_MODEL,
      instructions:
        productKind === "non_bike"
          ? "You identify cycling product manufacturers' official websites using web search. Search the web, confirm the manufacturer's own domain (never a retailer, marketplace or review site), and answer with JSON only."
          : "You identify bicycle manufacturers' official websites using web search. Search the web, confirm the manufacturer's own domain (never a retailer, marketplace or review site), and answer with JSON only.",
      tools: [{ type: "web_search_preview" as const }],
      text: {
        format: {
          type: "json_schema",
          name: "brand_domain",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["brand", "domain"],
            properties: {
              brand: { type: ["string", "null"] },
              domain: { type: ["string", "null"] },
            },
          },
        },
      },
      input: `Which company manufactures the ${productLabel} "${productName}", and what is that manufacturer's official website domain (e.g. "giro.com" or "focus-bikes.com")? Verify via web search.`,
    });

    let outputText = "";
    for (const item of (response.output as ResponseOutputItem[] | undefined) ?? []) {
      if (item.type !== "message") continue;
      for (const content of item.content ?? []) {
        if (content.type === "output_text" && content.text) outputText += content.text;
      }
    }
    const parsed = extractJsonObject(outputText);
    const domain =
      typeof parsed?.domain === "string"
        ? parsed.domain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
        : null;
    const brand = typeof parsed?.brand === "string" ? parsed.brand.trim() : guessedBrand;
    return { brand: brand || guessedBrand, domain: domain || null };
  } catch {
    return { brand: guessedBrand, domain: null };
  }
}

/** Stage 1: extract everything the official brand site publishes. */
async function runOfficialExtraction(
  openai: OpenAI,
  productName: string,
  brand: string | null,
  officialDomain: string | null,
  productKind: WorldClassProductKind,
): Promise<ResearchPassResult> {
  const isNonBike = productKind === "non_bike";
  const domainBlock = officialDomain
    ? `OFFICIAL DOMAIN (your only allowed source in this pass): ${officialDomain}
Required searches, in order:
1. site:${officialDomain} ${productName}
2. site:${officialDomain} ${productName} specifications
3. site:${officialDomain} ${productName} ${isNonBike ? "features size chart compatibility" : "geometry"}
4. site:${officialDomain} ${brand ?? ""} technology`
    : `OFFICIAL DOMAIN: not pre-resolved. First identify the manufacturer's official domain via web search, then run the four site: searches above on that domain.`;

  return runResearchPass(openai, {
    instructions: officialExtractPromptForKind(productKind),
    schemaName: isNonBike ? "official_non_bike_extract" : "official_bike_extract",
    schema: officialExtractSchemaForKind(productKind) as unknown as Record<
      string,
      unknown
    >,
    officialDomain,
    requireCitations: true,
    input: `Extract the complete official product data for this ${
      isNonBike ? "cycling accessory or component" : "bicycle"
    }.

Product query: ${productName}
${brand ? `Brand: ${brand}` : ""}

${domainBlock}`,
  });
}

/** Stage 2: editorial layer grounded in the official extraction. */
async function runEditorialResearch(
  openai: OpenAI,
  productName: string,
  officialData: Record<string, unknown>,
  officialDomain: string | null,
  productKind: WorldClassProductKind,
): Promise<ResearchPassResult> {
  const isNonBike = productKind === "non_bike";
  const officialJson = JSON.stringify(
    {
      productName: officialData.productName,
      brand: officialData.brand,
      modelYear: officialData.modelYear,
      ...(isNonBike
        ? { productCategory: officialData.productCategory }
        : { bikeType: officialData.bikeType }),
      officialProductUrl: officialData.officialProductUrl,
      keyStats: officialData.keyStats,
      specifications: officialData.specifications,
      technology: officialData.technology,
    },
    null,
    2,
  );

  return runResearchPass(openai, {
    instructions: editorialPromptForKind(productKind),
    schemaName: isNonBike
      ? "editorial_non_bike_research"
      : "editorial_bike_research",
    schema: editorialSchemaForKind(productKind) as unknown as Record<
      string,
      unknown
    >,
    officialDomain,
    requireCitations: true,
    input: `Product: ${productName}
${officialDomain ? `Official brand domain: ${officialDomain}` : ""}

VERIFIED OFFICIAL DATA (ground truth — never contradict it):
${officialJson}

Now research the editorial layer from live web sources: ${
      isNonBike
        ? "reviews, real-world performance, buyer fit, compatibility, brand story, and real competitor comparisons."
        : "reviews, ride impressions, rider fit, brand story, and real competitor comparisons."
    }`,
  });
}

function mergePreferOfficialImages(
  primary: WorldClassImage[],
  secondary: WorldClassImage[],
  brandDomain: string | null,
): WorldClassImage[] {
  const score = (image: WorldClassImage) => {
    let value = 0;
    const haystack = `${image.url} ${image.sourceUrl ?? ""}`.toLowerCase();
    if (brandDomain && haystack.includes(brandDomain.toLowerCase())) value += 5;
    if (image.role === "hero") value += 2;
    if (image.role === "detail") value += 1;
    return value;
  };

  const seen = new Set<string>();
  const merged = [...primary, ...secondary].filter((image) => {
    if (!image.url?.startsWith("http") || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });

  merged.sort((a, b) => score(b) - score(a));
  if (merged[0]) merged[0] = { ...merged[0], role: "hero" };
  // Keep a wide pool here — the vision pass picks the final ≤12.
  return merged.slice(0, 28);
}

export async function generateWorldClassProductPage(
  options: GenerateWorldClassOptions,
): Promise<WorldClassProductPage> {
  const productName = options.productName.trim();
  const productKind = normaliseProductKind(options.productKind);
  if (!productName) {
    throw new Error("Product name is required.");
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const emit = async (event: GenerateProgressEvent) => {
    await options.onProgress?.(event);
  };

  await emit({
    stage: "started",
    message:
      productKind === "non_bike"
        ? `Building a world-class accessory page for “${productName}”…`
        : `Building a world-class page for “${productName}”…`,
  });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const guessedBrand = guessBrandFromName(productName);

  // Kick off media discovery in parallel with research (refined later).
  const guessedWebsite = resolveBrandWebsite(guessedBrand);
  const guessedDomain = guessedWebsite ? brandWebsiteDomain(guessedWebsite) : null;
  const earlyImagesPromise = discoverProductImages(
    productName,
    guessedBrand,
    guessedDomain,
    productKind,
  );
  const earlyVideosPromise = discoverProductVideos(
    productName,
    guessedBrand,
    productKind,
  );

  // Stage 0 — resolve the official brand domain (web-verified for unknown brands).
  await emit({
    stage: "official",
    message: "Locating the official brand website…",
  });
  const resolved = await resolveOfficialDomainOnline(
    openai,
    productName,
    guessedBrand,
    productKind,
  );

  // Stage 1 — official-site extraction (specs, technology, key stats).
  await emit({
    stage: "official",
    message: resolved.domain
      ? `Extracting the official spec sheet from ${resolved.domain}…`
      : "Extracting the official spec sheet from the brand website…",
  });
  const official = await runOfficialExtraction(
    openai,
    productName,
    resolved.brand,
    resolved.domain,
    productKind,
  );

  const brand =
    (typeof official.data.brand === "string" && official.data.brand.trim()) ||
    resolved.brand;
  const officialDomain =
    resolved.domain ??
    (() => {
      const site = resolveBrandWebsite(brand);
      return site ? brandWebsiteDomain(site) : null;
    })();
  const resolvedName =
    (typeof official.data.productName === "string" &&
      official.data.productName.trim()) ||
    productName;

  // Stage 2 — editorial research grounded in the official extraction.
  await emit({
    stage: "researching",
    message:
      productKind === "non_bike"
        ? "Researching reviews, comparisons, compatibility and brand story…"
        : "Researching reviews, comparisons, rider fit and brand story…",
  });
  const editorial = await runEditorialResearch(
    openai,
    resolvedName,
    official.data,
    officialDomain,
    productKind,
  );

  await emit({
    stage: "images",
    message: "Finding world-class product photography…",
  });
  await emit({
    stage: "videos",
    message:
      productKind === "non_bike"
        ? "Searching for review, setup and brand videos…"
        : "Searching for review and brand videos…",
  });

  const needsRefinedMedia =
    resolvedName.toLowerCase() !== productName.toLowerCase() ||
    (officialDomain && officialDomain !== guessedDomain);

  const [
    earlyImages,
    earlyVideos,
    refinedImages,
    refinedVideos,
    brandLogoUrl,
    competitorImages,
  ] = await Promise.all([
    earlyImagesPromise,
    earlyVideosPromise,
    needsRefinedMedia
      ? discoverProductImages(resolvedName, brand, officialDomain, productKind)
      : Promise.resolve([] as WorldClassImage[]),
    needsRefinedMedia
      ? discoverProductVideos(resolvedName, brand, productKind)
      : Promise.resolve([] as WorldClassVideo[]),
    discoverBrandLogo(brand, officialDomain, productKind),
    discoverCompetitorImages(editorial.data, productKind),
  ]);

  const loadableImages = await filterLoadableImages(
    mergePreferOfficialImages(refinedImages, earlyImages, officialDomain),
  );

  // Vision gate: every candidate is inspected by a strong reasoning vision
  // model against the official identity (exact model, year, stated
  // colourways). Only positively confirmed images reach the page. A null
  // result means the vision service itself was down — only then do we fall
  // back to the text-scored pool rather than publish an empty gallery.
  await emit({
    stage: "images",
    message: "Verifying every photo with AI vision — exact model and colourway…",
  });
  const [verifiedImages, verifiedCompetitorImages] = await Promise.all([
    verifyWorldClassImages(openai, {
      productName: resolvedName,
      brand,
      productKind,
      officialData: official.data,
      images: loadableImages,
    }),
    verifyCompetitorImages(openai, competitorImages, productKind),
  ]);
  const images =
    verifiedImages === null ? loadableImages.slice(0, 14) : verifiedImages;

  const videos = [...refinedVideos, ...earlyVideos]
    .filter((video, index, all) => {
      return (
        !!video.videoId &&
        all.findIndex((item) => item.videoId === video.videoId) === index
      );
    })
    .slice(0, 4);

  await emit({
    stage: "assembling",
    message: "Assembling the template and removing empty sections…",
  });

  const officialCitations = official.citations.filter((c) => c.isOfficialBrand);
  const officialSpecsVerified =
    official.data.productFound === true &&
    (officialCitations.length > 0 ||
      (Array.isArray(official.data.sources) &&
        official.data.sources.some(
          (s) =>
            typeof (s as { url?: string }).url === "string" &&
            isOnDomain((s as { url: string }).url, officialDomain),
        )));

  const page = buildWorldClassProductPage({
    query: productName,
    productKind,
    official: official.data,
    editorial: editorial.data,
    research: {
      officialDomain,
      officialProductUrl:
        typeof official.data.officialProductUrl === "string" &&
        official.data.officialProductUrl.startsWith("http")
          ? official.data.officialProductUrl
          : null,
      officialSpecsVerified,
      webSearchCount: official.webSearchCount + editorial.webSearchCount,
      officialSourceCount: 0, // recomputed from merged sources in the builder
      totalSourceCount: 0,
    },
    images,
    videos,
    citationSources: [...official.citations, ...editorial.citations],
    brandLogoUrl,
    competitorImages: verifiedCompetitorImages,
  });

  await emit({
    stage: "complete",
    message: "Product page ready.",
    page,
  });

  return page;
}

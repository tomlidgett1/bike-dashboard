/**
 * Upgrade scraped product image URLs to the highest practical source quality.
 *
 * Brand sites (Focus, Canyon, etc.) often serve gallery thumbs via CDN proxies
 * with width/quality transforms. We unwrap those and bump resize params so the
 * stored / Cloudinary-uploaded asset matches the source page's full-size look.
 */

const NESTED_PROXY_RE =
  /\/cdn-cgi\/image\/[^/]+\/(https?:\/\/[^\s"'<>]+)/i;
const STORYBLOK_NESTED_RE =
  /https?:\/\/a\.storyblok\.com\/f\/[^\s"'<>]+/i;
const BYNDER_ID_RE =
  /bynder\.com\/(?:transform\/[^/]+\/|media\/|m\/)?([0-9a-f-]{36})/i;

function safeUrl(raw: string, pageUrl?: string): URL | null {
  try {
    return new URL(raw.trim().replace(/&amp;/g, "&").replace(/[),]+$/g, ""), pageUrl);
  } catch {
    return null;
  }
}

/** Peel Cloudflare/Pondigital (and similar) image proxies down to the origin asset. */
export function unwrapImageProxyUrl(raw: string): string {
  let current = raw.trim().replace(/&amp;/g, "&");
  for (let i = 0; i < 3; i += 1) {
    const nested = current.match(NESTED_PROXY_RE)?.[1];
    if (nested) {
      current = nested.replace(/[),]+$/g, "");
      continue;
    }
    const storyblok = current.match(STORYBLOK_NESTED_RE)?.[0];
    if (storyblok && storyblok !== current) {
      current = storyblok.replace(/[),]+$/g, "");
      continue;
    }
    break;
  }
  return current;
}

function bumpQueryNumber(url: URL, keys: string[], value: number) {
  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.set(key, String(value));
    }
  }
}

function upgradeBynderUrl(url: URL): URL {
  url.pathname = url.pathname.replace(
    /\/transform\/(?:Small|Medium|Thumb|Thumbnail|mini|preview)\//i,
    "/transform/Large/",
  );

  // Bynder uses `io=transform:fill,width:1280` style params.
  if (url.searchParams.has("io")) {
    const io = url.searchParams.get("io") ?? "";
    const next = io
      .replace(/width:\d+/gi, "width:2400")
      .replace(/height:\d+/gi, "")
      .replace(/,,+/g, ",")
      .replace(/^,|,$/g, "");
    url.searchParams.set("io", next || "transform:fill,width:2400");
  } else if (/\/transform\//i.test(url.pathname)) {
    url.searchParams.set("io", "transform:fill,width:2400");
  }

  if (url.searchParams.has("quality")) {
    url.searchParams.set("quality", "100");
  } else if (/\/transform\//i.test(url.pathname)) {
    url.searchParams.set("quality", "100");
  }

  if (!url.searchParams.has("output") && /\.(tif|tiff)(?:$|\?)/i.test(url.href)) {
    url.searchParams.set("output", "png");
  }

  bumpQueryNumber(url, ["w", "width", "maxwidth", "max_width"], 2400);
  return url;
}

function upgradeStoryblokUrl(url: URL): URL {
  // /m/800x0/ filters → /m/2400x0/
  url.pathname = url.pathname.replace(
    /\/m\/\d+x\d*\//i,
    "/m/2400x0/",
  );
  bumpQueryNumber(url, ["width", "w", "quality", "q"], 2400);
  if (url.searchParams.has("quality")) url.searchParams.set("quality", "100");
  if (url.searchParams.has("q")) url.searchParams.set("q", "100");
  return url;
}

function upgradeCloudinaryUrl(url: URL): URL {
  // Strip downsizing transforms; keep the original upload path.
  url.pathname = url.pathname
    .replace(
      /\/image\/upload\/(?:[^/]+\/)*(?=v\d+\/|[^/]+$)/i,
      "/image/upload/",
    )
    .replace(/\/w_\d+/gi, "")
    .replace(/\/h_\d+/gi, "")
    .replace(/\/q_(?:auto(?::\w+)?|\d+)/gi, "/q_100")
    .replace(/\/c_[^/,]+/gi, "");
  return url;
}

function upgradeShopifyUrl(url: URL): URL {
  url.pathname = url.pathname.replace(
    /_(?:pico|icon|thumb|small|compact|medium|large|grande|\d+x\d*|\d+x)(?=\.(?:jpe?g|png|webp|gif))/i,
    "",
  );
  bumpQueryNumber(url, ["width", "height"], 2400);
  return url;
}

function upgradeImgixLikeUrl(url: URL): URL {
  bumpQueryNumber(url, ["w", "width", "max-w", "maxwidth"], 2400);
  // Drop forced height so aspect ratio is preserved at the larger width.
  for (const key of ["h", "height", "max-h", "maxheight"]) {
    url.searchParams.delete(key);
  }
  if (url.searchParams.has("q")) url.searchParams.set("q", "100");
  if (url.searchParams.has("quality")) url.searchParams.set("quality", "100");
  if (url.searchParams.has("auto")) {
    // Keep format auto if present; drop low-quality hints.
    const auto = (url.searchParams.get("auto") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && part !== "compress");
    if (auto.length) url.searchParams.set("auto", auto.join(","));
    else url.searchParams.delete("auto");
  }
  return url;
}

/**
 * Return the highest-quality practical variant of a product image URL.
 * Falls back to the original string when the URL cannot be parsed.
 */
export function upgradeProductImageUrl(raw: string, pageUrl?: string): string {
  if (!raw?.trim()) return raw;
  const unwrapped = unwrapImageProxyUrl(raw);
  const parsed = safeUrl(unwrapped, pageUrl);
  if (!parsed || !/^https?:$/i.test(parsed.protocol)) return unwrapped;

  const host = parsed.hostname.toLowerCase();
  if (host.includes("bynder.com")) {
    return upgradeBynderUrl(parsed).toString();
  }
  if (host.includes("storyblok.com")) {
    return upgradeStoryblokUrl(parsed).toString();
  }
  if (host.includes("cloudinary.com") || host.includes("res.cloudinary.com")) {
    return upgradeCloudinaryUrl(parsed).toString();
  }
  if (host.includes("cdn.shopify.com") || /\/cdn\/shop\//i.test(parsed.pathname)) {
    return upgradeShopifyUrl(parsed).toString();
  }
  if (
    host.includes("imgix.net") ||
    host.includes("imagekit.io") ||
    host.includes("sirv.com") ||
    parsed.searchParams.has("w") ||
    parsed.searchParams.has("width")
  ) {
    return upgradeImgixLikeUrl(parsed).toString();
  }

  // Generic Magento / catalog width params.
  bumpQueryNumber(parsed, ["width", "w", "maxwidth"], 2400);
  if (parsed.searchParams.has("quality")) parsed.searchParams.set("quality", "100");
  if (parsed.searchParams.has("q")) parsed.searchParams.set("q", "100");
  return parsed.toString();
}

/** Stable identity for the same photo across resize / proxy variants. */
export function productImageAssetKey(raw: string): string {
  const unwrapped = unwrapImageProxyUrl(raw);
  const bynderId = unwrapped.match(BYNDER_ID_RE)?.[1];
  if (bynderId) return `bynder:${bynderId.toLowerCase()}`;

  const parsed = safeUrl(unwrapped);
  if (!parsed) return unwrapped.toLowerCase();

  const path = parsed.pathname
    .replace(/\/transform\/(?:Small|Medium|Large|Thumb|Thumbnail|Original)\//gi, "/transform/")
    .replace(/\/m\/\d+x\d*\//gi, "/m/")
    .replace(/_(?:pico|icon|thumb|small|compact|medium|large|grande|\d+x\d*)(?=\.)/gi, "")
    .replace(/\/w_\d+/gi, "")
    .replace(/\/h_\d+/gi, "")
    .replace(/\/q_(?:auto(?::\w+)?|\d+)/gi, "")
    .toLowerCase();

  return `${parsed.hostname.toLowerCase()}${path}`;
}

function widthHint(url: string): number {
  const match =
    url.match(/width[:=](\d+)/i) ||
    url.match(/[?&]w=(\d+)/i) ||
    url.match(/_(\d{3,5})x\d*/i) ||
    url.match(/\/m\/(\d+)x/i) ||
    url.match(/\/w_(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function qualityHint(url: string): number {
  if (/quality=1(?:\.0)?\b|quality=100\b|[?&]q=100\b|\/q_100\b/i.test(url)) return 100;
  const match = url.match(/quality[=:](\d+(?:\.\d+)?)|[?&]q=(\d+)/i);
  if (!match) return 50;
  const raw = Number(match[1] ?? match[2]);
  if (!Number.isFinite(raw)) return 50;
  return raw <= 1 ? Math.round(raw * 100) : raw;
}

export function scoreProductImageUrl(raw: string): number {
  const unwrapped = unwrapImageProxyUrl(raw);
  let score = 0;
  if (/\/transform\/Large\//i.test(unwrapped)) score += 300;
  else if (/\/transform\/Medium\//i.test(unwrapped)) score += 120;
  else if (/\/transform\/Small\//i.test(unwrapped)) score += 40;
  if (!/cdn-cgi\/image\//i.test(raw)) score += 80; // prefer direct origin over proxy
  if (/bynder\.com|storyblok\.com/i.test(unwrapped)) score += 40;
  score += Math.min(widthHint(unwrapped), 4000) / 10;
  score += qualityHint(unwrapped);
  if (/_original\./i.test(unwrapped)) score += 500;
  return score;
}

/**
 * Deduplicate resize variants of the same photo and keep the highest-quality URL,
 * after upgrading each candidate.
 */
export function chooseHighestQualityImageUrls(
  urls: string[],
  pageUrl?: string,
): string[] {
  const byAsset = new Map<string, { url: string; score: number }>();

  for (const raw of urls) {
    if (!raw?.trim()) continue;
    const upgraded = upgradeProductImageUrl(raw, pageUrl);
    const key = productImageAssetKey(upgraded);
    const score = scoreProductImageUrl(upgraded);
    const existing = byAsset.get(key);
    if (!existing || score > existing.score) {
      byAsset.set(key, { url: upgraded, score });
    }
  }

  return [...byAsset.values()]
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url);
}

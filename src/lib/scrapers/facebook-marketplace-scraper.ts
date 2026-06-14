export interface FacebookMarketplaceScrapeResult {
  title: string;
  price: number;
  currency: string;
  description: string;
  location: string;
  condition: string | null;
  category: string | null;
  images: string[];
}

const CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const CHROME_HEADERS: Record<string, string> = {
  "User-Agent": CHROME_USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
  "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const FETCH_STRATEGIES: Array<{ name: string; headers: Record<string, string> }> = [
  { name: "chrome", headers: CHROME_HEADERS },
  {
    name: "facebookexternalhit",
    headers: {
      "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
    },
  },
  {
    name: "googlebot",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
    },
  },
];

export function cleanFacebookListingUrl(url: string): { listingUrl: string; listingId: string } {
  const match = url.match(/facebook\.com\/marketplace\/item\/(\d+)/);
  if (!match) {
    throw new Error(
      "Invalid Facebook Marketplace URL. Expected format: facebook.com/marketplace/item/[id]",
    );
  }

  const listingId = match[1];
  const parsed = new URL(url);
  const listingUrl = `${parsed.origin}/marketplace/item/${listingId}/`;
  return { listingUrl, listingId };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(`<meta\\s+(?:property|name)="${prop}"\\s+content="([^"]*)"`, "i"),
    new RegExp(`<meta\\s+content="([^"]*)"\\s+(?:property|name)="${prop}"`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]?.trim()) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

function textValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "value", "content"]) {
      const nested = record[key];
      if (typeof nested === "string" && nested.trim()) {
        return nested.trim();
      }
    }
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function matchesListing(node: Record<string, unknown>, listingId: string): boolean {
  if (node.id != null && String(node.id) === listingId) return true;
  const primary = node.primary_mp_ent;
  if (primary && typeof primary === "object" && primary !== null) {
    const primaryRecord = primary as Record<string, unknown>;
    if (primaryRecord.id != null && String(primaryRecord.id) === listingId) {
      return true;
    }
  }
  return false;
}

function priceFromNode(node: Record<string, unknown>): string | null {
  const formatted = node.formatted_price;
  if (formatted && typeof formatted === "object") {
    const text = textValue(formatted);
    if (text) return text;
  }

  const listingPrice = node.listing_price;
  if (listingPrice && typeof listingPrice === "object") {
    const record = listingPrice as Record<string, unknown>;
    for (const key of ["formatted_amount_zeros_stripped", "amount", "text"]) {
      const value = record[key];
      if (value != null && String(value).trim()) {
        return String(value).trim();
      }
    }
  } else if (listingPrice != null) {
    return String(listingPrice).trim();
  }

  return null;
}

function locationFromNode(node: Record<string, unknown>): string | null {
  const locationText = textValue(node.location_text);
  if (locationText) return locationText;

  const reverse = node.reverse_geocode_detailed;
  if (reverse && typeof reverse === "object") {
    const record = reverse as Record<string, unknown>;
    const city = record.city;
    const state = record.state;
    if (city && state) return `${city}, ${state}`;
    if (city) return String(city);
  }

  return null;
}

function conditionFromNode(node: Record<string, unknown>): string | null {
  return textValue(node.condition);
}

function categoryFromNode(node: Record<string, unknown>): string | null {
  return textValue(node.root_category) || textValue(node.category);
}

function imagesFromNode(node: Record<string, unknown>): string[] {
  const photos = node.listing_photos;
  if (!Array.isArray(photos)) return [];

  const urls: string[] = [];
  for (const photo of photos) {
    if (!photo || typeof photo !== "object") continue;
    const record = photo as Record<string, unknown>;
    const image = record.image;
    if (image && typeof image === "object") {
      const uri = textValue((image as Record<string, unknown>).uri);
      if (uri) urls.push(uri);
    }
  }
  return urls;
}

function listingNodes(payload: unknown, listingId: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];

  const walk = (obj: unknown, depth = 0) => {
    if (depth > 24) return;
    if (Array.isArray(obj)) {
      for (const item of obj.slice(0, 300)) walk(item, depth + 1);
      return;
    }
    if (!obj || typeof obj !== "object") return;

    const record = obj as Record<string, unknown>;
    if (matchesListing(record, listingId)) {
      found.push(record);
    }
    for (const value of Object.values(record)) {
      walk(value, depth + 1);
    }
  };

  walk(payload);
  return found;
}

function parseLocationFromTitle(title: string | null): string | null {
  if (!title) return null;
  const cleaned = title.replace(/\s*\|\s*Facebook Marketplace\s*$/i, "").trim();
  const parts = cleaned.split(/\s[–—-]\s/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 1];
  return null;
}

function parseProductNameFromTitle(title: string | null): string | null {
  if (!title) return null;
  const cleaned = title.replace(/\s*\|\s*Facebook Marketplace\s*$/i, "").trim();
  const parts = cleaned.split(/\s[–—-]\s/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 1) return parts[0];
  return cleaned || null;
}

function parsePriceAmount(priceText: string | null): { amount: number; currency: string } {
  if (!priceText) return { amount: 0, currency: "AUD" };

  let currency = "AUD";
  if (/€/.test(priceText)) currency = "EUR";
  else if (/£/.test(priceText)) currency = "GBP";
  else if (/USD|US\$/.test(priceText)) currency = "USD";
  else if (/AU\$|AUD/.test(priceText)) currency = "AUD";

  const cleaned = priceText.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const amount = Number.parseFloat(cleaned);
  return {
    amount: Number.isFinite(amount) ? amount : 0,
    currency,
  };
}

function decodeJsonString(value: string): string | null {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\u0024/g, "$");
  }
}

function extractPageTitle(html: string, listingId: string): string | null {
  const titleRegex = /"title"\s*:\s*"(.+?\| Facebook Marketplace)"/g;
  let match: RegExpExecArray | null;

  while ((match = titleRegex.exec(html)) !== null) {
    const decoded = decodeJsonString(match[1]);
    if (!decoded) continue;

    const contextStart = Math.max(0, match.index - 5000);
    const contextEnd = match.index + 5000;
    if (html.slice(contextStart, contextEnd).includes(listingId)) {
      return decoded;
    }
  }

  return null;
}

function extractRegexFields(html: string, listingId: string): {
  productName: string | null;
  price: string | null;
  description: string | null;
  images: string[];
} {
  const listingContext = (() => {
    const index = html.indexOf(listingId);
    if (index < 0) return html;
    return html.slice(Math.max(0, index - 4000), index + 12000);
  })();

  const productName =
    listingContext.match(/"marketplace_listing_title"\s*:\s*"([^"]+)"/)?.[1] ||
    listingContext.match(/"base_marketplace_listing_title"\s*:\s*"([^"]+)"/)?.[1] ||
    null;

  const price =
    listingContext.match(/"formatted_price"\s*:\s*\{"text"\s*:\s*"([^"]+)"/)?.[1] ||
    listingContext.match(/"formatted_amount_zeros_stripped"\s*:\s*"([^"]+)"/)?.[1] ||
    listingContext.match(/"formatted_amount"\s*:\s*"([^"]+)"/)?.[1] ||
    null;

  const description =
    listingContext.match(/"redacted_description"\s*:\s*\{"text"\s*:\s*"([^"]+)"/)?.[1] ||
    listingContext.match(/"seller_description"\s*:\s*\{"text"\s*:\s*"([^"]+)"/)?.[1] ||
    null;

  const images = [
    ...listingContext.matchAll(/"uri"\s*:\s*"(https:\\\/\\\/scontent[^"]+)"/g),
    ...listingContext.matchAll(/"uri"\s*:\s*"(https:\/\/scontent[^"]+)"/g),
  ]
    .map((match) => decodeJsonString(match[1].replace(/\\\//g, "/")))
    .filter((url): url is string => Boolean(url));

  return {
    productName: productName ? decodeJsonString(productName) : null,
    price: price ? decodeJsonString(price) : null,
    description: description ? decodeJsonString(description)?.replace(/\\n/g, "\n") ?? null : null,
    images: [...new Set(images)],
  };
}

function extractFromEmbeddedJson(
  pageHtml: string,
  listingId: string,
): {
  productName: string | null;
  price: string | null;
  description: string | null;
  location: string | null;
  condition: string | null;
  category: string | null;
  images: string[];
} {
  const best = {
    productName: null as string | null,
    price: null as string | null,
    description: null as string | null,
    location: null as string | null,
    condition: null as string | null,
    category: null as string | null,
    images: [] as string[],
  };
  const seenUrls = new Set<string>();

  const scriptRegex = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(pageHtml)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    if (!raw.includes(listingId) && !raw.includes("marketplace_listing_title")) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      continue;
    }

    const nodes = listingNodes(payload, listingId);
    if (nodes.length === 0) continue;

    for (const node of nodes) {
      const candidate = {
        productName: textValue(node.marketplace_listing_title) ||
          textValue(node.base_marketplace_listing_title),
        price: priceFromNode(node),
        description: textValue(node.redacted_description) ||
          textValue(node.seller_description) ||
          textValue(node.description),
        location: locationFromNode(node),
        condition: conditionFromNode(node),
        category: categoryFromNode(node),
      };

      if (!best.productName && candidate.productName) best.productName = candidate.productName;
      if (!best.price && candidate.price) best.price = candidate.price;
      if (!best.description && candidate.description) best.description = candidate.description;
      if (!best.location && candidate.location) best.location = candidate.location;
      if (!best.condition && candidate.condition) best.condition = candidate.condition;
      if (!best.category && candidate.category) best.category = candidate.category;

      for (const url of imagesFromNode(node)) {
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          best.images.push(url);
        }
      }
    }
  }

  return best;
}

type PartialExtraction = ReturnType<typeof extractFromEmbeddedJson>;

function mergeExtractions(current: PartialExtraction, incoming: PartialExtraction): PartialExtraction {
  const images = [...current.images];
  const seen = new Set(images);

  for (const url of incoming.images) {
    if (!seen.has(url)) {
      seen.add(url);
      images.push(url);
    }
  }

  return {
    productName: current.productName || incoming.productName,
    price: current.price || incoming.price,
    description: current.description || incoming.description,
    location: current.location || incoming.location,
    condition: current.condition || incoming.condition,
    category: current.category || incoming.category,
    images,
  };
}

function dedupeImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const url of urls) {
    const key = url.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(url);
  }

  return unique;
}

function looksLikeLoginWall(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("log in to facebook") ||
    lower.includes("login to facebook") ||
    lower.includes("you must log in") ||
    (lower.includes("login_form") && !html.includes("og:title"))
  );
}

async function fetchListingHtml(listingUrl: string): Promise<Array<{ name: string; html: string }>> {
  const pages: Array<{ name: string; html: string }> = [];

  for (const strategy of FETCH_STRATEGIES) {
    try {
      const response = await fetch(listingUrl, {
        headers: strategy.headers,
        redirect: "follow",
      });

      if (!response.ok) continue;

      const html = await response.text();
      if (html.length < 2000 || looksLikeLoginWall(html)) continue;

      pages.push({ name: strategy.name, html });
    } catch {
      continue;
    }
  }

  return pages;
}

function parseHtmlSnapshot(
  pageHtml: string,
  listingId: string,
): PartialExtraction & { ogTitle: string | null; ogDescription: string | null; ogImage: string | null; pageTitle: string | null } {
  const extracted = extractFromEmbeddedJson(pageHtml, listingId);
  const regexFields = extractRegexFields(pageHtml, listingId);
  const pageTitle = extractPageTitle(pageHtml, listingId);

  const merged = mergeExtractions(extracted, {
    productName: regexFields.productName,
    price: regexFields.price,
    description: regexFields.description,
    location: null,
    condition: null,
    category: null,
    images: regexFields.images,
  });

  return {
    ...merged,
    ogTitle: metaContent(pageHtml, "og:title"),
    ogDescription: metaContent(pageHtml, "og:description"),
    ogImage: metaContent(pageHtml, "og:image"),
    pageTitle,
  };
}

export async function scrapeFacebookMarketplaceListing(
  facebookUrl: string,
): Promise<FacebookMarketplaceScrapeResult> {
  const { listingUrl, listingId } = cleanFacebookListingUrl(facebookUrl);
  const pages = await fetchListingHtml(listingUrl);

  if (pages.length === 0) {
    throw new Error(
      "Facebook blocked the scrape request. Please try again shortly, or enter the listing manually.",
    );
  }

  let merged: PartialExtraction = {
    productName: null,
    price: null,
    description: null,
    location: null,
    condition: null,
    category: null,
    images: [],
  };

  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let ogImage: string | null = null;
  let pageTitle: string | null = null;

  for (const page of pages) {
    const snapshot = parseHtmlSnapshot(page.html, listingId);
    merged = mergeExtractions(merged, snapshot);
    ogTitle = ogTitle || snapshot.ogTitle;
    ogDescription = ogDescription || snapshot.ogDescription;
    ogImage = ogImage || snapshot.ogImage;
    pageTitle = pageTitle || snapshot.pageTitle;
  }

  const title =
    merged.productName ||
    ogTitle ||
    parseProductNameFromTitle(pageTitle) ||
    null;

  const description = merged.description || ogDescription || "";
  const location = merged.location ||
    parseLocationFromTitle(pageTitle) ||
    parseLocationFromTitle(ogTitle) ||
    "";

  const images = dedupeImageUrls([...merged.images, ...(ogImage ? [ogImage] : [])]);

  const { amount, currency } = parsePriceAmount(merged.price);

  if (!title) {
    throw new Error(
      "Could not extract title from listing. The listing may require login or may be in an unsupported format.",
    );
  }

  if (images.length === 0) {
    throw new Error("Could not extract images from listing.");
  }

  return {
    title,
    price: amount,
    currency,
    description,
    location,
    condition: merged.condition,
    category: merged.category,
    images,
  };
}

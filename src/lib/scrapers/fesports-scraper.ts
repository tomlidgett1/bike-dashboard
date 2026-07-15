import type { CookieParam, Page } from "puppeteer-core";

export const FESPORTS_DEFAULT_START_URL = "https://www.fesports.com.au/Shop/c_230/Products";

const STOCK_IMAGE_RE =
  /\/stock\/\d+_[A-Za-z0-9]+(?:_original|_\d+x\d+)?\.(?:jpg|jpeg|png|webp)/gi;
const IMAGE_SIZE_SUFFIX_RE = /_(\d+x\d+|original)(\.[^.]+)$/i;
const SOH_NUMBER_RE =
  /(?:SOH|stock\s*on\s*hand|qty|quantity|available)\s*[:\-]?\s*(\d+)/i;

export interface FEsportsVariant {
  optionName: string | null;
  optionValue: string | null;
  sku: string | null;
  soh: number | null;
  sohRaw: string | null;
  price: string | null;
}

export interface FEsportsBrand {
  id: string;
  name: string;
  url: string;
  imageUrl: string | null;
}

export interface FEsportsScrapedProduct {
  productId: string;
  name: string;
  url: string;
  categoryUrl: string;
  brand: string | null;
  price: number | null;
  sku: string | null;
  soh: number | null;
  sohRaw: string | null;
  description: string | null;
  imageUrls: string[];
  heroImageUrl: string | null;
  fields: Record<string, string>;
  variants: FEsportsVariant[];
}

function normaliseCategoryUrl(url: string): string {
  const parsed = new URL(url, "https://www.fesports.com.au");
  return `https://www.fesports.com.au${parsed.pathname.replace(/\/$/, "")}`;
}

function categoryKey(url: string): string {
  const match = url.match(/\/Shop\/c_([^/]+)/i);
  return match ? match[1].toLowerCase() : url.toLowerCase();
}

export function extractBrandFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const shopIdx = parts.findIndex((part) => part.toLowerCase() === "shop");
  if (shopIdx < 0 || shopIdx + 2 >= parts.length) return null;

  const afterCategoryId = parts[shopIdx + 2];
  if (!afterCategoryId) return null;

  if (afterCategoryId.toLowerCase() === "products" && parts.length > shopIdx + 3) {
    return parts[shopIdx + 3].replace(/_/g, " ");
  }

  if (!afterCategoryId.toLowerCase().startsWith("c_")) {
    return afterCategoryId.replace(/_/g, " ");
  }

  return null;
}

function normaliseImageUrl(src: string): string {
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("/")) return `https://www.fesports.com.au${src}`;
  return src;
}

function imageVariantKey(url: string): string {
  const path = new URL(url, "https://www.fesports.com.au").pathname;
  return path.replace(IMAGE_SIZE_SUFFIX_RE, "$2");
}

export function chooseBestImageUrls(urls: string[]): string[] {
  const grouped = new Map<string, string[]>();
  for (const raw of urls) {
    const url = normaliseImageUrl(raw);
    const key = imageVariantKey(url);
    const bucket = grouped.get(key) ?? [];
    bucket.push(url);
    grouped.set(key, bucket);
  }

  const chosen: string[] = [];
  for (const variants of grouped.values()) {
    const original = variants.find((url) => url.toLowerCase().includes("_original."));
    const largest = variants.reduce((best, current) => {
      const bestScore = best.toLowerCase().includes("_original.")
        ? 2
        : Number((best.match(/_(\d+)x(\d+)/) ?? [])[1] ?? 0);
      const currentScore = current.toLowerCase().includes("_original.")
        ? 2
        : Number((current.match(/_(\d+)x(\d+)/) ?? [])[1] ?? 0);
      return currentScore > bestScore ? current : best;
    }, variants[0]);
    chosen.push(original ?? largest);
  }

  return [...new Set(chosen)];
}

export function extractHeroImageUrlFromHtml(html: string, productId: string): string | null {
  const escapedId = productId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<img[^>]+class="[^"]*product_image_main_${escapedId}[^"]*"[^>]+src="([^"]+)"`,
      "i",
    ),
    new RegExp(
      `<img[^>]+src="([^"]+)"[^>]+class="[^"]*product_image_main_${escapedId}[^"]*"`,
      "i",
    ),
    new RegExp(`<img[^>]+class="[^"]*plist_imi[^"]*"[^>]+src="([^"]+)"`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return normaliseImageUrl(match[1]);
  }

  return null;
}

export function buildProductImageList(
  heroUrl: string | null | undefined,
  urls: string[],
): { imageUrls: string[]; heroImageUrl: string | null } {
  const optimised = chooseBestImageUrls(urls);
  if (!heroUrl) {
    return { imageUrls: optimised, heroImageUrl: optimised[0] ?? null };
  }

  const heroBest = chooseBestImageUrls([heroUrl])[0] ?? normaliseImageUrl(heroUrl);
  const heroKey = imageVariantKey(heroBest);
  const rest = optimised.filter((url) => imageVariantKey(url) !== heroKey);

  return {
    imageUrls: [heroBest, ...rest],
    heroImageUrl: heroBest,
  };
}

export function getImageVariantKey(url: string): string {
  return imageVariantKey(normaliseImageUrl(url));
}

export function extractImageUrlsFromHtml(html: string): string[] {
  const matches = html.match(STOCK_IMAGE_RE) ?? [];
  return chooseBestImageUrls(matches);
}

export type StockAvailability = "in_stock" | "out_of_stock" | "unknown";

export interface ParsedStockValue {
  soh: number | null;
  sohRaw: string | null;
  availability: StockAvailability;
}

const OUT_OF_STOCK_TOKENS = [
  "out of stock",
  "out-of-stock",
  "sold out",
  "unavailable",
  "not available",
  "no stock",
  "nostock",
  "backorder",
  "back order",
];

const IN_STOCK_TOKENS = [
  "in stock",
  "in-stock",
  "instock",
  "available",
  "on hand",
  "ready to ship",
];

export function parseSohValue(raw: string | null | undefined): ParsedStockValue {
  if (!raw) return { soh: null, sohRaw: null, availability: "unknown" };
  const cleaned = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return { soh: null, sohRaw: null, availability: "unknown" };

  const lowered = cleaned.toLowerCase();
  if (OUT_OF_STOCK_TOKENS.some((token) => lowered.includes(token))) {
    return { soh: 0, sohRaw: cleaned, availability: "out_of_stock" };
  }

  const labelled = cleaned.match(SOH_NUMBER_RE);
  if (labelled) {
    const soh = Number(labelled[1]);
    return {
      soh,
      sohRaw: cleaned,
      availability: soh > 0 ? "in_stock" : "out_of_stock",
    };
  }

  const digits = cleaned.match(/\b(\d+)\b/);
  if (
    digits &&
    ["soh", "stock", "qty", "quantity", "available", "on hand", "units"].some((token) =>
      lowered.includes(token),
    )
  ) {
    const soh = Number(digits[1]);
    return {
      soh,
      sohRaw: cleaned,
      availability: soh > 0 ? "in_stock" : "out_of_stock",
    };
  }

  // Bare non-negative integer often used as SOH in variant tables.
  if (/^\d+$/.test(cleaned)) {
    const soh = Number(cleaned);
    return {
      soh,
      sohRaw: cleaned,
      availability: soh > 0 ? "in_stock" : "out_of_stock",
    };
  }

  if (IN_STOCK_TOKENS.some((token) => lowered.includes(token))) {
    return { soh: null, sohRaw: cleaned, availability: "in_stock" };
  }

  return { soh: null, sohRaw: cleaned, availability: "unknown" };
}

export function resolveStockAvailability(
  soh: number | null | undefined,
  sohRaw: string | null | undefined,
): StockAvailability {
  if (soh != null) return soh > 0 ? "in_stock" : "out_of_stock";
  return parseSohValue(sohRaw).availability;
}

export function formatStockStatusLabel(
  soh: number | null | undefined,
  sohRaw: string | null | undefined,
): string {
  const availability = resolveStockAvailability(soh, sohRaw);
  if (availability === "in_stock") {
    if (soh != null && soh > 0) return `In stock (${soh})`;
    return "In stock";
  }
  if (availability === "out_of_stock") return "Out of stock";
  if (sohRaw?.trim()) return sohRaw.trim();
  return "Stock unknown";
}

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function extractRetailPriceText(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const cleaned = candidate.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned && parsePrice(cleaned) != null) {
      return cleaned;
    }
  }
  return null;
}

async function waitForPage(page: Page, delayMs = 800) {
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 });
  } catch {
    // continue
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function categoryHasProductListings(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return document.querySelectorAll(".prod_listing_row .prod_listing").length > 0;
  });
}

export interface FEsportsDiscoverResult {
  categories: string[];
  pagesVisited: number;
}

export async function discoverFesportsCategories(
  page: Page,
  startUrl: string,
  maxCategories?: number | null,
  onProgress?: (info: { pagesVisited: number; productCategories: number; currentUrl: string }) => void,
): Promise<FEsportsDiscoverResult> {
  const normalisedStart = normaliseCategoryUrl(startUrl);
  const queue = [normalisedStart];
  const seen = new Set<string>();
  const productCategories: string[] = [];
  let pagesVisited = 0;

  while (queue.length) {
    const url = queue.shift()!;
    const key = categoryKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    pagesVisited += 1;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForPage(page, 500);

    const hasProducts = await categoryHasProductListings(page);
    if (hasProducts) {
      productCategories.push(url);
      if (maxCategories && productCategories.length >= maxCategories) {
        onProgress?.({
          pagesVisited,
          productCategories: productCategories.length,
          currentUrl: url,
        });
        break;
      }
    }

    onProgress?.({
      pagesVisited,
      productCategories: productCategories.length,
      currentUrl: url,
    });

    const links = await page.evaluate(() => {
      return [...document.querySelectorAll<HTMLAnchorElement>(".subcats_row a[href]")]
        .map((anchor) => anchor.getAttribute("href"))
        .filter((href): href is string => Boolean(href && /\/Shop\/c_/i.test(href)));
    });

    for (const href of links) {
      const full = normaliseCategoryUrl(href);
      const linkKey = categoryKey(full);
      if (!seen.has(linkKey)) queue.push(full);
    }

    if (maxCategories && productCategories.length >= maxCategories) break;
  }

  return { categories: productCategories, pagesVisited };
}

export async function discoverFesportsBrands(
  page: Page,
  startUrl: string,
): Promise<FEsportsBrand[]> {
  const normalisedStart = normaliseCategoryUrl(startUrl);
  await page.goto(normalisedStart, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForPage(page, 500);

  const rawBrands = await page.evaluate(() => {
    const brands: Array<{ id: string; name: string; url: string; imageUrl: string | null }> = [];
    const seen = new Set<string>();
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/Shop/c_"][href*="/Products/"]')];

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      if (!href) continue;

      const match = href.match(/\/Shop\/(c_\d+_\d+)\/Products\/([^/?#]+)/i);
      if (!match) continue;

      const pathname = new URL(href, "https://www.fesports.com.au").pathname.replace(/\/$/, "");
      if (seen.has(pathname)) continue;
      seen.add(pathname);

      const img = anchor.querySelector("img");
      const alt = img?.getAttribute("alt")?.replace(/\s+category image$/i, "").trim() ?? null;
      const slug = match[2].replace(/_/g, " ");
      const imageSrc = img?.getAttribute("src") ?? null;

      brands.push({
        id: match[1].toLowerCase(),
        name: alt || slug,
        url: `https://www.fesports.com.au${pathname}`,
        imageUrl: imageSrc
          ? imageSrc.startsWith("http")
            ? imageSrc
            : `https://www.fesports.com.au${imageSrc}`
          : null,
      });
    }

    return brands;
  });

  return rawBrands.sort((a, b) => a.name.localeCompare(b.name));
}

interface ListingCardData {
  productId: string;
  name: string;
  href: string;
  rrpRaw: string | null;
  priceRaw: string | null;
  dataPrice: string | null;
  price: string | null;
  sku: string | null;
  sohRaw: string | null;
  supplyRaw: string | null;
  listingImage: string | null;
  optionName: string | null;
  optId: string | null;
  options: Array<{ id: string; label: string }>;
}

async function scrapeListingCards(page: Page, categoryUrl: string): Promise<ListingCardData[]> {
  await page.goto(categoryUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForPage(page, 1_000);

  const cards = await page.evaluate(() => {
    const results = [...document.querySelectorAll<HTMLElement>(".prod_listing_row .prod_listing")];
    return results
      .map((card) => {
        const className = card.className;
        const match = className.match(/prx_plist_(\d+)/);
        if (!match) return null;

        const productId = match[1];
        const label = card.querySelector("label");
        const link = card.querySelector<HTMLAnchorElement>("a.prod_list_title");
        const href = link?.getAttribute("href") ?? null;
        if (!href) return null;

        const priceAttr = card.getAttribute("data-price");
        const priceEl = card.querySelector<HTMLElement>(`.prx_price_${productId}`);
        const rrpEl = card.querySelector<HTMLElement>(`.prxrrp_${productId}`);
        const skuEl = card.querySelector<HTMLElement>(`.prxsku_${productId}`);
        const sohEl = card.querySelector<HTMLElement>(`.prx_slev_${productId}`);
        const supplyEl = card.querySelector<HTMLElement>(`.prx_supply_${productId}`);
        const imageEl = card.querySelector<HTMLImageElement>(
          `img.plist_imi, img[class*="product_image_main_${productId}"]`,
        );
        const optionTitle = card.querySelector<HTMLElement>(".prx_opt_title");
        const select = card.querySelector<HTMLSelectElement>("select.prx_optval");
        const options = select
          ? [...select.options].map((option) => ({
              id: option.value,
              label: option.textContent?.trim() ?? "",
            }))
          : [];
        const optId = select?.getAttribute("data-optid") ?? null;

        return {
          productId,
          name: label?.textContent?.trim() ?? "",
          href,
          rrpRaw: rrpEl?.textContent?.trim() ?? null,
          priceRaw: priceEl?.textContent?.trim() ?? null,
          dataPrice: priceAttr,
          sku: skuEl?.textContent?.trim() ?? null,
          sohRaw: sohEl?.textContent?.trim() ?? null,
          supplyRaw: supplyEl?.textContent?.trim() ?? null,
          listingImage: imageEl?.getAttribute("src") ?? null,
          optionName: optionTitle?.textContent?.trim() ?? null,
          optId,
          options,
        };
      })
      .filter((card): card is NonNullable<typeof card> => Boolean(card?.name && card.href));
  });

  return cards.map((card) => ({
    ...card,
    price: extractRetailPriceText(card.rrpRaw, card.priceRaw, card.dataPrice),
  }));
}

async function scrapeVariant(
  page: Page,
  productId: string,
  optId: string | null,
  optionName: string | null,
  option: { id: string; label: string },
): Promise<FEsportsVariant> {
  const payload = await page.evaluate(
    async ({ pid, optionId, optionValue, optionOptId }) => {
      const body = new URLSearchParams({
        view: "vxp:L43GK4-pkr4i2",
        pid,
      });
      if (optionOptId) {
        body.set("opt", optionOptId);
        body.append("optvals[0][]", optionOptId);
      }
      body.append("optvals[0][]", optionValue);

      const response = await fetch("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: body.toString(),
      });

      try {
        return await response.json();
      } catch {
        return null;
      }
    },
    {
      pid: productId,
      optionId: option.id,
      optionValue: option.id,
      optionOptId: optId,
    },
  );

  const sohCandidate = [
    payload?.stock,
    payload?.prx_supply,
    payload?.prx_slev,
    payload?.msg,
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .find(Boolean);

  const parsed = parseSohValue(sohCandidate ?? null);

  return {
    optionName,
    optionValue: option.label,
    sku: typeof payload?.sku === "string" ? payload.sku : payload?.prx_sku ?? null,
    soh: parsed.soh,
    sohRaw: parsed.sohRaw,
    price: extractRetailPriceText(
      typeof payload?.prx_rrp === "string" ? payload.prx_rrp : null,
      typeof payload?.rrp === "string" ? payload.rrp : null,
      typeof payload?.price === "string" ? payload.price : null,
      typeof payload?.prx_price === "string" ? payload.prx_price : null,
    ),
  };
}

async function scrapeProductDetail(
  page: Page,
  productUrl: string,
  productId: string,
): Promise<{
  imageUrls: string[];
  heroImageUrl: string | null;
  description: string | null;
  retailPrice: string | null;
  fields: Record<string, string>;
}> {
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForPage(page, 600);
  const html = await page.content();
  const imageUrls = extractImageUrlsFromHtml(html);
  const heroImageUrl = extractHeroImageUrlFromHtml(html, productId);
  const detail = await page.evaluate((pid) => {
    const fields: Record<string, string> = {};

    const panel = document.querySelector(".pdescpanel_description");
    const description = panel
      ? (panel.textContent ?? "")
          .replace(/\u00a0/g, " ")
          .replace(/\r\n/g, "\n")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]{2,}/g, " ")
          .trim() || null
      : null;
    if (description) fields.Description = description;

    const warrantyPanel = document.querySelector(".pdescpanel_warranty");
    const warranty = warrantyPanel?.textContent?.replace(/\s+/g, " ").trim();
    if (warranty) fields.Warranty = warranty;

    const rrpEl = document.querySelector(`.prxrrp_${pid}`);
    const priceEl = document.querySelector(`.prx_price_${pid}`);
    const retailPrice = (rrpEl?.textContent || priceEl?.textContent || "").trim() || null;
    if (rrpEl?.textContent?.trim()) fields.RRP = rrpEl.textContent.trim();
    if (priceEl?.textContent?.trim()) fields["Listed price"] = priceEl.textContent.trim();

    document.querySelectorAll(".prx_pdatatab tr").forEach((row) => {
      const title = row.querySelector(".prx_opt_title")?.textContent?.trim();
      const value =
        row.querySelector(".prx_opt_value")?.textContent?.trim() ||
        row.querySelector(`[class*="prxsku_${pid}"]`)?.textContent?.trim() ||
        row.querySelector(`[class*="prx_slev_${pid}"]`)?.textContent?.trim() ||
        row.querySelector(`[class*="prx_supply_${pid}"]`)?.textContent?.trim();
      if (title && value) fields[title] = value;
    });

    const pageTitle = document.querySelector("h3, .product_title, label")?.textContent?.trim();
    if (pageTitle) fields["Page title"] = pageTitle;
    fields["Product URL"] = window.location.href;

    const heroEl = document.querySelector<HTMLImageElement>(
      `img[class*="product_image_main_${pid}"], img.plist_imi`,
    );
    const heroFromDom = heroEl?.getAttribute("src") ?? null;

    return { description, retailPrice, fields, heroFromDom };
  }, productId);

  const resolvedHero = heroImageUrl ?? (detail.heroFromDom ? normaliseImageUrl(detail.heroFromDom) : null);

  return {
    imageUrls,
    heroImageUrl: resolvedHero,
    description: detail.description,
    retailPrice: detail.retailPrice,
    fields: detail.fields,
  };
}

export async function scrapeFesportsCategory(
  page: Page,
  categoryUrl: string,
  options?: { downloadImages?: boolean; maxProducts?: number | null },
): Promise<FEsportsScrapedProduct[]> {
  const allCards = await scrapeListingCards(page, categoryUrl);
  const cards = options?.maxProducts
    ? allCards.slice(0, options.maxProducts)
    : allCards;
  const products: FEsportsScrapedProduct[] = [];

  for (const card of cards) {
    const productUrl = normaliseCategoryUrl(card.href);
    let heroImageUrl = card.listingImage ? normaliseImageUrl(card.listingImage) : null;
    let imageUrls = heroImageUrl ? [heroImageUrl] : [];
    let description: string | null = null;
    let retailPriceText = card.price ?? null;
    const scrapedFields: Record<string, string> = {
      Name: card.name,
    };
    if (card.sku) scrapedFields.SKU = card.sku;
    if (card.dataPrice) scrapedFields["Cost price"] = card.dataPrice;
    if (card.priceRaw) scrapedFields["Listed price"] = card.priceRaw;
    if (card.rrpRaw) scrapedFields.RRP = card.rrpRaw;
    if (card.sohRaw) scrapedFields.SOH = card.sohRaw;
    if (card.supplyRaw) scrapedFields.Supply = card.supplyRaw;

    if (options?.downloadImages !== false) {
      const detail = await scrapeProductDetail(page, productUrl, card.productId);
      heroImageUrl = detail.heroImageUrl ?? heroImageUrl;
      const mergedImages = buildProductImageList(heroImageUrl, [
        ...(heroImageUrl ? [heroImageUrl] : []),
        ...imageUrls,
        ...detail.imageUrls,
      ]);
      imageUrls = mergedImages.imageUrls;
      heroImageUrl = mergedImages.heroImageUrl;
      description = detail.description;
      retailPriceText = extractRetailPriceText(detail.retailPrice, card.price);
      Object.assign(scrapedFields, detail.fields);
    } else {
      const mergedImages = buildProductImageList(heroImageUrl, imageUrls);
      imageUrls = mergedImages.imageUrls;
      heroImageUrl = mergedImages.heroImageUrl;
    }

    let sohParsed = parseSohValue(card.sohRaw);
    if (sohParsed.soh == null) {
      sohParsed = parseSohValue(card.supplyRaw);
    }

    const variants: FEsportsVariant[] = [];
    if (card.options.length > 0) {
      await page.goto(categoryUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await waitForPage(page, 400);
      for (const option of card.options) {
        variants.push(await scrapeVariant(page, card.productId, card.optId, card.optionName, option));
      }
      const totalSoh = variants.reduce((sum, variant) => sum + (variant.soh ?? 0), 0);
      if (sohParsed.soh == null && variants.some((variant) => variant.soh != null)) {
        sohParsed = {
          soh: totalSoh,
          sohRaw: variants.map((v) => v.sohRaw).filter(Boolean).join(", "),
          availability: totalSoh > 0 ? "in_stock" : "out_of_stock",
        };
      }
      const primaryVariant = variants.find((variant) => variant.sku);
      if (primaryVariant?.sku && !card.sku) {
        card.sku = primaryVariant.sku;
      }
      const variantRetail = variants
        .map((variant) => variant.price)
        .find((price) => price && parsePrice(price) != null);
      if (variantRetail) {
        retailPriceText = extractRetailPriceText(variantRetail, retailPriceText);
      }
    }

    products.push({
      productId: card.productId,
      name: card.name,
      url: productUrl,
      categoryUrl,
      brand: extractBrandFromUrl(categoryUrl),
      price: parsePrice(retailPriceText),
      sku: card.sku,
      soh: sohParsed.soh,
      sohRaw: sohParsed.sohRaw,
      description,
      imageUrls,
      heroImageUrl,
      fields: scrapedFields,
      variants,
    });
  }

  return products;
}

export type FEsportsSessionCookies = CookieParam[];

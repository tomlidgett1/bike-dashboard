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
  imageUrls: string[];
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

function extractBrandFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 1].replace(/_/g, " ");
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

  return [...new Set(chosen)].sort();
}

export function extractImageUrlsFromHtml(html: string): string[] {
  const matches = html.match(STOCK_IMAGE_RE) ?? [];
  return chooseBestImageUrls(matches);
}

export function parseSohValue(raw: string | null | undefined): { soh: number | null; sohRaw: string | null } {
  if (!raw) return { soh: null, sohRaw: null };
  const cleaned = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return { soh: null, sohRaw: null };

  const lowered = cleaned.toLowerCase();
  if (["out of stock", "unavailable", "no stock"].some((token) => lowered.includes(token))) {
    return { soh: 0, sohRaw: cleaned };
  }

  const labelled = cleaned.match(SOH_NUMBER_RE);
  if (labelled) return { soh: Number(labelled[1]), sohRaw: cleaned };

  const digits = cleaned.match(/\b(\d+)\b/);
  if (
    digits &&
    ["soh", "stock", "qty", "available", "on hand"].some((token) => lowered.includes(token))
  ) {
    return { soh: Number(digits[1]), sohRaw: cleaned };
  }

  return { soh: null, sohRaw: cleaned };
}

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

async function waitForPage(page: Page, delayMs = 800) {
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 });
  } catch {
    // continue
  }
  await page.waitForTimeout(delayMs);
}

export async function discoverFesportsCategories(
  page: Page,
  startUrl: string,
  maxCategories?: number | null,
): Promise<string[]> {
  const normalisedStart = normaliseCategoryUrl(startUrl);
  const queue = [normalisedStart];
  const seen = new Set<string>();
  const discovered: string[] = [];

  while (queue.length) {
    const url = queue.shift()!;
    const key = categoryKey(url);
    if (seen.has(key)) continue;
    seen.add(key);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForPage(page, 500);
    discovered.push(url);

    const links = await page.evaluate(() => {
      return [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .map((anchor) => anchor.getAttribute("href"))
        .filter((href): href is string => Boolean(href && /\/Shop\/c_/i.test(href)));
    });

    for (const href of links) {
      const full = normaliseCategoryUrl(href);
      const linkKey = categoryKey(full);
      if (!seen.has(linkKey)) queue.push(full);
    }

    if (maxCategories && discovered.length >= maxCategories) break;
  }

  return discovered;
}

interface ListingCardData {
  productId: string;
  name: string;
  href: string;
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

  return page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(".prod_listing_row .prod_listing")];
    return cards
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
        const skuEl = card.querySelector<HTMLElement>(`.prxsku_${productId}`);
        const sohEl = card.querySelector<HTMLElement>(`.prx_slev_${productId}`);
        const supplyEl = card.querySelector<HTMLElement>(`.prx_supply_${productId}`);
        const imageEl = card.querySelector<HTMLImageElement>("img.plist_imi, img.product_image_main");
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
          price: priceAttr ?? priceEl?.textContent?.trim() ?? null,
          sku: skuEl?.textContent?.trim() ?? null,
          sohRaw: sohEl?.textContent?.trim() ?? null,
          supplyRaw: supplyEl?.textContent?.trim() ?? null,
          listingImage: imageEl?.getAttribute("src") ?? null,
          optionName: optionTitle?.textContent?.trim() ?? null,
          optId,
          options,
        };
      })
      .filter((card): card is ListingCardData => Boolean(card?.name && card.href));
  });
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
    price: typeof payload?.price === "string" ? payload.price : payload?.prx_price ?? null,
  };
}

async function scrapeDetailImages(page: Page, productUrl: string): Promise<string[]> {
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForPage(page, 600);
  const html = await page.content();
  return extractImageUrlsFromHtml(html);
}

export async function scrapeFesportsCategory(
  page: Page,
  categoryUrl: string,
  options?: { downloadImages?: boolean },
): Promise<FEsportsScrapedProduct[]> {
  const cards = await scrapeListingCards(page, categoryUrl);
  const products: FEsportsScrapedProduct[] = [];

  for (const card of cards) {
    const productUrl = normaliseCategoryUrl(card.href);
    let imageUrls = chooseBestImageUrls(card.listingImage ? [card.listingImage] : []);

    if (options?.downloadImages !== false) {
      const detailImages = await scrapeDetailImages(page, productUrl);
      imageUrls = chooseBestImageUrls([...imageUrls, ...detailImages]);
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
        sohParsed = { soh: totalSoh, sohRaw: variants.map((v) => v.sohRaw).filter(Boolean).join(", ") };
      }
      const primaryVariant = variants.find((variant) => variant.sku);
      if (primaryVariant?.sku && !card.sku) {
        card.sku = primaryVariant.sku;
      }
    }

    products.push({
      productId: card.productId,
      name: card.name,
      url: productUrl,
      categoryUrl,
      brand: extractBrandFromUrl(categoryUrl),
      price: parsePrice(card.price),
      sku: card.sku,
      soh: sohParsed.soh,
      sohRaw: sohParsed.sohRaw,
      imageUrls,
      variants,
    });
  }

  return products;
}

export type FEsportsSessionCookies = CookieParam[];

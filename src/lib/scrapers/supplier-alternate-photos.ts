import type { Page } from "puppeteer-core";
import { buildProductImageList } from "@/lib/scrapers/fesports-scraper";
import {
  chooseHighestQualityImageUrls,
  upgradeProductImageUrl,
} from "@/lib/scrapers/product-image-quality";
import type { SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";
import {
  launchSupplierBrowser,
  navigateSupplierPage,
  prepareSupplierPage,
} from "@/lib/scrapers/supplier-browser";
import { evaluateSupplierRuntime } from "@/lib/scrapers/supplier-page-runtime";
import { assertSafeSupplierUrl } from "@/lib/scrapers/supplier-security";
import type {
  AlternatePhotoMatch,
  AlternatePhotoSourceConfig,
  SupplierScrapedProduct,
} from "@/lib/scrapers/supplier-types";

interface PublicProductImages {
  title: string;
  url: string;
  imageUrls: string[];
  heroImageUrl: string | null;
}

interface SearchCandidate {
  url: string;
  text: string;
  score: number;
}

function normaliseToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseProductName(name: string): string {
  return name.trim().replace(/^[A-Z]\d{2}\s+/i, "");
}

function buildSearchQueries(product: SupplierScrapedProduct): string[] {
  const queries: string[] = [];
  const sku = product.sku?.trim();
  const brand = product.brand?.trim();
  const name = normaliseProductName(product.name);
  const nameQuery = [brand, name].filter(Boolean).join(" ").slice(0, 120);
  // Prefer the product name for public brand sites: B2B SKUs rarely match.
  if (nameQuery) queries.push(nameQuery);
  if (name && name !== nameQuery) queries.push(name);
  if (sku) queries.push(sku);
  return [...new Set(queries.filter(Boolean))];
}

function productNameToSlug(name: string): string {
  return normaliseProductName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDirectProductUrls(
  config: AlternatePhotoSourceConfig,
  product: SupplierScrapedProduct,
): string[] {
  const base = new URL(config.websiteUrl);
  const prefix = base.pathname.replace(/\/$/, "");
  const slugs = new Set<string>();

  const primarySlug = productNameToSlug(product.name);
  if (primarySlug) slugs.add(primarySlug);

  const withoutBrand = productNameToSlug(
    product.name.replace(new RegExp(`^${product.brand ?? ""}\\s+`, "i"), "").trim(),
  );
  if (withoutBrand) slugs.add(withoutBrand);

  const urls: string[] = [];
  for (const slug of slugs) {
    if (prefix) urls.push(`${base.origin}${prefix}/${slug}`);
    urls.push(`${base.origin}/${slug}`);
  }
  return [...new Set(urls)];
}

function buildSearchUrls(config: AlternatePhotoSourceConfig, query: string): string[] {
  const encoded = encodeURIComponent(query);
  const base = new URL(config.websiteUrl);
  const origin = base.origin;
  const prefix = base.pathname.replace(/\/$/, "");
  if (config.searchUrlTemplate?.trim()) {
    return [config.searchUrlTemplate.trim().replaceAll("{query}", encoded)];
  }
  // Prefer locale-aware search first; fall back to common Magento/WordPress patterns.
  if (prefix) {
    return [
      `${origin}${prefix}/catalogsearch/result/?q=${encoded}`,
      `${origin}${prefix}/?s=${encoded}`,
      `${origin}/catalogsearch/result/?q=${encoded}`,
    ];
  }
  return [
    `${origin}/catalogsearch/result/?q=${encoded}`,
    `${origin}/?s=${encoded}`,
    `${origin}/search?q=${encoded}`,
  ];
}

function tokeniseProductName(name: string): string[] {
  return normaliseProductName(name)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function scoreCandidate(
  text: string,
  sku: string | null,
  name: string,
  brand: string | null,
): number {
  const haystack = normaliseToken(text);
  if (!haystack) return 0;

  if (sku) {
    const skuNorm = normaliseToken(sku);
    if (skuNorm && haystack.includes(skuNorm)) return 100;
  }

  const nameTokens = tokeniseProductName(name);
  const brandTokens = brand
    ? normaliseToken(brand)
        .split(" ")
        .filter((token) => token.length > 2)
    : [];

  let score = 0;
  if (nameTokens.length > 0) {
    const matched = nameTokens.filter((token) => haystack.includes(token)).length;
    score += Math.round((matched / nameTokens.length) * 70);
  }
  if (brandTokens.length > 0 && brandTokens.some((token) => haystack.includes(token))) {
    score += 10;
  }
  return score;
}

async function collectSearchCandidates(
  page: Page,
  allowedHostname: string,
): Promise<SearchCandidate[]> {
  const links = await evaluateSupplierRuntime<
    Array<{ url: string; text: string }>
  >(page, "collectPublicProductLinksWithText");

  const candidates: SearchCandidate[] = [];
  for (const link of links.slice(0, 40)) {
    try {
      const url = (await assertSafeSupplierUrl(link.url, allowedHostname)).toString();
      candidates.push({ url, text: link.text, score: 0 });
    } catch {
      // Ignore unsafe or external links.
    }
  }

  return candidates;
}

function pickBestCandidate(
  candidates: SearchCandidate[],
  product: SupplierScrapedProduct,
): SearchCandidate | null {
  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      score: Math.max(
        scoreCandidate(candidate.text, product.sku, product.name, product.brand),
        scoreCandidate(candidate.url, product.sku, product.name, product.brand),
      ),
    }))
    .filter((candidate) => candidate.score >= 35)
    .sort((left, right) => right.score - left.score);

  return scored[0] ?? null;
}

async function extractImagesFromProductPage(
  page: Page,
  productUrl: string,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<PublicProductImages> {
  await navigateSupplierPage(page, productUrl, allowedHostname, logger);
  await evaluateSupplierRuntime(page, "loadLazyImages");
  return evaluateSupplierRuntime<PublicProductImages>(page, "extractPublicProductImages");
}

function buildMatchFromExtracted(
  extracted: PublicProductImages,
  config: AlternatePhotoSourceConfig,
  product: SupplierScrapedProduct,
  matchMethod: AlternatePhotoMatch["matchMethod"],
  matchScore: number,
): AlternatePhotoMatch {
  const imageList = buildProductImageList(extracted.heroImageUrl, extracted.imageUrls);
  const imageUrls = chooseHighestQualityImageUrls(imageList.imageUrls, extracted.url);
  const heroImageUrl = imageList.heroImageUrl
    ? upgradeProductImageUrl(imageList.heroImageUrl, extracted.url)
    : imageUrls[0] ?? null;
  if (imageUrls.length === 0) {
    return {
      ...emptyMatch(config, "not_found"),
      productUrl: extracted.url,
      matchMethod,
      matchScore,
    };
  }

  return {
    sourceName: config.sourceName,
    websiteUrl: config.websiteUrl,
    productUrl: extracted.url,
    imageUrls,
    heroImageUrl,
    matchMethod,
    matchScore,
    status: "matched",
    error: null,
  };
}

async function tryDirectProductUrls(
  page: Page,
  product: SupplierScrapedProduct,
  config: AlternatePhotoSourceConfig,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<AlternatePhotoMatch | null> {
  const directUrls = buildDirectProductUrls(config, product);

  for (const productUrl of directUrls) {
    try {
      logger?.detail("alternate-photo", "Trying direct product URL", { productUrl });
      const extracted = await extractImagesFromProductPage(
        page,
        productUrl,
        allowedHostname,
        logger,
      );
      const matchScore = Math.max(
        scoreCandidate(extracted.title, product.sku, product.name, product.brand),
        scoreCandidate(extracted.url, product.sku, product.name, product.brand),
      );
      if (matchScore < 35) continue;

      const match = buildMatchFromExtracted(
        extracted,
        config,
        product,
        matchScore === 100 ? "sku" : "name",
        matchScore,
      );
      if (match.status !== "matched") continue;
      // Accept the first usable match instead of hunting for a higher score.
      return match;
    } catch {
      // Try the next slug pattern.
    }
  }

  return null;
}

function emptyMatch(
  config: AlternatePhotoSourceConfig,
  status: AlternatePhotoMatch["status"],
  error?: string,
): AlternatePhotoMatch {
  return {
    sourceName: config.sourceName,
    websiteUrl: config.websiteUrl,
    productUrl: null,
    imageUrls: [],
    heroImageUrl: null,
    matchMethod: "none",
    matchScore: 0,
    status,
    error: error ?? null,
  };
}

export async function fetchAlternatePhotoForProduct(
  page: Page,
  product: SupplierScrapedProduct,
  config: AlternatePhotoSourceConfig,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<AlternatePhotoMatch> {
  const queries = buildSearchQueries(product);
  if (queries.length === 0) {
    return emptyMatch(config, "not_found", "No SKU or product name to search with.");
  }

  const directMatch = await tryDirectProductUrls(
    page,
    product,
    config,
    allowedHostname,
    logger,
  );
  if (directMatch) return directMatch;

  let bestCandidate: SearchCandidate | null = null;

  for (const query of queries) {
    const searchUrls = buildSearchUrls(config, query);
    for (const searchUrl of searchUrls) {
      try {
        logger?.detail("alternate-photo", "Searching official photo site", { searchUrl, query });
        await navigateSupplierPage(page, searchUrl, allowedHostname, logger);
        const candidates = await collectSearchCandidates(page, allowedHostname);
        const candidate = pickBestCandidate(candidates, product);
        if (candidate && (!bestCandidate || candidate.score > bestCandidate.score)) {
          bestCandidate = candidate;
        }
        // Stop after the first search page that yields a usable match.
        if (bestCandidate && bestCandidate.score >= 35) break;
      } catch {
        // Try the next search URL pattern.
      }
    }
    if (bestCandidate && bestCandidate.score >= 35) break;
  }

  if (!bestCandidate) {
    return emptyMatch(config, "not_found");
  }

  try {
    const extracted = await extractImagesFromProductPage(
      page,
      bestCandidate.url,
      allowedHostname,
      logger,
    );
    return buildMatchFromExtracted(
      extracted,
      config,
      product,
      bestCandidate.score === 100 ? "sku" : "name",
      bestCandidate.score,
    );
  } catch (error) {
    return {
      ...emptyMatch(
        config,
        "error",
        error instanceof Error ? error.message : "Could not extract official photos.",
      ),
      productUrl: bestCandidate.url,
      matchMethod: bestCandidate.score === 100 ? "sku" : "name",
      matchScore: bestCandidate.score,
    };
  }
}

export interface FetchAlternatePhotosInput {
  products: SupplierScrapedProduct[];
  config: AlternatePhotoSourceConfig;
  logger?: SupplierScraperLogger;
  onProductMatched?: (
    product: SupplierScrapedProduct,
    progress: { index: number; total: number },
  ) => void | Promise<void>;
}

export async function fetchAlternatePhotosForProducts(
  input: FetchAlternatePhotosInput,
): Promise<SupplierScrapedProduct[]> {
  const websiteUrl = await assertSafeSupplierUrl(input.config.websiteUrl);
  const allowedHostname = websiteUrl.hostname;
  const browser = await launchSupplierBrowser(input.logger);
  const PHOTO_CONCURRENCY = 3;

  try {
    const workerPages = await Promise.all(
      Array.from({ length: Math.min(PHOTO_CONCURRENCY, Math.max(input.products.length, 1)) }, () =>
        prepareSupplierPage(browser),
      ),
    );
    const enriched: SupplierScrapedProduct[] = new Array(input.products.length);
    let completed = 0;

    input.logger?.step("alternate-photo", `Matching official photos`, {
      products: input.products.length,
      concurrency: workerPages.length,
    });

    for (let start = 0; start < input.products.length; start += workerPages.length) {
      const batch = input.products.slice(start, start + workerPages.length);
      await Promise.all(
        batch.map(async (product, batchIndex) => {
          const absoluteIndex = start + batchIndex;
          const page = workerPages[batchIndex];
          input.logger?.step(
            "alternate-photo",
            `Matching official photos for ${product.name}`,
            { index: absoluteIndex + 1, total: input.products.length },
          );
          const alternatePhoto = await fetchAlternatePhotoForProduct(
            page,
            product,
            input.config,
            allowedHostname,
            input.logger,
          );
          const nextProduct = { ...product, alternatePhoto };
          enriched[absoluteIndex] = nextProduct;
          completed += 1;
          await input.onProductMatched?.(nextProduct, {
            index: completed,
            total: input.products.length,
          });
        }),
      );
    }

    return enriched.filter(Boolean);
  } finally {
    await browser.close();
  }
}

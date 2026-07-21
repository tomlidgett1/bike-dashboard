import { createHash } from "node:crypto";
import type { Browser, Page } from "puppeteer-core";
import {
  analyseSupplierCatalogue,
  analyseSupplierProduct,
} from "@/lib/scrapers/supplier-ai";
import {
  launchSupplierBrowser,
  loginToSupplier,
  navigateSupplierPage,
  prepareSupplierPage,
  snapshotSupplierPage,
} from "@/lib/scrapers/supplier-browser";
import {
  assertSafeSupplierUrl,
  type SupplierCredentials,
} from "@/lib/scrapers/supplier-security";
import type { SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";
import { evaluateSupplierRuntime } from "@/lib/scrapers/supplier-page-runtime";
import {
  buildProductImageList,
  parseSohValue,
} from "@/lib/scrapers/fesports-scraper";
import {
  collectBrowseLinksUniversal,
  collectProductLinksUniversal,
  discoverProductExports,
  discoverProductsFromSitemap,
  enumerateObservedApiSource,
  observeProductNetwork,
  readPageProductTotal,
  resolveNextPageUniversal,
  type SupplierDiscoveryEvidence,
} from "@/lib/scrapers/supplier-universal-discovery";
import type {
  SupplierBrowseMode,
  SupplierBrowseOption,
  SupplierProductSelectors,
  SupplierScrapedProduct,
  SupplierScrapeTarget,
  SupplierScraperConfig,
  SupplierVariant,
} from "@/lib/scrapers/supplier-types";

interface BuildSupplierScraperInput {
  websiteUrl: string;
  loginUrl?: string | null;
  credentials: SupplierCredentials;
  logger?: SupplierScraperLogger;
}

interface RunSupplierScraperInput {
  config: SupplierScraperConfig;
  credentials: SupplierCredentials;
  mode: SupplierBrowseMode;
  optionIds: string[];
  /** Explicit scrape targets (e.g. brand subcategories). Overrides optionIds lookup when provided. */
  scrapeTargets?: SupplierScrapeTarget[];
  /**
   * Max products to scrape from each selected brand/category target.
   * Null means scrape every product found under each target.
   */
  maxProducts?: number | null;
  logger?: SupplierScraperLogger;
  onScrapeStarted?: (total: number) => void | Promise<void>;
  onProductScraped?: (
    product: SupplierScrapedProduct,
    progress: { index: number; total: number },
  ) => void | Promise<void>;
}

interface RawVariant {
  optionName: string | null;
  optionValue: string | null;
  sku: string | null;
  stock: string | null;
  price: string | null;
}

interface RawProductPage {
  name: string;
  price: string | null;
  sku: string | null;
  stock: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
  specifications: string | null;
  fields: Record<string, string>;
  imageUrls: string[];
  variants: RawVariant[];
}

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const matches = raw.replace(/,/g, "").match(/(?:\d+\.\d{1,2}|\d+)/g);
  if (!matches?.length) return null;
  const value = Number(matches[matches.length - 1]);
  return Number.isFinite(value) ? value : null;
}

function productIdFromUrl(url: string, sku: string | null): string {
  return createHash("sha256")
    .update(`${url}\n${sku ?? ""}`)
    .digest("hex")
    .slice(0, 24);
}

function optionId(kind: SupplierBrowseMode, name: string, url: string): string {
  return createHash("sha256")
    .update(`${kind}\n${name}\n${url}`)
    .digest("hex")
    .slice(0, 16);
}

function uniqueOptions(options: SupplierBrowseOption[]): SupplierBrowseOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Drop parent "(All)" brand hubs when child category URLs already exist. */
function preferLeafBrowseOptions(
  options: SupplierBrowseOption[],
): SupplierBrowseOption[] {
  const normalised = options.map((option) => ({
    option,
    base: option.url.replace(/\/$/, "").toLowerCase(),
  }));
  return normalised
    .filter(({ option, base }) => {
      const hasChild = normalised.some(
        (other) => other.base !== base && other.base.startsWith(`${base}/`),
      );
      if (!hasChild) return true;
      if (/\(all\)\s*$/i.test(option.name)) return false;
      return true;
    })
    .map(({ option }) => option);
}

async function harvestBrowseLinksFromDom(
  page: Page,
  allowedHostname: string,
): Promise<{
  brandOptions: SupplierBrowseOption[];
  categoryOptions: SupplierBrowseOption[];
  shopUrl: string | null;
}> {
  const raw = await page.evaluate(() => {
    const brands: Array<{ name: string; url: string }> = [];
    const categories: Array<{ name: string; url: string }> = [];
    let shopUrl: string | null = null;
    const seen = new Set<string>();

    for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = anchor.href;
      if (!href || seen.has(href)) continue;
      const name = (anchor.textContent || "").replace(/\s+/g, " ").trim();
      if (!name || name.length > 80) continue;

      if (/\/brand\//i.test(href)) {
        seen.add(href);
        brands.push({ name, url: href });
      } else if (/\/product-category\//i.test(href)) {
        seen.add(href);
        categories.push({ name, url: href });
      } else if (
        !shopUrl &&
        /\/(shop|products)\/?$/i.test(new URL(href).pathname)
      ) {
        shopUrl = href;
      }
    }

    return { brands, categories, shopUrl };
  });

  const brandOptions = await safeOptions(
    raw.brands.map((item) => ({
      id: optionId("brand", item.name, item.url),
      kind: "brand" as const,
      name: item.name,
      url: item.url,
      imageUrl: null,
    })),
    allowedHostname,
  );
  const categoryOptions = await safeOptions(
    raw.categories.map((item) => ({
      id: optionId("category", item.name, item.url),
      kind: "category" as const,
      name: item.name,
      url: item.url,
      imageUrl: null,
    })),
    allowedHostname,
  );

  let shopUrl: string | null = null;
  if (raw.shopUrl) {
    try {
      shopUrl = (
        await assertSafeSupplierUrl(raw.shopUrl, allowedHostname)
      ).toString();
    } catch {
      shopUrl = null;
    }
  }

  return {
    brandOptions: preferLeafBrowseOptions(brandOptions),
    categoryOptions: preferLeafBrowseOptions(categoryOptions),
    shopUrl,
  };
}

async function safeOptions(
  options: SupplierBrowseOption[],
  hostname: string,
): Promise<SupplierBrowseOption[]> {
  const validated = await Promise.all(
    options.map(async (option) => {
      try {
        const url = await assertSafeSupplierUrl(option.url, hostname);
        return {
          ...option,
          id: option.id || optionId(
            option.kind === "subcategory" ? "category" : option.kind,
            option.name,
            url.toString(),
          ),
          url: url.toString(),
        };
      } catch {
        return null;
      }
    }),
  );
  return uniqueOptions(
    validated.filter((option): option is SupplierBrowseOption => Boolean(option)),
  );
}

async function collectProductLinks(
  page: Page,
  selector: string,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<string[]> {
  const result = await collectProductLinksUniversal(
    page,
    allowedHostname,
    selector,
    logger,
  );
  return result.urls;
}

async function loadAllLazyImages(page: Page): Promise<void> {
  await evaluateSupplierRuntime(page, "loadLazyImages");
  await page.waitForNetworkIdle({ idleTime: 120, timeout: 600 }).catch(() => undefined);
}

async function extractProductPage(
  page: Page,
  selectors: SupplierProductSelectors,
): Promise<RawProductPage> {
  await loadAllLazyImages(page);
  return evaluateSupplierRuntime<RawProductPage>(page, "extractSupplierProduct", selectors);
}

/** Parallel product-page workers per browser session. */
export const SUPPLIER_PRODUCT_CONCURRENCY = 32;
/** Parallel listing/subcategory pages while discovering product URLs. */
export const SUPPLIER_DISCOVERY_CONCURRENCY = 24;
/** Parallel brand/category targets while collecting URLs. */
export const SUPPLIER_TARGET_CONCURRENCY = 8;
/** Hard cap on concurrent Chromium tabs for one scrape session. */
export const SUPPLIER_MAX_BROWSER_PAGES = 40;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, index);
      }
    }),
  );

  return results;
}

function discoveryConcurrencyForTargets(targetCount: number): number {
  const targets = Math.max(1, targetCount);
  // Keep total tabs near SUPPLIER_MAX_BROWSER_PAGES when many targets run together.
  const perTarget = Math.floor(SUPPLIER_MAX_BROWSER_PAGES / targets);
  return Math.max(6, Math.min(SUPPLIER_DISCOVERY_CONCURRENCY, perTarget));
}

async function scrapeProductPage(
  page: Page,
  url: string,
  categoryUrl: string,
  selectors: SupplierProductSelectors,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
  throwOnError = false,
): Promise<SupplierScrapedProduct | null> {
  try {
    logger?.detail("product", "Scraping product page", { url });
    await navigateSupplierPage(page, url, allowedHostname, logger);
    const raw = await extractProductPage(page, selectors);
    if (!raw.name) {
      logger?.warn("product", "Product page had no title", { url });
      return null;
    }

    const stock = parseSohValue(raw.stock);
    const variants: SupplierVariant[] = raw.variants.map((variant) => {
      const variantStock = parseSohValue(variant.stock);
      return {
        optionName: variant.optionName,
        optionValue: variant.optionValue,
        sku: variant.sku,
        soh: variantStock.soh,
        sohRaw: variantStock.sohRaw,
        price: variant.price,
      };
    });
    const variantStockTotal = variants.reduce(
      (total, variant) => total + (variant.soh ?? 0),
      0,
    );
    const imageList = buildProductImageList(raw.imageUrls[0] ?? null, raw.imageUrls);

    logger?.detail("product", "Product scraped", {
      name: raw.name,
      sku: raw.sku,
      images: imageList.imageUrls.length,
      variants: variants.length,
    });

    return {
      productId: productIdFromUrl(url, raw.sku),
      name: raw.name,
      url,
      categoryUrl,
      brand: raw.brand,
      price: parsePrice(raw.price),
      sku: raw.sku,
      soh: variants.length > 0 ? variantStockTotal : stock.soh,
      sohRaw: variants.length > 0 ? `${variants.length} variants` : stock.sohRaw,
      description: raw.description,
      imageUrls: imageList.imageUrls,
      heroImageUrl: imageList.heroImageUrl,
      fields: {
        ...raw.fields,
        ...(raw.category ? { Category: raw.category } : {}),
        ...(raw.specifications ? { Specifications: raw.specifications } : {}),
        ...(raw.price ? { "Retail price": raw.price } : {}),
      },
      variants,
    };
  } catch (error) {
    logger?.warn("product", "Product scrape failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    if (throwOnError) throw error;
    return null;
  }
}

async function collectFesportsChildCategoryUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selectors = [
      ".bc_subitem a[href]",
      ".card-wgt-category a[href]",
      ".subcats_row a[href]",
    ];
    const hrefs: string[] = [];
    const seen = new Set<string>();
    for (const selector of selectors) {
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>(selector)) {
        const href = anchor.href;
        if (!href || seen.has(href)) continue;
        // Keep category leaves (/Shop/c_1234/Name), skip product detail pages.
        if (/\/Shop\/p_\d+/i.test(href)) continue;
        if (!/\/Shop\/c_\d+/i.test(href)) continue;
        seen.add(href);
        hrefs.push(href);
      }
    }
    return hrefs;
  });
}

async function pageHasFesportsProductCards(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.querySelectorAll(".prod_listing_row .prod_listing").length > 0,
  );
}

async function discoverProductLinksForOption(
  browser: Browser,
  seedPage: Page,
  optionUrl: string,
  config: SupplierScraperConfig,
  allowedHostname: string,
  limit: number | null,
  logger?: SupplierScraperLogger,
  onPage?: (info: {
    pageIndex: number;
    pagesVisited: number;
    urlsFound: number;
    added: number;
    pageUrl: string;
    sampleUrls?: string[];
  }) => Promise<void> | void,
  discoveryConcurrency = SUPPLIER_DISCOVERY_CONCURRENCY,
  onProductUrlsFound?: (
    urls: string[],
    context: { pageUrl: string },
  ) => Promise<void | { stop?: boolean }> | void | { stop?: boolean },
): Promise<string[]> {
  const discovered = new Set<string>();
  const visitedPages = new Set<string>();
  const listingQueue: string[] = [optionUrl];
  const queuedListings = new Set<string>([
    optionUrl.replace(/\/$/, "").toLowerCase(),
  ]);
  const isFesports = /fesports\.com\.au/i.test(allowedHostname);
  let pagesVisited = 0;
  let pageReports = 0;

  const concurrency = Math.max(1, Math.min(discoveryConcurrency, SUPPLIER_MAX_BROWSER_PAGES));

  logger?.step("catalogue", "Discovering products", {
    optionUrl,
    limit: limit ?? "all",
    concurrency,
  });

  const workers: Page[] = [seedPage];
  try {
    while (workers.length < concurrency) {
      workers.push(await prepareSupplierPage(browser));
    }

    const exploreOne = async (
      worker: Page,
      pageUrl: string,
    ): Promise<{
      pageUrl: string;
      productUrls: string[];
      childUrls: string[];
      nextPageUrl: string | null;
      learnedSelector: string | null;
    }> => {
      await navigateSupplierPage(worker, pageUrl, allowedHostname, logger);
      const collected = await collectProductLinksUniversal(
        worker,
        allowedHostname,
        config.productLinkSelector,
        logger,
      );

      let childUrls: string[] = [];
      if (collected.urls.length === 0 && isFesports) {
        const hasCards = await pageHasFesportsProductCards(worker);
        if (!hasCards) {
          const children = await collectFesportsChildCategoryUrls(worker);
          for (const child of children) {
            try {
              const safe = (
                await assertSafeSupplierUrl(child, allowedHostname)
              ).toString();
              if (safe === optionUrl) continue;
              childUrls.push(safe);
            } catch {
              // ignore unsafe
            }
          }
        }
      }

      let nextPageUrl: string | null = null;
      if (collected.urls.length > 0) {
        nextPageUrl = await resolveNextPageUniversal(
          worker,
          allowedHostname,
          config.nextPageSelector,
          logger,
          { allowSyntheticPage: true },
        );
        const normalised = pageUrl.replace(/\/$/, "").toLowerCase();
        if (
          nextPageUrl &&
          nextPageUrl.replace(/\/$/, "").toLowerCase() === normalised
        ) {
          // Load-more stays on same URL; re-collect once more only.
          nextPageUrl = null;
        }
      }

      return {
        pageUrl,
        productUrls: collected.urls,
        childUrls,
        nextPageUrl,
        learnedSelector: collected.learnedSelector,
      };
    };

    while (listingQueue.length > 0) {
      if (limit && discovered.size >= limit) break;

      const batch: string[] = [];
      while (batch.length < concurrency && listingQueue.length > 0) {
        const next = listingQueue.shift()!;
        const key = next.replace(/\/$/, "").toLowerCase();
        if (visitedPages.has(key)) continue;
        visitedPages.add(key);
        batch.push(next);
      }
      if (batch.length === 0) break;

      pagesVisited += batch.length;
      logger?.detail(
        "catalogue",
        `Exploring ${batch.length} listing pages in parallel`,
        { queued: listingQueue.length, found: discovered.size },
      );

      const batchResults = await Promise.all(
        batch.map((pageUrl, index) =>
          exploreOne(workers[index] ?? seedPage, pageUrl),
        ),
      );

      for (const result of batchResults) {
        if (
          result.learnedSelector &&
          result.learnedSelector !== config.productLinkSelector &&
          result.productUrls.length > 0
        ) {
          config.productLinkSelector = result.learnedSelector;
        }

        const before = discovered.size;
        for (const link of result.productUrls) {
          discovered.add(link);
          if (limit && discovered.size >= limit) break;
        }
        const added = discovered.size - before;
        pageReports += 1;
        const pageSamples = [...discovered].slice(before).slice(0, 8);

        if (added > 0) {
          logger?.detail(
            "catalogue",
            `Page added ${added} products (${discovered.size} total)`,
            { pageUrl: result.pageUrl },
          );
          logger?.detail(
            "urls",
            `+${added}: ${pageSamples.slice(0, 3).join(" · ")}${
              pageSamples.length > 3 ? ` (+${added - 3} more)` : ""
            }`,
          );
        }

        if (added > 0 && onProductUrlsFound) {
          const freshUrls = [...discovered].slice(before);
          const signal = await onProductUrlsFound(freshUrls, {
            pageUrl: result.pageUrl,
          });
          if (signal?.stop) {
            logger?.detail(
              "catalogue",
              "Stopping discovery early (stream budget / caller stop)",
              { found: discovered.size },
            );
            listingQueue.length = 0;
            break;
          }
        }

        await onPage?.({
          pageIndex: pageReports,
          pagesVisited,
          urlsFound: discovered.size,
          added,
          pageUrl: result.pageUrl,
          sampleUrls: pageSamples,
        });

        for (const child of result.childUrls) {
          const key = child.replace(/\/$/, "").toLowerCase();
          if (queuedListings.has(key) || visitedPages.has(key)) continue;
          queuedListings.add(key);
          listingQueue.push(child);
        }

        if (result.nextPageUrl) {
          const key = result.nextPageUrl.replace(/\/$/, "").toLowerCase();
          if (!queuedListings.has(key) && !visitedPages.has(key)) {
            queuedListings.add(key);
            listingQueue.push(result.nextPageUrl);
          }
        }

        if (result.childUrls.length > 0 && added === 0) {
          logger?.detail(
            "catalogue",
            `FE Sports hub has no products yet; queued ${result.childUrls.length} subcategories`,
            { pageUrl: result.pageUrl },
          );
        }
      }

      if (isFesports && limit && discovered.size === 0 && pagesVisited > 80) {
        logger?.warn(
          "catalogue",
          "Stopped FE Sports subcategory walk without products",
          { optionUrl, pagesVisited },
        );
        break;
      }
    }
  } finally {
    for (const worker of workers) {
      if (worker !== seedPage) await worker.close().catch(() => undefined);
    }
  }

  logger?.success("catalogue", "Product discovery complete", {
    optionUrl,
    products: discovered.size,
    pages: visitedPages.size,
    concurrency,
  });
  return limit ? [...discovered].slice(0, limit) : [...discovered];
}

export async function buildSupplierScraper(
  input: BuildSupplierScraperInput,
): Promise<{ config: SupplierScraperConfig; sampleProducts: SupplierScrapedProduct[] }> {
  const logger = input.logger;
  logger?.step("build", "Starting supplier scraper build", {
    websiteUrl: input.websiteUrl,
    loginUrl: input.loginUrl ?? input.websiteUrl,
  });

  const websiteUrl = await assertSafeSupplierUrl(input.websiteUrl);
  const allowedHostname = websiteUrl.hostname;
  const loginUrl = await assertSafeSupplierUrl(
    input.loginUrl?.trim() || websiteUrl.toString(),
    allowedHostname,
  );

  const browser = await launchSupplierBrowser(logger);
  try {
    const page = await prepareSupplierPage(browser);
    const loginSelectors = await loginToSupplier(
      page,
      loginUrl.toString(),
      allowedHostname,
      input.credentials,
      null,
      logger,
    );

    const landingSnapshot = await snapshotSupplierPage(page, logger);
    const landingAnalysis = await analyseSupplierCatalogue(landingSnapshot, logger);
    const firstCatalogueUrl = await assertSafeSupplierUrl(
      landingAnalysis.catalogueUrl,
      allowedHostname,
    );

    logger?.step("catalogue", "Opening catalogue page", {
      catalogueUrl: firstCatalogueUrl.toString(),
    });
    await navigateSupplierPage(page, firstCatalogueUrl.toString(), allowedHostname, logger);
    const catalogueSnapshot = await snapshotSupplierPage(page, logger);
    const catalogueAnalysis = await analyseSupplierCatalogue(catalogueSnapshot, logger);
    // Prefer a real catalogue/shop page over account dashboards.
    let catalogueUrl = await assertSafeSupplierUrl(
      catalogueAnalysis.catalogueUrl,
      allowedHostname,
    );
    if (/\/(login|my-account)\b/i.test(catalogueUrl.pathname)) {
      const fallbackCatalogue =
        landingAnalysis.catalogueUrl &&
        !/\/(login|my-account)\b/i.test(landingAnalysis.catalogueUrl)
          ? landingAnalysis.catalogueUrl
          : `${websiteUrl.origin}/shop/`;
      try {
        catalogueUrl = await assertSafeSupplierUrl(
          fallbackCatalogue,
          allowedHostname,
        );
        logger?.detail("catalogue", "Replaced account URL with catalogue/shop", {
          catalogueUrl: catalogueUrl.toString(),
        });
      } catch {
        // Keep AI URL if fallback is invalid.
      }
    }
    if (page.url() !== catalogueUrl.toString()) {
      await navigateSupplierPage(page, catalogueUrl.toString(), allowedHostname, logger);
    }

    const harvested = await harvestBrowseLinksFromDom(page, allowedHostname);
    if (harvested.shopUrl && /\/(login|my-account)\b/i.test(catalogueUrl.pathname)) {
      catalogueUrl = await assertSafeSupplierUrl(
        harvested.shopUrl,
        allowedHostname,
      );
      await navigateSupplierPage(page, catalogueUrl.toString(), allowedHostname, logger);
    }

    const brandOptions = preferLeafBrowseOptions(
      uniqueOptions([
        ...(await safeOptions(catalogueAnalysis.brandOptions, allowedHostname)),
        ...harvested.brandOptions,
      ]),
    );
    let categoryOptions = preferLeafBrowseOptions(
      uniqueOptions([
        ...(await safeOptions(catalogueAnalysis.categoryOptions, allowedHostname)),
        ...harvested.categoryOptions,
      ]),
    );
    logger?.detail("catalogue", "Browse targets after DOM harvest", {
      brands: brandOptions.length,
      categories: categoryOptions.length,
    });

    let productLinks = await collectProductLinks(
      page,
      catalogueAnalysis.productLinkSelector,
      allowedHostname,
      logger,
    );

    const firstOption =
      (/fesports\.com\.au$/i.test(allowedHostname)
        ? categoryOptions[0] ?? brandOptions[0]
        : brandOptions[0] ?? categoryOptions[0]) ?? null;
    if (productLinks.length === 0 && firstOption) {
      logger?.detail("catalogue", "Opening first browse option to find products", {
        option: firstOption.name,
        url: firstOption.url,
      });
      await navigateSupplierPage(page, firstOption.url, allowedHostname, logger);
      productLinks = await collectProductLinks(
        page,
        catalogueAnalysis.productLinkSelector,
        allowedHostname,
        logger,
      );
    }

    const analysedSampleUrl = catalogueAnalysis.sampleProductUrl
      ? await assertSafeSupplierUrl(catalogueAnalysis.sampleProductUrl, allowedHostname)
          .then((url) => url.toString())
          .catch(() => null)
      : null;
    const sampleProductUrl = analysedSampleUrl ?? productLinks[0] ?? null;
    if (!sampleProductUrl) {
      throw new Error(
        "YJ found the catalogue but could not identify a product detail page. Try a more specific catalogue URL.",
      );
    }

    logger?.step("product", "Opening sample product page", { sampleProductUrl });
    await navigateSupplierPage(page, sampleProductUrl, allowedHostname, logger);
    const productSnapshot = await snapshotSupplierPage(page, logger);
    const productSelectors = await analyseSupplierProduct(productSnapshot, logger);

    if (brandOptions.length === 0 && categoryOptions.length === 0) {
      categoryOptions = [
        {
          id: optionId("category", "All products", catalogueUrl.toString()),
          kind: "category",
          name: "All products",
          url: catalogueUrl.toString(),
          imageUrl: null,
        },
      ];
    }

    const browseModes: SupplierBrowseMode[] = [];
    if (brandOptions.length > 0) browseModes.push("brand");
    if (categoryOptions.length > 0) browseModes.push("category");

    const config: SupplierScraperConfig = {
      version: 1,
      supplierName:
        catalogueAnalysis.supplierName ||
        landingAnalysis.supplierName ||
        websiteUrl.hostname,
      baseUrl: websiteUrl.toString(),
      loginUrl: loginUrl.toString(),
      catalogueUrl: catalogueUrl.toString(),
      loginSelectors,
      browseModes,
      brandOptions,
      categoryOptions,
      productLinkSelector: catalogueAnalysis.productLinkSelector || "a[href*='/product/']",
      nextPageSelector:
        catalogueAnalysis.nextPageSelector ||
        ".woocommerce-pagination a.next, a[rel='next'], a.page-numbers.next",
      productSelectors,
    };

    const sampleProduct = await scrapeProductPage(
      page,
      sampleProductUrl,
      firstOption?.url ?? catalogueUrl.toString(),
      productSelectors,
      allowedHostname,
      logger,
    );

    logger?.success("build", "Supplier scraper build complete", {
      supplierName: config.supplierName,
      brandOptions: brandOptions.length,
      categoryOptions: categoryOptions.length,
      sampleProducts: sampleProduct ? 1 : 0,
    });

    return {
      config,
      sampleProducts: sampleProduct ? [sampleProduct] : [],
    };
  } finally {
    logger?.detail("browser", "Closing browser");
    await browser.close();
  }
}

export async function discoverOptionSubcategories(input: {
  config: SupplierScraperConfig;
  credentials: SupplierCredentials;
  mode: SupplierBrowseMode;
  optionIds: string[];
  logger?: SupplierScraperLogger;
}): Promise<Record<string, SupplierBrowseOption[]>> {
  const logger = input.logger;
  const parents =
    input.mode === "brand"
      ? input.config.brandOptions.filter((option) => input.optionIds.includes(option.id))
      : input.config.categoryOptions.filter((option) => input.optionIds.includes(option.id));
  if (parents.length === 0) {
    throw new Error(
      `Choose at least one ${input.mode} to load categories for.`,
    );
  }

  const baseUrl = await assertSafeSupplierUrl(input.config.baseUrl);
  const allowedHostname = baseUrl.hostname;
  const result: Record<string, SupplierBrowseOption[]> = {};

  // FE Sports: brand hubs (C_123) map to product grids (c_230_123), but those
  // grids are usually category trees (Helmets, Gloves, …). Prefer live children
  // from the product-grid page over returning the hub alone.
  const isFesports = /fesports\.com\.au/i.test(baseUrl.hostname);
  const fesportsSeedByParent = new Map<string, SupplierBrowseOption[]>();
  if (isFesports && input.mode === "brand") {
    for (const parent of parents) {
      const brandMatch = parent.url.match(/\/Shop\/C_(\d+)\b/i);
      if (!brandMatch) continue;
      const brandId = brandMatch[1]!;
      const related = input.config.categoryOptions
        .filter((option) =>
          new RegExp(`/Shop/c_\\d+_${brandId}\\b`, "i").test(option.url),
        )
        .map((option) => ({
          ...option,
          kind: "subcategory" as const,
          parentId: parent.id,
        }));
      if (related.length > 0) {
        fesportsSeedByParent.set(parent.id, related);
        logger?.detail(
          "catalogue",
          `FE Sports seed grid for ${parent.name}: ${related.map((item) => item.url).join(", ")}`,
        );
      }
    }
  }

  const browser = await launchSupplierBrowser(logger);

  try {
    const page = await prepareSupplierPage(browser);
    await loginToSupplier(
      page,
      input.config.loginUrl,
      allowedHostname,
      input.credentials,
      input.config.loginSelectors,
      logger,
    );

    for (const parent of parents) {
      if (result[parent.id]?.length) continue;

      const seedGrids = fesportsSeedByParent.get(parent.id) ?? [];
      const pagesToScan = [
        ...seedGrids.map((item) => item.url),
        parent.url,
      ].filter((url, index, all) => all.indexOf(url) === index);

      const categories: SupplierBrowseOption[] = [];
      const seen = new Set<string>();

      const pushCategory = async (name: string, rawUrl: string) => {
        try {
          const safeUrl = (
            await assertSafeSupplierUrl(rawUrl, allowedHostname)
          ).toString();
          if (seen.has(safeUrl) || safeUrl === parent.url) return;
          // Skip FE product detail pages; we want browse categories only.
          if (/\/Shop\/p_\d+/i.test(safeUrl)) return;
          seen.add(safeUrl);
          categories.push({
            id: createHash("sha1")
              .update(`${parent.id}:${safeUrl}`)
              .digest("hex")
              .slice(0, 16),
            kind: "subcategory",
            name: name || "Category",
            url: safeUrl,
            imageUrl: null,
            parentId: parent.id,
          });
        } catch {
          // Ignore unsafe links.
        }
      };

      for (const scanUrl of pagesToScan) {
        logger?.step("catalogue", `Finding categories within ${parent.name}`, {
          url: scanUrl,
          mode: input.mode,
        });
        await navigateSupplierPage(page, scanUrl, allowedHostname, logger);

        if (isFesports) {
          const feChildren = await collectFesportsChildCategoryUrls(page);
          for (const childUrl of feChildren) {
            const name =
              new URL(childUrl).pathname
                .split("/")
                .filter(Boolean)
                .at(-1)
                ?.replace(/[-_]+/g, " ") || "Category";
            await pushCategory(name, childUrl);
          }
        }

        if (categories.length > 0) break;

        const links = await evaluateSupplierRuntime<
          Array<{ name: string; url: string }>
        >(page, "collectBrandSubcategoryLinks", {
          brandName: parent.name,
          brandUrl: parent.url,
        });

        const parentUrl = new URL(parent.url);
        const parentPath = parentUrl.pathname.replace(/\/$/, "");
        const feBrandId = parent.url.match(/\/Shop\/C_(\d+)\b/i)?.[1] ?? null;

        const isLikelyChild = (rawUrl: string): boolean => {
          try {
            const candidate = new URL(rawUrl);
            if (candidate.hostname !== parentUrl.hostname) return false;
            const path = candidate.pathname.replace(/\/$/, "");
            if (!path || path === parentPath) return false;
            if (path.startsWith(`${parentPath}/`)) return true;
            if (
              feBrandId &&
              new RegExp(`/Shop/c_\\d+_${feBrandId}\\b`, "i").test(path)
            ) {
              return true;
            }
            if (/\/Shop\/C_\d+\b/i.test(path) && path !== parentPath) {
              return false;
            }
            // FE Sports concrete category leaves: /Shop/c_1572/Helmets
            if (isFesports && /\/Shop\/c_\d+\/[^/]+$/i.test(path)) {
              return true;
            }
            return false;
          } catch {
            return false;
          }
        };

        for (const link of links) {
          if (!isLikelyChild(link.url)) continue;
          await pushCategory(link.name, link.url);
        }

        if (categories.length === 0) {
          const browseUrls = await collectBrowseLinksUniversal(
            page,
            allowedHostname,
          );
          for (const browseUrl of browseUrls) {
            if (!isLikelyChild(browseUrl)) continue;
            const name =
              new URL(browseUrl).pathname
                .split("/")
                .filter(Boolean)
                .at(-1)
                ?.replace(/[-_]+/g, " ") || "Category";
            await pushCategory(name, browseUrl);
          }
        }

        if (categories.length > 0) break;
      }

      // Fall back to the mapped product grid if live children were empty.
      if (categories.length === 0 && seedGrids.length > 0) {
        for (const seed of seedGrids) {
          await pushCategory(seed.name, seed.url);
        }
      }

      logger?.success(
        "catalogue",
        `Found ${categories.length} categories in ${parent.name}`,
      );
      result[parent.id] = categories;
    }

    return result;
  } finally {
    await browser.close();
  }
}

/** @deprecated Use discoverOptionSubcategories */
export async function discoverBrandSubcategories(input: {
  config: SupplierScraperConfig;
  credentials: SupplierCredentials;
  brandIds: string[];
  logger?: SupplierScraperLogger;
}): Promise<Record<string, SupplierBrowseOption[]>> {
  return discoverOptionSubcategories({
    config: input.config,
    credentials: input.credentials,
    mode: "brand",
    optionIds: input.brandIds,
    logger: input.logger,
  });
}

export async function runSupplierScraper(
  input: RunSupplierScraperInput,
): Promise<SupplierScrapedProduct[]> {
  const logger = input.logger;
  logger?.step("run", "Starting supplier scrape run", {
    mode: input.mode,
    optionIds: input.optionIds,
    scrapeTargets: input.scrapeTargets?.length ?? 0,
    maxProductsPerTarget: input.maxProducts ?? null,
  });

  const baseUrl = await assertSafeSupplierUrl(input.config.baseUrl);
  const allowedHostname = baseUrl.hostname;
  const options =
    input.mode === "brand"
      ? input.config.brandOptions
      : input.config.categoryOptions;

  const selectedOptions: SupplierScrapeTarget[] =
    input.scrapeTargets && input.scrapeTargets.length > 0
      ? input.scrapeTargets
      : options
          .filter(
            (option) =>
              input.optionIds.length === 0 || input.optionIds.includes(option.id),
          )
          .map((option) => ({
            id: option.id,
            name: option.name,
            url: option.url,
            parentId: option.parentId ?? null,
          }));

  if (selectedOptions.length === 0) {
    throw new Error(`Choose at least one ${input.mode}.`);
  }

  const browser = await launchSupplierBrowser(logger);
  try {
    const page = await prepareSupplierPage(browser);
    await loginToSupplier(
      page,
      input.config.loginUrl,
      allowedHostname,
      input.credentials,
      input.config.loginSelectors,
      logger,
    );

    const productUrls = new Map<string, string>();
    // maxProducts applies per brand/category target, not across all brands.
    const perTargetLimit = input.maxProducts ?? null;

    const targetConcurrency = Math.min(
      SUPPLIER_TARGET_CONCURRENCY,
      selectedOptions.length,
    );
    const discoveryConcurrency = discoveryConcurrencyForTargets(targetConcurrency);

    await mapPool(selectedOptions, targetConcurrency, async (option) => {
      logger?.step("run", `Browsing ${input.mode}`, {
        option: option.name,
        url: option.url,
        maxProducts: perTargetLimit ?? "all",
      });
      const targetPage = await prepareSupplierPage(browser);
      try {
        const links = await discoverProductLinksForOption(
          browser,
          targetPage,
          option.url,
          input.config,
          allowedHostname,
          perTargetLimit,
          logger,
          undefined,
          discoveryConcurrency,
        );
        for (const link of links) {
          if (!productUrls.has(link)) productUrls.set(link, option.url);
        }
      } finally {
        await targetPage.close().catch(() => undefined);
      }
    });

    if (productUrls.size === 0) {
      throw new Error(
        "The saved scraper could not find any products. The supplier website may have changed.",
      );
    }

    await input.onScrapeStarted?.(productUrls.size);

    const PRODUCT_CONCURRENCY = SUPPLIER_PRODUCT_CONCURRENCY;
    const entries = [...productUrls.entries()];
    const products: SupplierScrapedProduct[] = [];
    let completed = 0;

    logger?.step("run", `Scraping ${entries.length} products`, {
      concurrency: PRODUCT_CONCURRENCY,
    });

    const workerPages = [page];
    while (workerPages.length < Math.min(PRODUCT_CONCURRENCY, entries.length)) {
      workerPages.push(await prepareSupplierPage(browser));
    }

    for (let start = 0; start < entries.length; start += PRODUCT_CONCURRENCY) {
      const batch = entries.slice(start, start + PRODUCT_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async ([productUrl, categoryUrl], batchIndex) => {
          const worker = workerPages[batchIndex] ?? page;
          const productIndex = start + batchIndex + 1;
          logger?.step(
            "run",
            `Scraping product ${productIndex} of ${entries.length}`,
          );
          return scrapeProductPage(
            worker,
            productUrl,
            categoryUrl,
            input.config.productSelectors,
            allowedHostname,
            logger,
          );
        }),
      );

      for (const product of batchResults) {
        if (!product) continue;
        products.push(product);
        completed += 1;
        await input.onProductScraped?.(product, {
          index: completed,
          total: productUrls.size,
        });
      }
    }

    for (const worker of workerPages) {
      if (worker !== page) await worker.close().catch(() => undefined);
    }

    logger?.success("run", "Supplier scrape run complete", {
      products: products.length,
    });
    return products;
  } finally {
    logger?.detail("browser", "Closing browser");
    await browser.close();
  }
}

export interface SupplierProductUrlEntry {
  url: string;
  categoryUrl: string;
  discoveredVia?: string[];
  evidence?: Record<string, unknown>;
}

export interface SupplierProductScrapeFailure {
  entry: SupplierProductUrlEntry;
  error: string;
}

export interface SupplierProductScrapeBatchResult {
  products: SupplierScrapedProduct[];
  succeededEntries: Array<{
    entry: SupplierProductUrlEntry;
    product: SupplierScrapedProduct;
  }>;
  failedEntries: SupplierProductScrapeFailure[];
}

export type CollectUrlsProgress = {
  stage:
    | "launch"
    | "login"
    | "sitemap"
    | "export"
    | "target_start"
    | "pagination"
    | "target_done"
    | "network"
    | "product"
    | "done";
  message: string;
  urlsFound: number;
  productsScraped?: number;
  targetIndex?: number;
  targetTotal?: number;
  targetName?: string;
  pageIndex?: number;
  pagesVisited?: number;
  addedThisPage?: number;
  /** Newest product URLs found in this batch (for live UI). */
  sampleUrls?: string[];
  lastProduct?: string;
};

/**
 * Collect product URLs for a slice of browse targets (one browser session).
 * Uses universal multi-strategy discovery + optional sitemap seed.
 * Newly found browse/category links are returned for the durable queue to process later.
 *
 * When `streamProducts` is true, each found product URL is scraped and passed to
 * `onStreamedProduct` immediately (one at a time) so callers can upsert live.
 */
export async function collectSupplierProductUrls(input: {
  config: SupplierScraperConfig;
  credentials: SupplierCredentials;
  targets: SupplierScrapeTarget[];
  maxProductsPerTarget?: number | null;
  includeSitemap?: boolean;
  expandBrowseLinks?: boolean;
  logger?: SupplierScraperLogger;
  /** Fired during collection so durable crawls can flush live progress/logs. */
  onProgress?: (progress: CollectUrlsProgress) => Promise<void> | void;
  /** Scrape + emit each product as soon as its URL is found. */
  streamProducts?: boolean;
  onStreamedProduct?: (
    product: SupplierScrapedProduct,
    progress: { scraped: number; urlsFound: number },
  ) => Promise<void> | void;
}): Promise<{
  entries: SupplierProductUrlEntry[];
  newBrowseTargets: SupplierScrapeTarget[];
  discoveryEvidence: SupplierDiscoveryEvidence[];
  streamedProducts: SupplierScrapedProduct[];
}> {
  const logger = input.logger;
  if (input.targets.length === 0 && input.includeSitemap === false) {
    return {
      entries: [],
      newBrowseTargets: [],
      discoveryEvidence: [],
      streamedProducts: [],
    };
  }

  const baseUrl = await assertSafeSupplierUrl(input.config.baseUrl);
  const allowedHostname = baseUrl.hostname;
  const found: SupplierProductUrlEntry[] = [];
  const seen = new Set<string>();
  const streamedProducts: SupplierScrapedProduct[] = [];
  const streamedUrls = new Set<string>();
  const discoveryEvidence: SupplierDiscoveryEvidence[] = [];
  const recentSamples: string[] = [];
  const catalogueUrl = input.config.catalogueUrl || baseUrl.toString();
  const streamProducts = Boolean(input.streamProducts && input.onStreamedProduct);
  let scrapePage: Page | null = null;
  let browser: Browser | null = null;
  const collectStartedAt = Date.now();
  /** Keep streamed collect chunks under the advance route maxDuration. */
  const STREAM_PRODUCT_BUDGET = 40;
  const STREAM_TIME_BUDGET_MS = 180_000;
  let streamBudgetExhausted = false;

  const sampleSnapshot = () => recentSamples.slice(-25);

  const rememberSamples = (urls: string[]) => {
    for (const url of urls) recentSamples.push(url);
    while (recentSamples.length > 40) recentSamples.shift();
  };

  const logFreshUrls = (fresh: string[], via: string) => {
    if (fresh.length === 0) return;
    rememberSamples(fresh);
    const preview = fresh.slice(0, 4);
    logger?.detail(
      "urls",
      `+${fresh.length} via ${via}: ${preview.join(" · ")}${
        fresh.length > 4 ? ` (+${fresh.length - 4} more)` : ""
      }`,
    );
  };

  const addUrls = (
    urls: string[],
    categoryUrl: string,
    via: string,
  ): string[] => {
    const fresh: string[] = [];
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      found.push({
        url,
        categoryUrl,
        discoveredVia: [via],
        evidence: { source: via },
      });
      fresh.push(url);
    }
    logFreshUrls(fresh, via);
    return fresh;
  };

  /** Register URLs, and when streaming: scrape + emit one product at a time. */
  const intakeUrls = async (
    urls: string[],
    categoryUrl: string,
    via: string,
  ): Promise<{ fresh: string[]; stop: boolean }> => {
    const fresh = addUrls(urls, categoryUrl, via);
    if (!streamProducts || fresh.length === 0) {
      return { fresh, stop: streamBudgetExhausted };
    }

    for (const url of fresh) {
      if (streamedUrls.has(url)) continue;

      if (
        streamedProducts.length >= STREAM_PRODUCT_BUDGET ||
        Date.now() - collectStartedAt >= STREAM_TIME_BUDGET_MS
      ) {
        if (!streamBudgetExhausted) {
          streamBudgetExhausted = true;
          const timedOut =
            Date.now() - collectStartedAt >= STREAM_TIME_BUDGET_MS;
          logger?.warn(
            "catalogue",
            timedOut
              ? `Stream time budget reached (${streamedProducts.length} saved) — finishing this chunk`
              : `Live-save budget reached (${streamedProducts.length} saved) — still collecting URLs for scrape phase`,
          );
          await report({
            stage: "product",
            message: timedOut
              ? `Saved ${streamedProducts.length} products · finishing chunk`
              : `Saved ${streamedProducts.length} products live · collecting remaining URLs`,
            urlsFound: found.length,
            productsScraped: streamedProducts.length,
          });
        }
        // Only abort further page walking on time budget so chunks stay under maxDuration.
        if (Date.now() - collectStartedAt >= STREAM_TIME_BUDGET_MS) {
          return { fresh, stop: true };
        }
        continue;
      }

      streamedUrls.add(url);
      if (!scrapePage) {
        if (!browser) {
          throw new Error("Browser not ready for streamed product scrape");
        }
        scrapePage = await prepareSupplierPage(browser);
      }
      const product = await scrapeProductPage(
        scrapePage,
        url,
        categoryUrl,
        input.config.productSelectors,
        allowedHostname,
        logger,
      );
      if (!product) {
        logger?.warn("product", "Stream scrape returned no product", { url });
        continue;
      }
      streamedProducts.push(product);
      await report({
        stage: "product",
        message: `Saved ${streamedProducts.length}: ${product.name}`,
        urlsFound: found.length,
        productsScraped: streamedProducts.length,
        lastProduct: product.name,
        sampleUrls: [url],
      });
      await input.onStreamedProduct?.(product, {
        scraped: streamedProducts.length,
        urlsFound: found.length,
      });
    }
    return { fresh, stop: streamBudgetExhausted };
  };

  const report = async (
    progress: Omit<CollectUrlsProgress, "sampleUrls"> & {
      sampleUrls?: string[];
    },
  ) => {
    await input.onProgress?.({
      ...progress,
      sampleUrls: progress.sampleUrls ?? sampleSnapshot(),
      productsScraped: progress.productsScraped ?? streamedProducts.length,
    });
  };

  await report({
    stage: "launch",
    message: `Launching browser for URL collection (${input.targets.length} targets)`,
    urlsFound: 0,
    targetTotal: input.targets.length,
  });

  browser = await launchSupplierBrowser(logger);
  try {
    const page = await prepareSupplierPage(browser);
    await report({
      stage: "login",
      message: "Logging in before URL collection",
      urlsFound: 0,
      targetTotal: input.targets.length,
    });
    await loginToSupplier(
      page,
      input.config.loginUrl,
      allowedHostname,
      input.credentials,
      input.config.loginSelectors,
      logger,
    );
    const networkObserver = observeProductNetwork(page, logger);

    const perTargetLimit = input.maxProductsPerTarget ?? null;
    const knownTargetUrls = new Set(
      input.targets.map((target) => target.url.replace(/\/$/, "").toLowerCase()),
    );
    const newBrowseTargets: SupplierScrapeTarget[] = [];

    const withTimeout = async <T>(
      label: string,
      ms: number,
      work: Promise<T>,
      fallback: T,
    ): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          work,
          new Promise<T>((resolve) => {
            timer = setTimeout(() => {
              logger?.warn("catalogue", `${label} timed out after ${ms}ms`);
              resolve(fallback);
            }, ms);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    if (input.includeSitemap !== false) {
      await report({
        stage: "sitemap",
        message: "Scanning sitemap for product URLs",
        urlsFound: found.length,
        targetTotal: input.targets.length,
      });
      const sitemap = await withTimeout(
        "Sitemap scan",
        45_000,
        discoverProductsFromSitemap(baseUrl.origin, allowedHostname, logger),
        { urls: [] as string[], evidence: [] as SupplierDiscoveryEvidence[] },
      );
      discoveryEvidence.push(...sitemap.evidence);
      const sitemapIntake = await intakeUrls(
        sitemap.urls,
        catalogueUrl,
        "sitemap",
      );
      const sitemapFresh = sitemapIntake.fresh;
      await report({
        stage: "sitemap",
        message: `Sitemap done (+${sitemapFresh.length}, ${found.length} unique)`,
        urlsFound: found.length,
        targetTotal: input.targets.length,
        sampleUrls: sitemapFresh.slice(0, 25),
      });

      await report({
        stage: "export",
        message: "Looking for product export / download links",
        urlsFound: found.length,
        targetTotal: input.targets.length,
      });
      const exported = await withTimeout(
        "Export scan",
        30_000,
        discoverProductExports(page, allowedHostname, logger),
        { urls: [] as string[], evidence: [] as SupplierDiscoveryEvidence[] },
      );
      discoveryEvidence.push(...exported.evidence);
      const exportIntake = await intakeUrls(
        exported.urls,
        catalogueUrl,
        "export",
      );
      const exportFresh = exportIntake.fresh;
      await report({
        stage: "export",
        message: `Export scan done (+${exportFresh.length}, ${found.length} unique)`,
        urlsFound: found.length,
        targetTotal: input.targets.length,
        sampleUrls: exportFresh.slice(0, 25),
      });
    }

    const targetConcurrency = streamProducts
      ? 1
      : Math.min(
          SUPPLIER_TARGET_CONCURRENCY,
          Math.max(input.targets.length, 1),
        );
    const discoveryConcurrency = streamProducts
      ? 1
      : discoveryConcurrencyForTargets(targetConcurrency);

    for (
      let targetStart = 0;
      targetStart < input.targets.length;
      targetStart += targetConcurrency
    ) {
      const targetBatch = input.targets.slice(
        targetStart,
        targetStart + targetConcurrency,
      );

      await Promise.all(
        targetBatch.map(async (target, batchIndex) => {
          const targetIndex = targetStart + batchIndex;
          logger?.step("catalogue", `Collecting URLs for ${target.name}`, {
            url: target.url,
            targetIndex: targetIndex + 1,
            targetTotal: input.targets.length,
          });
          await report({
            stage: "target_start",
            message: `Collecting ${targetIndex + 1}/${input.targets.length}: ${target.name}`,
            urlsFound: found.length,
            targetIndex: targetIndex + 1,
            targetTotal: input.targets.length,
            targetName: target.name,
          });
          const beforeTarget = found.length;
          const targetPage = await prepareSupplierPage(browser);
          try {
            const links = await discoverProductLinksForOption(
              browser,
              targetPage,
              target.url,
              input.config,
              allowedHostname,
              perTargetLimit,
              logger,
              async (pageInfo) => {
                await report({
                  stage: "pagination",
                  message: `${target.name}: page ${pageInfo.pageIndex} (+${pageInfo.added}, ${pageInfo.urlsFound} from target)`,
                  urlsFound: found.length,
                  productsScraped: streamedProducts.length,
                  targetIndex: targetIndex + 1,
                  targetTotal: input.targets.length,
                  targetName: target.name,
                  pageIndex: pageInfo.pageIndex,
                  pagesVisited: pageInfo.pagesVisited,
                  addedThisPage: pageInfo.added,
                  sampleUrls: pageInfo.sampleUrls ?? sampleSnapshot(),
                });
              },
              discoveryConcurrency,
              streamProducts
                ? async (urls) => {
                    const intake = await intakeUrls(urls, target.url, "page");
                    return { stop: intake.stop };
                  }
                : undefined,
            );
            const pageIntake = await intakeUrls(links, target.url, "page");
            const pageFresh = pageIntake.fresh;

            if (input.expandBrowseLinks !== false) {
              const browseLinks = await collectBrowseLinksUniversal(
                targetPage,
                allowedHostname,
              );
              for (const browseUrl of browseLinks) {
                const key = browseUrl.replace(/\/$/, "").toLowerCase();
                if (knownTargetUrls.has(key)) continue;
                knownTargetUrls.add(key);
                newBrowseTargets.push({
                  id: `auto-${knownTargetUrls.size}`,
                  name: browseUrl.replace(/^https?:\/\//i, "").slice(0, 80),
                  url: browseUrl,
                });
              }
            }

            const addedFromTarget = found.length - beforeTarget;
            logger?.detail("catalogue", `Finished ${target.name}`, {
              added: addedFromTarget,
              uniqueTotal: found.length,
              newBrowseTargets: newBrowseTargets.length,
            });
            await report({
              stage: "target_done",
              message: `Finished ${targetIndex + 1}/${input.targets.length}: ${target.name} (+${addedFromTarget}, ${found.length} unique${
                streamProducts ? `, ${streamedProducts.length} saved` : ""
              })`,
              urlsFound: found.length,
              productsScraped: streamedProducts.length,
              targetIndex: targetIndex + 1,
              targetTotal: input.targets.length,
              targetName: target.name,
              sampleUrls: pageFresh.slice(0, 25),
            });
          } finally {
            await targetPage.close().catch(() => undefined);
          }
        }),
      );
    }

    await report({
      stage: "network",
      message: "Enumerating observed product APIs",
      urlsFound: found.length,
      targetTotal: input.targets.length,
    });
    const network = await networkObserver.flush();
    networkObserver.stop();
    const enumeratedNetworkEvidence: SupplierDiscoveryEvidence[] = [];
    for (const item of network.evidence) {
      enumeratedNetworkEvidence.push(
        await enumerateObservedApiSource(
          page,
          item,
          allowedHostname,
          logger,
        ),
      );
    }
    discoveryEvidence.push(...enumeratedNetworkEvidence);
    const networkUrls = new Set(network.urls);
    for (const item of enumeratedNetworkEvidence) {
      for (const url of item.productUrls) networkUrls.add(url);
    }
    const networkIntake = await intakeUrls(
      [...networkUrls],
      catalogueUrl,
      "api",
    );
    const networkFresh = networkIntake.fresh;

    logger?.success("catalogue", "URL collection batch complete", {
      products: found.length,
      streamed: streamedProducts.length,
      newBrowseTargets: newBrowseTargets.length,
      evidence: discoveryEvidence.length,
    });
    await report({
      stage: "done",
      message: streamProducts
        ? `URL batch complete (${found.length} URLs, ${streamedProducts.length} products saved)`
        : `URL batch complete (${found.length} unique URLs)`,
      urlsFound: found.length,
      productsScraped: streamedProducts.length,
      targetTotal: input.targets.length,
      sampleUrls: networkFresh.length > 0 ? networkFresh.slice(0, 25) : sampleSnapshot(),
    });
    return {
      entries: found,
      newBrowseTargets,
      discoveryEvidence,
      streamedProducts,
    };
  } finally {
    if (scrapePage) {
      await scrapePage.close().catch(() => undefined);
    }
    logger?.detail("browser", "Closing browser");
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Scrape a specific list of product URLs (one browser session).
 */
export async function scrapeSupplierProductUrls(input: {
  config: SupplierScraperConfig;
  credentials: SupplierCredentials;
  entries: SupplierProductUrlEntry[];
  logger?: SupplierScraperLogger;
  onProductScraped?: (
    product: SupplierScrapedProduct,
    progress: { index: number; total: number },
  ) => void | Promise<void>;
}): Promise<SupplierProductScrapeBatchResult> {
  const logger = input.logger;
  if (input.entries.length === 0) {
    return { products: [], succeededEntries: [], failedEntries: [] };
  }

  const baseUrl = await assertSafeSupplierUrl(input.config.baseUrl);
  const allowedHostname = baseUrl.hostname;
  const browser = await launchSupplierBrowser(logger);
  try {
    const page = await prepareSupplierPage(browser);
    await loginToSupplier(
      page,
      input.config.loginUrl,
      allowedHostname,
      input.credentials,
      input.config.loginSelectors,
      logger,
    );

    const PRODUCT_CONCURRENCY = SUPPLIER_PRODUCT_CONCURRENCY;
    const products: SupplierScrapedProduct[] = [];
    const succeededEntries: SupplierProductScrapeBatchResult["succeededEntries"] =
      [];
    const failedEntries: SupplierProductScrapeFailure[] = [];
    let completed = 0;

    const workerPages = [page];
    while (
      workerPages.length < Math.min(PRODUCT_CONCURRENCY, input.entries.length)
    ) {
      workerPages.push(await prepareSupplierPage(browser));
    }

    for (let start = 0; start < input.entries.length; start += PRODUCT_CONCURRENCY) {
      const batch = input.entries.slice(start, start + PRODUCT_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (entry, batchIndex) => {
          const worker = workerPages[batchIndex] ?? page;
          try {
            const product = await scrapeProductPage(
              worker,
              entry.url,
              entry.categoryUrl,
              input.config.productSelectors,
              allowedHostname,
              logger,
              true,
            );
            if (!product) {
              return {
                entry,
                product: null,
                error: "Product page did not contain a usable product title",
              };
            }
            return { entry, product, error: null };
          } catch (error) {
            return {
              entry,
              product: null,
              error:
                error instanceof Error
                  ? error.message
                  : "Product page scrape failed",
            };
          }
        }),
      );

      for (const result of batchResults) {
        if (!result.product) {
          failedEntries.push({
            entry: result.entry,
            error: result.error || "Product page scrape failed",
          });
          continue;
        }
        products.push(result.product);
        succeededEntries.push({
          entry: result.entry,
          product: result.product,
        });
        completed += 1;
        await input.onProductScraped?.(result.product, {
          index: completed,
          total: input.entries.length,
        });
      }
    }

    for (const worker of workerPages) {
      if (worker !== page) await worker.close().catch(() => undefined);
    }

    return { products, succeededEntries, failedEntries };
  } finally {
    logger?.detail("browser", "Closing browser");
    await browser.close();
  }
}

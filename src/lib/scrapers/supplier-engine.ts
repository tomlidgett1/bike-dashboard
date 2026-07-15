import { createHash } from "node:crypto";
import type { Page } from "puppeteer-core";
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
  let rawLinks: string[] = [];
  try {
    rawLinks = await page.$$eval(selector, (elements) =>
      elements
        .map((element) => {
          const anchor =
            element instanceof HTMLAnchorElement
              ? element
              : (element.closest("a[href]") as HTMLAnchorElement | null);
          return anchor?.href ?? "";
        })
        .filter(Boolean),
    );
  } catch {
    rawLinks = [];
  }

  if (rawLinks.length === 0) {
    rawLinks = await page.$$eval("a[href]", (elements) =>
      elements
        .map((element) => (element as HTMLAnchorElement).href)
        .filter((href) => /\/(product|products|item|sku)\b/i.test(href)),
    );
  }

  const links = await Promise.all(
    rawLinks.map(async (link) => {
      try {
        return (await assertSafeSupplierUrl(link, allowedHostname)).toString();
      } catch {
        return null;
      }
    }),
  );
  const uniqueLinks = [...new Set(links.filter((link): link is string => Boolean(link)))];
  logger?.detail("catalogue", `Found ${uniqueLinks.length} product links`, {
    selector,
    sample: uniqueLinks.slice(0, 3),
  });
  return uniqueLinks;
}

async function loadAllLazyImages(page: Page): Promise<void> {
  await evaluateSupplierRuntime(page, "loadLazyImages");
  await page.waitForNetworkIdle({ idleTime: 250, timeout: 1_500 }).catch(() => undefined);
}

async function extractProductPage(
  page: Page,
  selectors: SupplierProductSelectors,
): Promise<RawProductPage> {
  await loadAllLazyImages(page);
  return evaluateSupplierRuntime<RawProductPage>(page, "extractSupplierProduct", selectors);
}

async function scrapeProductPage(
  page: Page,
  url: string,
  categoryUrl: string,
  selectors: SupplierProductSelectors,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<SupplierScrapedProduct | null> {
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
}

async function resolveNextCataloguePage(
  page: Page,
  nextPageSelector: string | null,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<string | null> {
  const selectors = [
    nextPageSelector,
    'a[rel="next"]',
    "a.next.page-numbers",
    "a.page-numbers.next",
    ".woocommerce-pagination a.next",
    "li.next a",
    ".pagination a.next",
    'a[aria-label*="Next" i]',
    'a[title*="Next" i]',
    ".nav-links a.next",
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const selector of selectors) {
    try {
      const nextUrl = await page.$eval(selector, (element) => {
        const anchor =
          element instanceof HTMLAnchorElement
            ? element
            : (element.closest("a[href]") as HTMLAnchorElement | null);
        if (!anchor?.href) return null;
        if (anchor.classList.contains("disabled")) return null;
        if (anchor.getAttribute("aria-disabled") === "true") return null;
        return anchor.href;
      });
      if (!nextUrl) continue;
      const safeUrl = (await assertSafeSupplierUrl(nextUrl, allowedHostname)).toString();
      if (safeUrl === page.url()) continue;
      logger?.detail("catalogue", "Following next page", { pageUrl: safeUrl, selector });
      return safeUrl;
    } catch {
      // Try the next pagination selector.
    }
  }

  return null;
}

async function discoverProductLinksForOption(
  page: Page,
  optionUrl: string,
  config: SupplierScraperConfig,
  allowedHostname: string,
  limit: number | null,
  logger?: SupplierScraperLogger,
): Promise<string[]> {
  const discovered = new Set<string>();
  const visitedPages = new Set<string>();
  let pageUrl: string | null = optionUrl;
  logger?.step("catalogue", "Discovering products", {
    optionUrl,
    limit: limit ?? "all",
  });

  for (let pageIndex = 0; pageIndex < 100 && pageUrl; pageIndex += 1) {
    if (visitedPages.has(pageUrl)) break;
    visitedPages.add(pageUrl);
    await navigateSupplierPage(page, pageUrl, allowedHostname, logger);

    const links = await collectProductLinks(
      page,
      config.productLinkSelector,
      allowedHostname,
      logger,
    );
    const before = discovered.size;
    for (const link of links) {
      discovered.add(link);
      if (limit && discovered.size >= limit) {
        logger?.success("catalogue", "Product discovery complete", {
          optionUrl,
          products: discovered.size,
          pages: visitedPages.size,
          stoppedAt: "maxProducts",
        });
        return [...discovered];
      }
    }

    logger?.detail("catalogue", `Page ${pageIndex + 1} added ${discovered.size - before} products`, {
      pageUrl,
      total: discovered.size,
    });

    pageUrl = await resolveNextCataloguePage(
      page,
      config.nextPageSelector,
      allowedHostname,
      logger,
    );
  }

  logger?.success("catalogue", "Product discovery complete", {
    optionUrl,
    products: discovered.size,
    pages: visitedPages.size,
  });
  return [...discovered];
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
    const catalogueUrl = await assertSafeSupplierUrl(
      catalogueAnalysis.catalogueUrl,
      allowedHostname,
    );
    if (page.url() !== catalogueUrl.toString()) {
      await navigateSupplierPage(page, catalogueUrl.toString(), allowedHostname, logger);
    }

    const brandOptions = await safeOptions(catalogueAnalysis.brandOptions, allowedHostname);
    let categoryOptions = await safeOptions(catalogueAnalysis.categoryOptions, allowedHostname);
    let productLinks = await collectProductLinks(
      page,
      catalogueAnalysis.productLinkSelector,
      allowedHostname,
      logger,
    );

    const firstOption = brandOptions[0] ?? categoryOptions[0] ?? null;
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
      productLinkSelector: catalogueAnalysis.productLinkSelector,
      nextPageSelector: catalogueAnalysis.nextPageSelector,
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
  const browser = await launchSupplierBrowser(logger);
  const result: Record<string, SupplierBrowseOption[]> = {};

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
      logger?.step("catalogue", `Finding categories within ${parent.name}`, {
        url: parent.url,
        mode: input.mode,
      });
      await navigateSupplierPage(page, parent.url, allowedHostname, logger);
      const links = await evaluateSupplierRuntime<
        Array<{ name: string; url: string }>
      >(page, "collectBrandSubcategoryLinks", {
        brandName: parent.name,
        brandUrl: parent.url,
      });

      const categories: SupplierBrowseOption[] = [];
      const seen = new Set<string>();
      for (const link of links) {
        try {
          const safeUrl = (
            await assertSafeSupplierUrl(link.url, allowedHostname)
          ).toString();
          if (seen.has(safeUrl) || safeUrl === parent.url) continue;
          seen.add(safeUrl);
          categories.push({
            id: createHash("sha1")
              .update(`${parent.id}:${safeUrl}`)
              .digest("hex")
              .slice(0, 16),
            kind: "subcategory",
            name: link.name || "Category",
            url: safeUrl,
            imageUrl: null,
            parentId: parent.id,
          });
        } catch {
          // Ignore unsafe links.
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

    for (const option of selectedOptions) {
      logger?.step("run", `Browsing ${input.mode}`, {
        option: option.name,
        url: option.url,
        maxProducts: perTargetLimit ?? "all",
      });
      const links = await discoverProductLinksForOption(
        page,
        option.url,
        input.config,
        allowedHostname,
        perTargetLimit,
        logger,
      );
      for (const link of links) {
        if (!productUrls.has(link)) productUrls.set(link, option.url);
      }
    }

    if (productUrls.size === 0) {
      throw new Error(
        "The saved scraper could not find any products. The supplier website may have changed.",
      );
    }

    await input.onScrapeStarted?.(productUrls.size);

    const PRODUCT_CONCURRENCY = 3;
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

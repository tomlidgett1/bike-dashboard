import type { HTTPResponse, Page } from "puppeteer-core";
import { assertSafeSupplierUrl } from "@/lib/scrapers/supplier-security";
import type { SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";

/**
 * Universal product-URL heuristics for B2B catalogues.
 * Site-specific paths are boosts inside a shared scorer, not separate scrapers.
 */
const PRODUCT_PATH_RE =
  /\/(product|products|item|sku|p|pd|prod|catalogue-item|catalog-item)\b/i;
const PRODUCT_QUERY_RE = /[?&](product[_-]?id|pid|sku|item[_-]?id)=/i;
const FE_STYLE_PRODUCT_RE = /\/Shop\/p_\d+/i;
const FE_STYLE_LISTING_RE =
  /\/Shop\/(?:c_\d+(?:_\d+)?\/Products(?:\/|$)|c_\d+\/[^/]+\/page\/\d+)/i;
const NON_PRODUCT_PATH_RE =
  /\/(cart|checkout|login|logout|account|my-account|wishlist|compare|search|brand|category|product-category|collection|collections|shop|products|catalog|catalogue|tags?|page|wp-|customer|dealer|contact|about|legal|policy|privacy|terms|help|faq|blog|news|returns?|warrant(?:y|ies))(\/|$)/i;

export interface SupplierDiscoveryEvidence {
  sourceType: "page" | "sitemap" | "api" | "graphql" | "feed" | "export";
  scope: "catalogue" | "target";
  endpointUrl: string;
  requestMethod: string;
  requestTemplate: Record<string, unknown>;
  total: number | null;
  isAuthoritative: boolean;
  confidence: number;
  productUrls: string[];
}

export interface SupplierDiscoveryResult {
  urls: string[];
  evidence: SupplierDiscoveryEvidence[];
}

export function scoreProductUrl(url: string): number {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    let score = 0;

    // FE Sports product detail pages: /Shop/p_20542/Name
    if (FE_STYLE_PRODUCT_RE.test(path)) score += 10;

    // FE Sports brand/category listing hubs are not products.
    if (FE_STYLE_LISTING_RE.test(path) || /\/Shop\/c_\d+(?:_\d+)?\/Products\b/i.test(path)) {
      score -= 12;
    }
    if (/\/Returns_and_Warranties\b/i.test(path)) score -= 12;
    if (/#$/.test(url) || /\/page\/\d+\/?#?$/i.test(path)) score -= 8;

    if (PRODUCT_PATH_RE.test(path) && !/\/Shop\//i.test(path)) score += 6;
    if (PRODUCT_QUERY_RE.test(parsed.search)) score += 5;
    if (/\/p_\d+/i.test(path)) score += 6;
    if (/\/\d{4,}(?:\/|$)/.test(path) && !NON_PRODUCT_PATH_RE.test(path)) {
      score += 2;
    }

    // Penalties for browse/account surfaces
    if (NON_PRODUCT_PATH_RE.test(path) && !FE_STYLE_PRODUCT_RE.test(path)) {
      // /products/ archive is not a product detail page
      if (/\/products?\/?$/i.test(path) || /\/shop\/?$/i.test(path)) {
        score -= 8;
      } else if (!PRODUCT_PATH_RE.test(path)) {
        score -= 6;
      }
    }
    if (path.split("/").filter(Boolean).length <= 1) score -= 3;

    return score;
  } catch {
    return -10;
  }
}

export function looksLikeProductUrl(url: string): boolean {
  return scoreProductUrl(url) >= 5;
}

export function looksLikeBrowseUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    if (looksLikeProductUrl(url)) return false;
    return (
      /\/(brand|product-category|category|collection|collections|shop|products|catalog|catalogue|Shop\/c_)\b/i.test(
        path,
      ) || /\/Shop\/C_/i.test(path)
    );
  } catch {
    return false;
  }
}

function normalisePotentialUrl(value: string, baseUrl: string): string | null {
  if (!value || value.length > 2_000) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function redactRequestBody(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const redact = (value: unknown, depth = 0): unknown => {
      if (depth > 6) return "[truncated]";
      if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
      if (!value || typeof value !== "object") return value;
      const output: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        output[key] = /password|secret|token|authorization|cookie/i.test(key)
          ? "[redacted]"
          : redact(child, depth + 1);
      }
      return output;
    };
    return { body: redact(parsed) };
  } catch {
    const params = new URLSearchParams(raw);
    const output: Record<string, string> = {};
    for (const [key, value] of params) {
      output[key] = /password|secret|token|authorization|cookie/i.test(key)
        ? "[redacted]"
        : value;
    }
    return Object.keys(output).length > 0 ? { body: output } : {};
  }
}

function inspectJsonPayload(
  value: unknown,
  baseUrl: string,
): { productUrls: string[]; total: number | null; collectionSize: number } {
  const urls = new Set<string>();
  const totals: number[] = [];
  let largestCollection = 0;
  const visited = new Set<object>();

  const visit = (node: unknown, depth: number) => {
    if (depth > 10 || node == null) return;
    if (typeof node === "string") {
      const candidate = normalisePotentialUrl(node, baseUrl);
      if (candidate && looksLikeProductUrl(candidate)) urls.add(candidate);
      return;
    }
    if (typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      largestCollection = Math.max(largestCollection, node.length);
      for (const item of node.slice(0, 100_000)) visit(item, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    const hasCollection = Object.entries(record).some(
      ([key, child]) =>
        /products?|items?|results?|edges|nodes|records|entries/i.test(key) &&
        Array.isArray(child),
    );
    for (const [key, child] of Object.entries(record)) {
      if (
        hasCollection &&
        /^(total|total_count|totalCount|count|numFound|recordCount|totalResults)$/i.test(
          key,
        ) &&
        typeof child === "number" &&
        Number.isFinite(child) &&
        child >= 0
      ) {
        totals.push(Math.floor(child));
      }
      if (
        typeof child === "string" &&
        /^(url|link|href|permalink|product_url|productUrl)$/i.test(key)
      ) {
        const candidate = normalisePotentialUrl(child, baseUrl);
        if (candidate && looksLikeProductUrl(candidate)) urls.add(candidate);
      }
      visit(child, depth + 1);
    }
  };

  visit(value, 0);
  return {
    productUrls: [...urls],
    total: totals.length > 0 ? Math.max(...totals) : null,
    collectionSize: largestCollection,
  };
}

/**
 * Observe JSON XHR/fetch responses while catalogue pages load. This learns
 * internal REST/GraphQL sources, product URLs, and supplier-reported totals.
 */
export function observeProductNetwork(
  page: Page,
  logger?: SupplierScraperLogger,
): {
  flush: () => Promise<SupplierDiscoveryResult>;
  stop: () => void;
} {
  const pending = new Set<Promise<void>>();
  const evidence: SupplierDiscoveryEvidence[] = [];
  const urls = new Set<string>();

  const onResponse = (response: HTTPResponse) => {
    const request = response.request();
    if (!["xhr", "fetch"].includes(request.resourceType())) return;
    const contentType = response.headers()["content-type"] ?? "";
    if (!/json|graphql/i.test(contentType) && !/graphql|api/i.test(response.url())) {
      return;
    }

    const task = (async () => {
      try {
        const buffer = await response.buffer();
        if (buffer.byteLength > 8 * 1024 * 1024) return;
        const payload = JSON.parse(buffer.toString("utf8")) as unknown;
        const inspected = inspectJsonPayload(payload, response.url());
        if (inspected.productUrls.length === 0 && inspected.total == null) return;

        for (const url of inspected.productUrls) urls.add(url);
        const sourceType = /graphql/i.test(response.url())
          ? "graphql"
          : "api";
        evidence.push({
          sourceType,
          scope: "target",
          endpointUrl: response.url(),
          requestMethod: request.method(),
          requestTemplate: redactRequestBody(request.postData()),
          total: inspected.total,
          isAuthoritative:
            inspected.total != null &&
            inspected.total >= inspected.collectionSize,
          confidence: inspected.total != null ? 0.9 : 0.7,
          productUrls: inspected.productUrls,
        });
        logger?.detail("catalogue", "Observed product API response", {
          endpoint: response.url(),
          products: inspected.productUrls.length,
          total: inspected.total,
        });
      } catch {
        // Many APIs return streams or non-JSON despite their headers.
      }
    })().finally(() => pending.delete(task));
    pending.add(task);
  };

  page.on("response", onResponse);
  return {
    flush: async () => {
      await Promise.all([...pending]);
      return { urls: [...urls], evidence: [...evidence] };
    },
    stop: () => page.off("response", onResponse),
  };
}

/**
 * Replay a learned GET JSON endpoint with common pagination parameters.
 * POST/GraphQL sources are retained as evidence but are not guessed blindly;
 * they therefore keep coverage unverified unless the observed response itself
 * reconciles to its reported total.
 */
export async function enumerateObservedApiSource(
  page: Page,
  evidence: SupplierDiscoveryEvidence,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<SupplierDiscoveryEvidence> {
  if (evidence.total == null) {
    return evidence;
  }

  let endpoint: URL;
  try {
    endpoint = await assertSafeSupplierUrl(evidence.endpointUrl, allowedHostname);
  } catch {
    return evidence;
  }

  if (evidence.requestMethod !== "GET") {
    const rawBody = evidence.requestTemplate?.body;
    if (!rawBody || typeof rawBody !== "object") return evidence;

    let body = structuredClone(rawBody) as Record<string, unknown>;
    const observed = new Set(evidence.productUrls);

    const findEndCursor = (value: unknown, depth = 0): string | null => {
      if (depth > 10 || !value || typeof value !== "object") return null;
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = findEndCursor(item, depth + 1);
          if (found) return found;
        }
        return null;
      }
      const record = value as Record<string, unknown>;
      if (
        typeof record.endCursor === "string" &&
        record.endCursor.length > 0
      ) {
        return record.endCursor;
      }
      for (const child of Object.values(record)) {
        const found = findEndCursor(child, depth + 1);
        if (found) return found;
      }
      return null;
    };

    const advanceBody = (
      value: unknown,
      endCursor: string | null,
      depth = 0,
    ): boolean => {
      if (depth > 10 || !value || typeof value !== "object") return false;
      if (Array.isArray(value)) {
        return value.some((item) => advanceBody(item, endCursor, depth + 1));
      }
      const record = value as Record<string, unknown>;
      for (const key of ["page", "paged", "pageNumber", "currentPage"]) {
        if (typeof record[key] === "number") {
          record[key] = Number(record[key]) + 1;
          return true;
        }
      }
      for (const key of ["offset", "skip", "start"]) {
        if (typeof record[key] === "number") {
          const increment =
            typeof record.limit === "number"
              ? Number(record.limit)
              : typeof record.first === "number"
                ? Number(record.first)
                : 50;
          record[key] = Number(record[key]) + increment;
          return true;
        }
      }
      if (endCursor) {
        for (const key of ["after", "cursor", "endCursor"]) {
          if (key in record) {
            record[key] = endCursor;
            return true;
          }
        }
      }
      for (const child of Object.values(record)) {
        if (advanceBody(child, endCursor, depth + 1)) return true;
      }
      return false;
    };

    for (let requestIndex = 0; requestIndex < 1000; requestIndex += 1) {
      try {
        const payload = await page.evaluate(
          async ({ url, requestBody }) => {
            const response = await fetch(url, {
              method: "POST",
              credentials: "include",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestBody),
            });
            if (!response.ok) return null;
            return response.json();
          },
          { url: endpoint.toString(), requestBody: body },
        );
        if (payload == null) break;

        const inspected = inspectJsonPayload(payload, endpoint.toString());
        const before = observed.size;
        for (const url of inspected.productUrls) observed.add(url);
        const added = observed.size - before;
        logger?.detail("catalogue", "Enumerated learned POST/GraphQL API", {
          endpoint: endpoint.toString(),
          added,
          found: observed.size,
          total: evidence.total,
        });
        if (observed.size >= evidence.total) break;

        const nextBody = structuredClone(body) as Record<string, unknown>;
        const advanced = advanceBody(nextBody, findEndCursor(payload));
        if (!advanced || (requestIndex > 0 && added === 0)) break;
        body = nextBody;
      } catch {
        break;
      }
    }

    const bodyText = JSON.stringify(evidence.requestTemplate);
    const looksCatalogueWide =
      !/"(category|brand|collection|filter|search)"\s*:/i.test(
        bodyText,
      );
    const reconciled = observed.size === evidence.total;
    return {
      ...evidence,
      scope: reconciled && looksCatalogueWide ? "catalogue" : evidence.scope,
      isAuthoritative:
        evidence.isAuthoritative && reconciled && looksCatalogueWide,
      productUrls: [...observed],
      confidence: reconciled
        ? Math.max(evidence.confidence, 0.98)
        : evidence.confidence,
    };
  }

  if (evidence.productUrls.length >= evidence.total) {
    const endpointText = endpoint.toString();
    const looksCatalogueWide =
      !/[?&](category|brand|collection|filter|tag|search|q)=/i.test(
        endpointText,
      ) &&
      !/\/(category|brand|collection|tag)\//i.test(endpoint.pathname);
    return {
      ...evidence,
      scope: looksCatalogueWide ? "catalogue" : evidence.scope,
      isAuthoritative: evidence.isAuthoritative && looksCatalogueWide,
      confidence: Math.max(evidence.confidence, 0.98),
    };
  }

  const pageKeys = ["page", "paged", "p", "pg", "currentPage", "pageNumber"];
  const offsetKeys = ["offset", "start", "skip"];
  const limitKeys = ["limit", "per_page", "perPage", "pageSize", "page_size"];
  const pageKey = pageKeys.find((key) => endpoint.searchParams.has(key)) ?? "page";
  const offsetKey = offsetKeys.find((key) => endpoint.searchParams.has(key)) ?? null;
  const limitKey = limitKeys.find((key) => endpoint.searchParams.has(key)) ?? null;
  const observed = new Set(evidence.productUrls);
  let pageNumber = Number(endpoint.searchParams.get(pageKey) || "1");
  let offset = offsetKey
    ? Number(endpoint.searchParams.get(offsetKey) || "0")
    : 0;
  let pageSize = limitKey
    ? Number(endpoint.searchParams.get(limitKey) || "0")
    : evidence.productUrls.length;
  if (!Number.isFinite(pageSize) || pageSize <= 0) pageSize = 50;

  for (let requestIndex = 0; requestIndex < 1000; requestIndex += 1) {
    const next = new URL(endpoint.toString());
    if (offsetKey) {
      offset += pageSize;
      next.searchParams.set(offsetKey, String(offset));
    } else {
      pageNumber += 1;
      next.searchParams.set(pageKey, String(pageNumber));
    }

    try {
      const payload = await page.evaluate(async (url) => {
        const response = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return null;
        return response.json();
      }, next.toString());
      if (payload == null) break;

      const inspected = inspectJsonPayload(payload, next.toString());
      const before = observed.size;
      for (const url of inspected.productUrls) observed.add(url);
      const added = observed.size - before;
      if (inspected.collectionSize > 0) pageSize = inspected.collectionSize;
      logger?.detail("catalogue", "Enumerated learned product API", {
        endpoint: next.toString(),
        added,
        found: observed.size,
        total: evidence.total,
      });
      if (added === 0 || observed.size >= evidence.total) break;
    } catch {
      break;
    }
  }

  const endpointText = endpoint.toString();
  const looksCatalogueWide =
    !/[?&](category|brand|collection|filter|tag|search|q)=/i.test(endpointText) &&
    !/\/(category|brand|collection|tag)\//i.test(endpoint.pathname);
  const reconciled = observed.size === evidence.total;
  return {
    ...evidence,
    scope: reconciled && looksCatalogueWide ? "catalogue" : evidence.scope,
    isAuthoritative:
      evidence.isAuthoritative && reconciled && looksCatalogueWide,
    productUrls: [...observed],
    confidence:
      reconciled
        ? Math.max(evidence.confidence, 0.98)
        : evidence.confidence,
  };
}

/** Read visible supplier totals such as "Showing 1–24 of 534 products". */
export async function readPageProductTotal(
  page: Page,
): Promise<SupplierDiscoveryEvidence | null> {
  const result = await page.evaluate(() => {
    const selectors = [
      ".woocommerce-result-count",
      ".results-count",
      ".result-count",
      ".product-count",
      "[data-total-products]",
      "[data-total-count]",
    ];
    const texts = selectors
      .flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
      .map(
        (element) =>
          element.getAttribute("data-total-products") ||
          element.getAttribute("data-total-count") ||
          element.textContent ||
          "",
      );
    texts.push(document.body.innerText.slice(0, 30_000));
    for (const text of texts) {
      const matches = [
        text.match(/\bof\s+([\d,]+)\s+(?:results?|products?|items?)\b/i),
        text.match(/\b([\d,]+)\s+(?:results?|products?|items?)\b/i),
      ];
      for (const match of matches) {
        if (!match) continue;
        const total = Number(match[1].replace(/,/g, ""));
        if (Number.isFinite(total) && total >= 0) return total;
      }
    }
    return null;
  });
  if (result == null) return null;
  return {
    sourceType: "page",
    scope: "target",
    endpointUrl: page.url(),
    requestMethod: "GET",
    requestTemplate: {},
    total: result,
    isAuthoritative: true,
    confidence: 0.85,
    productUrls: [],
  };
}

/**
 * Discover downloadable catalogue feeds/exports exposed after login.
 * A complete CSV/JSON/XML export can provide an authoritative total.
 */
export async function discoverProductExports(
  page: Page,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<SupplierDiscoveryResult> {
  const rawLinks = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .map((anchor) => ({
        url: anchor.href,
        text: (anchor.textContent || "").replace(/\s+/g, " ").trim(),
      }))
      .filter(
        (item) =>
          /\.(csv|json|xml)(?:$|\?)/i.test(item.url) ||
          /\b(export|download).*(product|catalog|price|stock)|\b(product|catalog|price|stock).*(export|download)\b/i.test(
            item.text,
          ),
      )
      .slice(0, 10),
  );

  const evidence: SupplierDiscoveryEvidence[] = [];
  const found = new Set<string>();
  for (const raw of rawLinks) {
    let safeUrl: string;
    try {
      safeUrl = (
        await assertSafeSupplierUrl(raw.url, allowedHostname)
      ).toString();
    } catch {
      continue;
    }

    try {
      const downloaded = await page.evaluate(async (url) => {
        const response = await fetch(url, {
          credentials: "include",
          headers: {
            Accept:
              "text/csv,application/json,application/xml,text/xml,*/*",
          },
        });
        if (!response.ok) return null;
        const length = Number(response.headers.get("content-length") || "0");
        if (length > 50 * 1024 * 1024) return null;
        return {
          contentType: response.headers.get("content-type") || "",
          text: await response.text(),
        };
      }, safeUrl);
      if (!downloaded) continue;

      let total: number | null = null;
      let productUrls: string[] = [];
      if (
        /json/i.test(downloaded.contentType) ||
        /\.json(?:$|\?)/i.test(safeUrl)
      ) {
        const inspected = inspectJsonPayload(
          JSON.parse(downloaded.text) as unknown,
          safeUrl,
        );
        total = inspected.total ?? inspected.collectionSize;
        productUrls = inspected.productUrls;
      } else if (
        /xml/i.test(downloaded.contentType) ||
        /\.xml(?:$|\?)/i.test(safeUrl)
      ) {
        productUrls = [
          ...downloaded.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi),
        ]
          .map((match) => normalisePotentialUrl(match[1].trim(), safeUrl))
          .filter(
            (url): url is string => Boolean(url && looksLikeProductUrl(url)),
          );
        total = productUrls.length;
      } else {
        const lines = downloaded.text
          .split(/\r?\n/)
          .filter((line) => line.trim().length > 0);
        if (lines.length > 1) total = lines.length - 1;
        const urlMatches =
          downloaded.text.match(/https?:\/\/[^\s"',;<>]+/gi) ?? [];
        productUrls = urlMatches.filter((url) => looksLikeProductUrl(url));
      }

      const safeProductUrls = await safeLinks(productUrls, allowedHostname);
      for (const url of safeProductUrls) found.add(url);
      if (total != null && total >= 0) {
        const sourceType = /\.csv|export/i.test(safeUrl + raw.text)
          ? "export"
          : "feed";
        evidence.push({
          sourceType,
          scope: "catalogue",
          endpointUrl: safeUrl,
          requestMethod: "GET",
          requestTemplate: {},
          total,
          isAuthoritative: true,
          confidence: 0.99,
          productUrls: safeProductUrls,
        });
        logger?.step("catalogue", "Discovered authoritative product export", {
          endpoint: safeUrl,
          total,
          productUrls: safeProductUrls.length,
        });
      }
    } catch {
      // Export links may require a form submit or expire; keep discovering.
    }
  }

  return { urls: [...found], evidence };
}

async function safeLinks(
  urls: string[],
  allowedHostname: string,
): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    try {
      const safe = (await assertSafeSupplierUrl(url, allowedHostname)).toString();
      const key = safe.replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(safe);
    } catch {
      // Ignore off-host / unsafe links.
    }
  }
  return out;
}

/**
 * Collect product detail URLs from the current page using multiple strategies.
 * Never depends on a single AI selector.
 */
export async function collectProductLinksUniversal(
  page: Page,
  allowedHostname: string,
  configuredSelector?: string | null,
  logger?: SupplierScraperLogger,
): Promise<{ urls: string[]; learnedSelector: string | null }> {
  const candidates: string[] = [];

  const evaluate = async (selector: string): Promise<string[]> => {
    try {
      return await page.$$eval(selector, (elements) =>
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
      return [];
    }
  };

  const strategySelectors = [
    configuredSelector?.trim() || null,
    "a.prod_list_title",
    "a.woocommerce-LoopProduct-link",
    "a.product-item-link",
    "li.product a[href]",
    ".product a[href*='/product/']",
    "a[href*='/product/']",
    "a[href*='/products/']",
    "a[href*='/Shop/p_']",
    "a[href*='/item/']",
    "a[href*='/sku/']",
    "[data-product-id] a[href]",
    "a[itemprop='url']",
  ].filter((value, index, all): value is string =>
    Boolean(value && all.indexOf(value) === index),
  );

  let bestSelector: string | null = null;
  let bestCount = 0;

  for (const selector of strategySelectors) {
    const links = await evaluate(selector);
    const productLinks = links.filter((href) => looksLikeProductUrl(href));
    if (productLinks.length > bestCount) {
      bestCount = productLinks.length;
      bestSelector = selector;
    }
    candidates.push(...productLinks);
  }

  // Full-page fallback: score every anchor
  const allAnchors = await page.$$eval("a[href]", (elements) =>
    elements.map((element) => (element as HTMLAnchorElement).href).filter(Boolean),
  );
  for (const href of allAnchors) {
    if (looksLikeProductUrl(href)) candidates.push(href);
  }

  const urls = await safeLinks(candidates, allowedHostname);
  logger?.detail("catalogue", `Universal product link collect`, {
    found: urls.length,
    learnedSelector: bestSelector,
    sample: urls.slice(0, 3),
  });

  return {
    urls,
    learnedSelector: bestCount > 0 ? bestSelector : configuredSelector || null,
  };
}

/**
 * Collect browse/category/brand targets from the current page.
 */
export async function collectBrowseLinksUniversal(
  page: Page,
  allowedHostname: string,
): Promise<string[]> {
  const hrefs = await page.$$eval("a[href]", (elements) =>
    elements.map((element) => (element as HTMLAnchorElement).href).filter(Boolean),
  );
  const browse = hrefs.filter((href) => looksLikeBrowseUrl(href));
  return safeLinks(browse, allowedHostname);
}

/**
 * Resolve the next listing page using every common B2B pagination pattern.
 */
export async function resolveNextPageUniversal(
  page: Page,
  allowedHostname: string,
  configuredSelector?: string | null,
  logger?: SupplierScraperLogger,
  options?: { allowSyntheticPage?: boolean },
): Promise<string | null> {
  const selectors = [
    configuredSelector,
    'a[rel="next"]',
    "a.next.page-numbers",
    "a.page-numbers.next",
    ".woocommerce-pagination a.next",
    "ul.page-numbers a.next",
    "li.next a",
    ".pagination a.next",
    ".pager .next a",
    "a.nextpostslink",
    'a[aria-label*="Next" i]',
    'a[title*="Next" i]',
    ".nav-links a.next",
    "button[data-page].next",
    "a.load-more",
    "a[data-action='next']",
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
      const safe = (await assertSafeSupplierUrl(nextUrl, allowedHostname)).toString();
      if (safe === page.url()) continue;
      logger?.detail("catalogue", "Next page via selector", { selector, pageUrl: safe });
      return safe;
    } catch {
      // try next
    }
  }

  // Numbered pagination: current N → N+1
  try {
    const numbered = await page.evaluate(() => {
      const currentEl = document.querySelector(
        ".page-numbers.current, span.page-numbers.current, .pagination .active, li.active a, [aria-current='page']",
      );
      const currentNum = Number.parseInt(currentEl?.textContent?.trim() ?? "", 10);
      if (!Number.isFinite(currentNum)) return null;
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a.page-numbers, .pagination a, .pager a")) {
        if (/next|prev|previous/i.test(anchor.className + anchor.textContent)) continue;
        const num = Number.parseInt(anchor.textContent?.trim() ?? "", 10);
        if (num === currentNum + 1 && anchor.href) return anchor.href;
      }
      return null;
    });
    if (numbered) {
      const safe = (await assertSafeSupplierUrl(numbered, allowedHostname)).toString();
      if (safe !== page.url()) {
        logger?.detail("catalogue", "Next page via numbered links", { pageUrl: safe });
        return safe;
      }
    }
  } catch {
    // ignore
  }

  // Click "Load more" style controls (AJAX catalogues)
  try {
    const clicked = await page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll<HTMLElement>(
          "a.load-more, button.load-more, a[class*='load-more' i], button[class*='load-more' i], button[aria-label*='Load more' i], a[aria-label*='Load more' i]",
        ),
      ];
      const visible = candidates.find((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      if (!visible) return false;
      visible.click();
      return true;
    });
    if (clicked) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      logger?.detail("catalogue", "Clicked load-more control");
      // Same URL, but DOM grew; caller should re-collect without navigating.
      return page.url();
    }
  } catch {
    // ignore
  }

  if (!options?.allowSyntheticPage) return null;

  try {
    const current = new URL(page.url());
    if (/\/(login|my-account|cart|checkout|wishlist)\b/i.test(current.pathname)) {
      return null;
    }
    const match = current.pathname.match(/\/page\/(\d+)\/?$/i);
    const nextPath = match
      ? current.pathname.replace(/\/page\/\d+\/?$/i, `/page/${Number(match[1]) + 1}/`)
      : `${current.pathname.replace(/\/?$/, "/")}page/2/`;
    const synthetic = new URL(nextPath, current.origin);
    synthetic.search = current.search;
    // Also try ?paged=N / ?page=N when path-style is unlikely
    if (!match && !options.allowSyntheticPage) return null;
    const safe = (
      await assertSafeSupplierUrl(synthetic.toString(), allowedHostname)
    ).toString();
    if (safe !== page.url()) {
      logger?.detail("catalogue", "Next page via synthetic URL", { pageUrl: safe });
      return safe;
    }
  } catch {
    // ignore
  }

  // Query-param pagination fallbacks
  try {
    const current = new URL(page.url());
    for (const key of ["paged", "page", "p", "pg"]) {
      const raw = current.searchParams.get(key);
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(n)) {
        const next = new URL(current.toString());
        next.searchParams.set(key, String(n + 1));
        const safe = (
          await assertSafeSupplierUrl(next.toString(), allowedHostname)
        ).toString();
        if (safe !== page.url()) return safe;
      }
    }
    // First page with no page param yet
    if (options.allowSyntheticPage && !current.searchParams.has("paged")) {
      const next = new URL(current.toString());
      next.searchParams.set("paged", "2");
      const safe = (
        await assertSafeSupplierUrl(next.toString(), allowedHostname)
      ).toString();
      if (safe !== page.url()) return safe;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Fetch product URLs from robots/sitemap when available (works on many B2Bs).
 */
export async function discoverProductsFromSitemap(
  origin: string,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<SupplierDiscoveryResult> {
  const candidates = [
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap.xml`,
    `${origin}/product-sitemap.xml`,
    `${origin}/wp-sitemap.xml`,
    `${origin}/sitemap_products_1.xml`,
  ];

  const found: string[] = [];
  const evidence: SupplierDiscoveryEvidence[] = [];
  const visitedSitemaps = new Set<string>();
  let foundCompleteProductSitemap = false;

  async function ingestSitemap(url: string, depth: number) {
    if (depth > 3 || visitedSitemaps.has(url)) return;
    visitedSitemaps.add(url);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/xml,text/xml,*/*" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return;
      const xml = await response.text();
      const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) =>
        m[1].trim(),
      );
      const productUrls: string[] = [];
      for (const loc of locs) {
        if (/\.xml($|\?)/i.test(loc)) {
          await ingestSitemap(loc, depth + 1);
        } else if (looksLikeProductUrl(loc)) {
          found.push(loc);
          productUrls.push(loc);
        }
      }
      if (productUrls.length > 0) {
        const productSpecific =
          /product|item|sku/i.test(new URL(url).pathname) ||
          productUrls.length === locs.filter((loc) => !/\.xml($|\?)/i.test(loc)).length;
        if (productSpecific) foundCompleteProductSitemap = true;
        evidence.push({
          sourceType: "sitemap",
          scope: "catalogue",
          endpointUrl: url,
          requestMethod: "GET",
          requestTemplate: {},
          total: productUrls.length,
          // Individual shard totals are evidence, but only the deduplicated
          // aggregate below is catalogue-wide authoritative.
          isAuthoritative: false,
          confidence: productSpecific ? 0.95 : 0.7,
          productUrls,
        });
      }
    } catch {
      // Sitemap optional
    }
  }

  for (const candidate of candidates) {
    await ingestSitemap(candidate, 0);
  }

  const urls = await safeLinks(found, allowedHostname);
  if (urls.length > 0) {
    logger?.step("catalogue", `Sitemap contributed ${urls.length} product URLs`);
    if (foundCompleteProductSitemap) {
      evidence.push({
        sourceType: "sitemap",
        scope: "catalogue",
        endpointUrl: `${origin}/#product-sitemap-aggregate`,
        requestMethod: "GET",
        requestTemplate: {},
        total: urls.length,
        isAuthoritative: true,
        confidence: 0.98,
        productUrls: urls,
      });
    }
  }
  return { urls, evidence };
}

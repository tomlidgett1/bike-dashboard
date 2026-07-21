/**
 * Client-side browse context for the Nest storefront shopping agent.
 * Captures what a shopper has actually been looking at (visible products,
 * dwell, brands, filters) so proactive nudges stay specific.
 */

export type StorefrontBrowseProduct = {
  productId: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  price?: number | null;
  viewedAt: number;
  /** Accumulated ms the product was in the viewport. */
  dwellMs: number;
  /** How the product entered context. */
  source?: "click" | "impression" | "detail" | "scan";
};

export type StorefrontBrowseContext = {
  storeId: string;
  startedAt: number;
  /** Wall-clock ms the shopper has spent scrolling (accumulated while scrolling). */
  scrollEngagementMs: number;
  maxScrollDepthPct: number;
  products: StorefrontBrowseProduct[];
  categories: string[];
  searches: string[];
  tabs: string[];
  brands: string[];
  /** Product IDs currently intersecting the viewport. */
  visibleProductIds: string[];
  lastPath: string | null;
  activeCategory: string | null;
  activeTab: string | null;
};

export type StorefrontBrowseSummary = {
  scrollEngagementSeconds: number;
  maxScrollDepthPct: number;
  focusProduct: {
    name: string;
    brand: string | null;
    category: string | null;
    price: number | null;
    dwellSeconds: number;
  } | null;
  currentlyVisible: Array<{
    name: string;
    brand: string | null;
    category: string | null;
    price: number | null;
  }>;
  products: Array<{
    name: string;
    brand: string | null;
    category: string | null;
    price: number | null;
    dwellSeconds: number;
  }>;
  brands: string[];
  categories: string[];
  searches: string[];
  tabs: string[];
  activeCategory: string | null;
  activeTab: string | null;
  priceBand: { min: number; max: number } | null;
  path: string | null;
  interestSummary: string;
};

const STORAGE_PREFIX = "yj-nest-browse-ctx-v1:";
const MAX_PRODUCTS = 16;
const MAX_LIST = 8;

function storageKey(storeId: string): string {
  return `${STORAGE_PREFIX}${storeId}`;
}

function emptyContext(storeId: string): StorefrontBrowseContext {
  return {
    storeId,
    startedAt: Date.now(),
    scrollEngagementMs: 0,
    maxScrollDepthPct: 0,
    products: [],
    categories: [],
    searches: [],
    tabs: [],
    brands: [],
    visibleProductIds: [],
    lastPath: typeof window !== "undefined" ? window.location.pathname : null,
    activeCategory: null,
    activeTab: null,
  };
}

export function readBrowseContext(storeId: string): StorefrontBrowseContext {
  if (typeof window === "undefined") return emptyContext(storeId);
  try {
    const raw = window.sessionStorage.getItem(storageKey(storeId));
    if (!raw) return emptyContext(storeId);
    const parsed = JSON.parse(raw) as StorefrontBrowseContext;
    if (!parsed || parsed.storeId !== storeId) return emptyContext(storeId);
    return {
      ...emptyContext(storeId),
      ...parsed,
      products: Array.isArray(parsed.products) ? parsed.products.slice(0, MAX_PRODUCTS) : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories.slice(0, MAX_LIST) : [],
      searches: Array.isArray(parsed.searches) ? parsed.searches.slice(0, MAX_LIST) : [],
      tabs: Array.isArray(parsed.tabs) ? parsed.tabs.slice(0, MAX_LIST) : [],
      brands: Array.isArray(parsed.brands) ? parsed.brands.slice(0, MAX_LIST) : [],
      visibleProductIds: Array.isArray(parsed.visibleProductIds)
        ? parsed.visibleProductIds.slice(0, MAX_PRODUCTS)
        : [],
      activeCategory:
        typeof parsed.activeCategory === "string" ? parsed.activeCategory : null,
      activeTab: typeof parsed.activeTab === "string" ? parsed.activeTab : null,
    };
  } catch {
    return emptyContext(storeId);
  }
}

function writeBrowseContext(context: StorefrontBrowseContext) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(context.storeId), JSON.stringify(context));
  } catch {
    // Ignore quota / private mode failures.
  }
}

function pushUnique(list: string[], value: string, max = MAX_LIST): string[] {
  const cleaned = value.trim();
  if (!cleaned) return list;
  const next = [cleaned, ...list.filter((item) => item.toLowerCase() !== cleaned.toLowerCase())];
  return next.slice(0, max);
}

type ProductInput = {
  productId: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  price?: number | null;
  source?: StorefrontBrowseProduct["source"];
  dwellMs?: number;
};

function upsertProduct(
  current: StorefrontBrowseContext,
  product: ProductInput,
): StorefrontBrowseContext {
  const existing = current.products.find((item) => item.productId === product.productId);
  const without = current.products.filter((item) => item.productId !== product.productId);
  const nextProduct: StorefrontBrowseProduct = {
    productId: product.productId,
    name: product.name.trim() || existing?.name || "Product",
    brand: product.brand ?? existing?.brand ?? null,
    category: product.category ?? existing?.category ?? null,
    price:
      typeof product.price === "number"
        ? product.price
        : existing?.price ?? null,
    viewedAt: Date.now(),
    dwellMs: (existing?.dwellMs ?? 0) + Math.max(0, product.dwellMs ?? 0),
    source: product.source ?? existing?.source ?? "impression",
  };

  return {
    ...current,
    lastPath: typeof window !== "undefined" ? window.location.pathname : current.lastPath,
    products: [nextProduct, ...without].slice(0, MAX_PRODUCTS),
    categories: nextProduct.category
      ? pushUnique(current.categories, nextProduct.category)
      : current.categories,
    brands: nextProduct.brand
      ? pushUnique(current.brands, nextProduct.brand)
      : current.brands,
  };
}

export function recordBrowseProductView(storeId: string, product: ProductInput) {
  if (typeof window === "undefined" || !storeId || !product.productId) return;
  const current = readBrowseContext(storeId);
  writeBrowseContext(
    upsertProduct(current, {
      ...product,
      source: product.source ?? "click",
      dwellMs: product.dwellMs ?? 1500,
    }),
  );
}

export function recordBrowseProductDwell(
  storeId: string,
  product: ProductInput,
  dwellMs: number,
) {
  if (typeof window === "undefined" || !storeId || !product.productId || dwellMs <= 0) return;
  const current = readBrowseContext(storeId);
  writeBrowseContext(
    upsertProduct(current, {
      ...product,
      source: product.source ?? "impression",
      dwellMs,
    }),
  );
}

export function setVisibleBrowseProducts(storeId: string, productIds: string[]) {
  if (typeof window === "undefined" || !storeId) return;
  const current = readBrowseContext(storeId);
  writeBrowseContext({
    ...current,
    visibleProductIds: [...new Set(productIds)].slice(0, MAX_PRODUCTS),
    lastPath: window.location.pathname,
  });
}

export function recordBrowseCategory(storeId: string, category: string, selected = true) {
  if (typeof window === "undefined" || !storeId) return;
  const current = readBrowseContext(storeId);
  writeBrowseContext({
    ...current,
    lastPath: window.location.pathname,
    categories: selected ? pushUnique(current.categories, category) : current.categories,
    activeCategory: selected ? category.trim() || null : null,
  });
}

export function recordBrowseSearch(storeId: string, query: string) {
  if (typeof window === "undefined" || !storeId) return;
  const current = readBrowseContext(storeId);
  writeBrowseContext({
    ...current,
    lastPath: window.location.pathname,
    searches: pushUnique(current.searches, query),
  });
}

export function recordBrowseTab(storeId: string, tab: string) {
  if (typeof window === "undefined" || !storeId) return;
  const current = readBrowseContext(storeId);
  writeBrowseContext({
    ...current,
    lastPath: window.location.pathname,
    tabs: pushUnique(current.tabs, tab),
    activeTab: tab.trim() || null,
  });
}

export function recordBrowseScroll(
  storeId: string,
  deltaMs: number,
  scrollDepthPct?: number,
) {
  if (typeof window === "undefined" || !storeId || deltaMs <= 0) return;
  const current = readBrowseContext(storeId);
  writeBrowseContext({
    ...current,
    lastPath: window.location.pathname,
    scrollEngagementMs: current.scrollEngagementMs + Math.min(deltaMs, 5000),
    maxScrollDepthPct: Math.max(
      current.maxScrollDepthPct,
      typeof scrollDepthPct === "number" ? scrollDepthPct : 0,
    ),
  });
}

type DomProduct = {
  productId: string;
  name: string;
  brand: string | null;
  category: string | null;
  price: number | null;
  visibleRatio: number;
};

/** Read product cards currently on screen from data attributes. */
export function scanVisibleProductsFromDom(): DomProduct[] {
  if (typeof window === "undefined" || typeof document === "undefined") return [];

  const nodes = document.querySelectorAll<HTMLElement>("[data-nest-product-id]");
  const viewportHeight = window.innerHeight || 1;
  const results: DomProduct[] = [];

  for (const node of nodes) {
    const productId = node.getAttribute("data-nest-product-id")?.trim();
    const name = node.getAttribute("data-nest-product-name")?.trim();
    if (!productId || !name) continue;

    const rect = node.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
    const visibleWidth =
      Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
    if (visibleHeight <= 0 || visibleWidth <= 0) continue;

    const ratio = Math.min(
      1,
      (visibleHeight * visibleWidth) / Math.max(rect.height * rect.width, 1),
    );
    if (ratio < 0.18) continue;

    const priceRaw = node.getAttribute("data-nest-product-price");
    const price = priceRaw ? Number(priceRaw) : NaN;
    results.push({
      productId,
      name,
      brand: node.getAttribute("data-nest-product-brand")?.trim() || null,
      category: node.getAttribute("data-nest-product-category")?.trim() || null,
      price: Number.isFinite(price) ? price : null,
      visibleRatio: ratio,
    });
  }

  results.sort((a, b) => b.visibleRatio - a.visibleRatio);
  return results.slice(0, 8);
}

/** Merge a live DOM scan into session browse context (call before nudging). */
export function refreshBrowseContextFromDom(storeId: string): StorefrontBrowseContext {
  if (typeof window === "undefined" || !storeId) return emptyContext(storeId);

  const visible = scanVisibleProductsFromDom();
  let current = readBrowseContext(storeId);

  if (visible.length > 0) {
    current = {
      ...current,
      visibleProductIds: visible.map((item) => item.productId),
      lastPath: window.location.pathname,
    };
    for (const item of visible) {
      current = upsertProduct(current, {
        productId: item.productId,
        name: item.name,
        brand: item.brand,
        category: item.category,
        price: item.price,
        source: "scan",
        dwellMs: Math.round(400 + item.visibleRatio * 800),
      });
    }
    writeBrowseContext(current);
  }

  return current;
}

function pickFocusProduct(
  context: StorefrontBrowseContext,
): StorefrontBrowseProduct | null {
  if (context.products.length === 0) return null;

  const visibleSet = new Set(context.visibleProductIds);
  const scored = [...context.products].map((product) => {
    const recencyBoost = Math.max(0, 20_000 - (Date.now() - product.viewedAt)) / 1000;
    const visibleBoost = visibleSet.has(product.productId) ? 25 : 0;
    const clickBoost = product.source === "click" || product.source === "detail" ? 20 : 0;
    const dwellBoost = Math.min(product.dwellMs / 1000, 40);
    return {
      product,
      score: dwellBoost + visibleBoost + clickBoost + recencyBoost,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.product ?? null;
}

/** Compact summary for prompts / API payloads. */
export function summariseBrowseContext(context: StorefrontBrowseContext): StorefrontBrowseSummary {
  const focus = pickFocusProduct(context);
  const visibleSet = new Set(context.visibleProductIds);

  const products = [...context.products]
    .sort((a, b) => b.dwellMs - a.dwellMs || b.viewedAt - a.viewedAt)
    .slice(0, 8)
    .map((product) => ({
      name: product.name,
      brand: product.brand ?? null,
      category: product.category ?? null,
      price: product.price ?? null,
      dwellSeconds: Math.round(product.dwellMs / 1000),
    }));

  const currentlyVisible = context.products
    .filter((product) => visibleSet.has(product.productId))
    .slice(0, 6)
    .map((product) => ({
      name: product.name,
      brand: product.brand ?? null,
      category: product.category ?? null,
      price: product.price ?? null,
    }));

  const prices = context.products
    .map((product) => product.price)
    .filter((price): price is number => typeof price === "number" && price > 0);
  const priceBand =
    prices.length > 0
      ? { min: Math.min(...prices), max: Math.max(...prices) }
      : null;

  const interestBits: string[] = [];
  if (focus) {
    interestBits.push(
      `focused on ${[focus.brand, focus.name].filter(Boolean).join(" ")}${
        focus.category ? ` in ${focus.category}` : ""
      }${typeof focus.price === "number" ? ` around $${focus.price}` : ""}`,
    );
  }
  if (currentlyVisible.length > 0) {
    interestBits.push(
      `currently looking at ${currentlyVisible
        .slice(0, 3)
        .map((p) => (p.brand ? `${p.brand} ${p.name}` : p.name))
        .join(", ")}`,
    );
  }
  if (context.brands.length > 0) {
    interestBits.push(`brands: ${context.brands.slice(0, 4).join(", ")}`);
  }
  if (context.activeCategory) {
    interestBits.push(`filtered to ${context.activeCategory}`);
  } else if (context.categories.length > 0) {
    interestBits.push(`categories: ${context.categories.slice(0, 3).join(", ")}`);
  }
  if (context.searches.length > 0) {
    interestBits.push(`searched: ${context.searches.slice(0, 3).join(", ")}`);
  }
  if (context.activeTab) {
    interestBits.push(`on ${context.activeTab} tab`);
  }

  return {
    scrollEngagementSeconds: Math.round(context.scrollEngagementMs / 1000),
    maxScrollDepthPct: context.maxScrollDepthPct,
    focusProduct: focus
      ? {
          name: focus.name,
          brand: focus.brand ?? null,
          category: focus.category ?? null,
          price: focus.price ?? null,
          dwellSeconds: Math.round(focus.dwellMs / 1000),
        }
      : null,
    currentlyVisible,
    products,
    brands: context.brands.slice(0, 6),
    categories: context.categories.slice(0, 6),
    searches: context.searches.slice(0, 6),
    tabs: context.tabs.slice(0, 4),
    activeCategory: context.activeCategory,
    activeTab: context.activeTab,
    priceBand,
    path: context.lastPath,
    interestSummary: interestBits.join("; ") || "browsing the store",
  };
}

export function browseContextHasSignal(context: StorefrontBrowseContext): boolean {
  return (
    context.products.length > 0 ||
    context.categories.length > 0 ||
    context.searches.length > 0 ||
    context.brands.length > 0 ||
    context.maxScrollDepthPct >= 20
  );
}

const NUDGE_DISMISS_PREFIX = "yj-nest-proactive-nudge-v1:";

export function wasProactiveNudgeDismissed(storeId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(`${NUDGE_DISMISS_PREFIX}${storeId}`) === "1";
  } catch {
    return false;
  }
}

export function markProactiveNudgeDismissed(storeId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${NUDGE_DISMISS_PREFIX}${storeId}`, "1");
  } catch {
    // Ignore.
  }
}

/**
 * Observe storefront product cards and accumulate dwell / visibility into
 * browse context. Safe to call once per store page session.
 */
export function startStorefrontBrowseVisibilityTracking(storeId: string): () => void {
  if (typeof window === "undefined" || !storeId) return () => {};

  const visibleSince = new Map<string, number>();
  const metaById = new Map<string, ProductInput>();

  const readMeta = (node: Element): ProductInput | null => {
    const el = node as HTMLElement;
    const productId =
      el.getAttribute("data-nest-product-id") ||
      el.getAttribute("data-analytics-product-id");
    const name = el.getAttribute("data-nest-product-name");
    if (!productId || !name?.trim()) return null;
    const priceRaw = el.getAttribute("data-nest-product-price");
    const price = priceRaw ? Number(priceRaw) : NaN;
    return {
      productId,
      name: name.trim(),
      brand: el.getAttribute("data-nest-product-brand"),
      category: el.getAttribute("data-nest-product-category"),
      price: Number.isFinite(price) ? price : null,
      source: "impression",
    };
  };

  const flushVisible = () => {
    const now = Date.now();
    const visibleIds: string[] = [];
    for (const [productId, since] of visibleSince.entries()) {
      const meta = metaById.get(productId);
      if (!meta) continue;
      visibleIds.push(productId);
      const dwell = now - since;
      if (dwell >= 350) {
        recordBrowseProductDwell(storeId, meta, Math.min(dwell, 4000));
        visibleSince.set(productId, now);
      }
    }
    setVisibleBrowseProducts(storeId, visibleIds);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const now = Date.now();
      for (const entry of entries) {
        const meta = readMeta(entry.target);
        if (!meta) continue;
        metaById.set(meta.productId, meta);
        if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
          if (!visibleSince.has(meta.productId)) {
            visibleSince.set(meta.productId, now);
            recordBrowseProductDwell(storeId, meta, 300);
          }
        } else if (visibleSince.has(meta.productId)) {
          const since = visibleSince.get(meta.productId)!;
          recordBrowseProductDwell(storeId, meta, Math.min(now - since, 8000));
          visibleSince.delete(meta.productId);
        }
      }
      setVisibleBrowseProducts(storeId, [...visibleSince.keys()]);
    },
    { threshold: [0.25, 0.5, 0.75], rootMargin: "0px" },
  );

  const observeAll = () => {
    const nodes = document.querySelectorAll("[data-nest-product-id]");
    for (const node of nodes) observer.observe(node);
  };

  observeAll();
  const mutation = new MutationObserver(() => observeAll());
  mutation.observe(document.body, { childList: true, subtree: true });
  const flushTimer = window.setInterval(flushVisible, 2000);

  return () => {
    window.clearInterval(flushTimer);
    mutation.disconnect();
    observer.disconnect();
    flushVisible();
  };
}

function captureSupplierLoginState() {
  const text = (document.body?.innerText ?? "").toLowerCase();
  return {
    hasPassword: Boolean(document.querySelector('input[type="password"]')),
    hasCaptcha:
      text.includes("captcha") ||
      Boolean(document.querySelector('iframe[src*="captcha"], [class*="captcha" i]')),
    hasTwoFactor:
      text.includes("two-factor") ||
      text.includes("two factor") ||
      text.includes("verification code") ||
      text.includes("one-time code"),
    hasLoginError:
      text.includes("invalid password") ||
      text.includes("incorrect password") ||
      text.includes("invalid username") ||
      text.includes("login failed") ||
      text.includes("sign in failed"),
    title: document.title,
    url: window.location.href,
  };
}

function captureSupplierPageSnapshot() {
  function textOf(element) {
    return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function uniqueSelector(element) {
    if (element.id) {
      const escaped = CSS.escape(element.id);
      if (document.querySelectorAll(`#${escaped}`).length === 1) return `#${escaped}`;
    }

    const tag = element.tagName.toLowerCase();
    const stableClasses = [...element.classList]
      .filter((name) => /^[a-zA-Z][\w-]{1,60}$/.test(name))
      .slice(0, 3);
    if (stableClasses.length > 0) {
      const selector = `${tag}.${stableClasses.map((name) => CSS.escape(name)).join(".")}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }

    const parts = [];
    let current = element;
    while (current && current !== document.body && parts.length < 5) {
      const currentTag = current.tagName.toLowerCase();
      const parentElement = current.parentElement;
      if (!parentElement) break;
      const siblings = [...parentElement.children].filter(
        (child) => child.tagName === current?.tagName,
      );
      const index = siblings.indexOf(current) + 1;
      parts.unshift(`${currentTag}:nth-of-type(${Math.max(index, 1)})`);
      current = parentElement;
    }
    return `body > ${parts.join(" > ")}`;
  }

  const candidateSelector = [
    "a[href]",
    "button",
    "input",
    "select",
    "form",
    "h1",
    "h2",
    "h3",
    "[role]",
    "[itemprop]",
    '[class*="product" i]',
    '[class*="price" i]',
    '[class*="sku" i]',
    '[class*="stock" i]',
    "table tr",
    "dl",
    "img",
  ].join(",");

  const seen = new Set();
  const elements = [];
  for (const element of [...document.querySelectorAll(candidateSelector)]) {
    if (seen.has(element) || elements.length >= 600) continue;
    seen.add(element);

    const text = textOf(element);
    const href = element.href || null;
    const src = element.currentSrc || element.src || element.getAttribute("data-src");
    if (!text && !href && !src && element.tagName !== "INPUT" && element.tagName !== "FORM") {
      continue;
    }

    elements.push({
      tag: element.tagName.toLowerCase(),
      selector: uniqueSelector(element),
      text,
      href,
      src: src || null,
      type: element.type || element.getAttribute("type"),
      name: element.name || element.getAttribute("name"),
      role: element.getAttribute("role"),
      placeholder: element.placeholder || element.getAttribute("placeholder"),
      itemprop: element.getAttribute("itemprop"),
    });
  }

  return {
    url: window.location.href,
    title: document.title,
    headings: [...document.querySelectorAll("h1, h2, h3")]
      .map(textOf)
      .filter(Boolean)
      .slice(0, 80),
    bodyText: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 30_000),
    elements,
    structuredData: [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => script.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 20)
      .map((value) => value.slice(0, 20_000)),
  };
}

async function loadLazyImages() {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const maximum = Math.min(document.body?.scrollHeight ?? 0, 8_000);
  for (let y = 0; y < maximum; y += 1_000) {
    window.scrollTo(0, y);
    await delay(30);
  }
  window.scrollTo(0, 0);
}

function extractSupplierProduct(config) {
  function clean(value) {
    const normalised = (value ?? "").replace(/\s+/g, " ").trim();
    return normalised || null;
  }

  function query(root, selector) {
    if (!selector) return null;
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function text(root, selector) {
    return clean(query(root, selector)?.textContent);
  }

  function imageUrl(element) {
    const raw =
      config.imageAttribute === "data-src"
        ? element.getAttribute("data-src")
        : config.imageAttribute === "srcset"
          ? element.getAttribute("srcset")
          : element.currentSrc || element.getAttribute("src");
    if (!raw) return null;
    const candidate = raw
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean)
      .at(-1);
    if (!candidate || candidate.startsWith("data:") || candidate.endsWith(".svg")) return null;
    try {
      return new URL(candidate, window.location.href).toString();
    } catch {
      return null;
    }
  }

  let imageElements = [];
  try {
    imageElements = [...document.querySelectorAll(config.image)];
  } catch {
    imageElements = [];
  }
  if (imageElements.length === 0) {
    imageElements = [
      ...document.querySelectorAll(
        'img[itemprop="image"], [class*="gallery" i] img, [class*="product" i] img',
      ),
    ];
  }

  const imageUrls = imageElements.map(imageUrl).filter(Boolean);

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent ?? "");
      const values = [
        ...(Array.isArray(parsed.image) ? parsed.image : parsed.image ? [parsed.image] : []),
        ...(parsed["@graph"] ?? []).flatMap((item) =>
          Array.isArray(item.image) ? item.image : item.image ? [item.image] : [],
        ),
      ];
      for (const value of values) {
        imageUrls.push(new URL(value, window.location.href).toString());
      }
    } catch {
      // Ignore malformed structured data.
    }
  }

  const fields = {};
  const specificationRoot = query(document, config.specifications);
  if (specificationRoot) {
    const rows = specificationRoot.querySelectorAll("tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("th, td");
      if (cells.length < 2) continue;
      const key = clean(cells[0].textContent);
      const value = clean(cells[cells.length - 1].textContent);
      if (key && value) fields[key] = value;
    }
    for (const term of specificationRoot.querySelectorAll("dt")) {
      const key = clean(term.textContent);
      const value = clean(term.nextElementSibling?.textContent);
      if (key && value) fields[key] = value;
    }
  }

  const variants = [];
  if (config.variantRow) {
    let rows = [];
    try {
      rows = [...document.querySelectorAll(config.variantRow)];
    } catch {
      rows = [];
    }
    for (const row of rows) {
      const optionValue =
        text(row, config.variantValue) ||
        clean(row.getAttribute("data-variant")) ||
        clean(row.getAttribute("data-option")) ||
        clean(row.getAttribute("data-value")) ||
        clean(row.getAttribute("title"));
      const sku =
        text(row, config.variantSku) ||
        clean(row.getAttribute("data-sku")) ||
        clean(row.getAttribute("data-product_sku"));
      if (!optionValue && !sku) continue;

      let stock =
        text(row, config.variantStock) ||
        clean(row.getAttribute("data-stock")) ||
        clean(row.getAttribute("data-qty")) ||
        clean(row.getAttribute("data-quantity")) ||
        clean(row.getAttribute("data-availability"));

      const className = String(row.className || "").toLowerCase();
      if (!stock) {
        if (
          className.includes("out-of-stock") ||
          className.includes("outofstock") ||
          className.includes("soldout") ||
          className.includes("sold-out") ||
          row.getAttribute("data-instock") === "false" ||
          row.getAttribute("aria-disabled") === "true" ||
          row.hasAttribute("disabled")
        ) {
          stock = "Out of stock";
        } else if (
          className.includes("in-stock") ||
          className.includes("instock") ||
          row.getAttribute("data-instock") === "true"
        ) {
          stock = "In stock";
        }
      }

      variants.push({
        optionName: text(row, config.variantName) || "Option",
        optionValue,
        sku,
        stock,
        price: text(row, config.variantPrice),
      });
    }
  }

  const configuredName = text(document, config.name);
  const headingName =
    clean(document.querySelector("h1")?.textContent) ||
    clean(document.querySelector("h3")?.textContent) ||
    clean(document.querySelector(".product_title")?.textContent) ||
    null;
  const titleName = clean(
    (document.title || "")
      .replace(/^FEsports\s*\|\s*/i, "")
      .replace(/^FE Sports\s*\|\s*/i, ""),
  );
  // FE Sports product pages use h3 for the product name; breadcrumb selectors
  // like a.bcrumbsubcat wrongly return the parent category ("Protection").
  const isFesportsProduct = /\/Shop\/p_\d+/i.test(window.location.pathname);
  const name = isFesportsProduct
    ? headingName || titleName || configuredName || ""
    : configuredName || headingName || titleName || "";

  const sku =
    text(document, config.sku) ||
    (isFesportsProduct
      ? text(document, ".prx_opt_value[class*='prxsku_']") || text(document, ".prxsku")
      : null);
  const price =
    text(document, config.price) ||
    (isFesportsProduct
      ? text(document, "[class*='prxrrp_']") ||
        text(document, ".prxrrp") ||
        text(document, "[class*='prx_price_']")
      : null);
  const stock =
    text(document, config.stock) ||
    (isFesportsProduct
      ? text(document, "[class*='prx_slev_']") || text(document, ".prx_slev")
      : null);

  return {
    name,
    price,
    sku,
    stock,
    brand: text(document, config.brand),
    description: text(document, config.description),
    category: text(document, config.category),
    specifications: specificationRoot ? clean(specificationRoot.textContent) : null,
    fields,
    imageUrls: [...new Set(imageUrls)],
    variants,
  };
}

function collectPublicProductLinks() {
  return collectPublicProductLinksWithText().map((item) => item.url);
}

function collectPublicProductLinksWithText() {
  const blockedPath = /(about|account|bikes\/|cart|checkout|contact|dealer|faq|login|search|support|warranty)/i;

  const results = [];
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.href;
    try {
      const url = new URL(href);
      let keep = false;
      if (/\/(product|products|item|p)\b/i.test(url.pathname)) keep = true;
      else {
        const segments = url.pathname.split("/").filter(Boolean);
        if (segments.length >= 1 && !blockedPath.test(url.pathname)) {
          const slug = segments[segments.length - 1];
          if (slug.includes("-") && slug.length >= 5 && /\d/.test(slug)) keep = true;
        }
      }
      if (!keep) continue;
      results.push({
        url: href,
        text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
      });
    } catch {
      // Ignore invalid hrefs.
    }
  }

  const seen = new Set();
  return results.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function extractPublicProductImages() {
  function unwrapProxy(url) {
    let current = url.replace(/&amp;/g, "&");
    for (let i = 0; i < 3; i += 1) {
      const nested = current.match(/\/cdn-cgi\/image\/[^/]+\/(https?:\/\/[^\s"'<>]+)/i)?.[1];
      if (nested) {
        current = nested.replace(/[),]+$/g, "");
        continue;
      }
      const storyblok = current.match(/https?:\/\/a\.storyblok\.com\/f\/[^\s"'<>]+/i)?.[0];
      if (storyblok && storyblok !== current) {
        current = storyblok.replace(/[),]+$/g, "");
        continue;
      }
      break;
    }
    return current;
  }

  function upgradeImageUrl(url) {
    let next = unwrapProxy(url);
    try {
      const parsed = new URL(next);

      if (/bynder\.com/i.test(parsed.hostname)) {
        parsed.pathname = parsed.pathname.replace(
          /\/transform\/(?:Small|Medium|Thumb|Thumbnail|mini|preview)\//i,
          "/transform/Large/",
        );
        if (parsed.searchParams.has("io")) {
          const io = (parsed.searchParams.get("io") || "")
            .replace(/width:\d+/gi, "width:2400")
            .replace(/height:\d+/gi, "")
            .replace(/,,+/g, ",")
            .replace(/^,|,$/g, "");
          parsed.searchParams.set("io", io || "transform:fill,width:2400");
        } else if (/\/transform\//i.test(parsed.pathname)) {
          parsed.searchParams.set("io", "transform:fill,width:2400");
        }
        parsed.searchParams.set("quality", "100");
        if (!parsed.searchParams.has("output") && /\.(tif|tiff)(?:$|\?)/i.test(parsed.href)) {
          parsed.searchParams.set("output", "png");
        }
        return parsed.toString();
      }

      if (/storyblok\.com/i.test(parsed.hostname)) {
        parsed.pathname = parsed.pathname.replace(/\/m\/\d+x\d*\//i, "/m/2400x0/");
        if (parsed.searchParams.has("quality")) parsed.searchParams.set("quality", "100");
        return parsed.toString();
      }

      for (const key of ["w", "width", "maxwidth", "max_width"]) {
        if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "2400");
      }
      if (parsed.searchParams.has("quality")) parsed.searchParams.set("quality", "100");
      if (parsed.searchParams.has("q")) parsed.searchParams.set("q", "100");
      return parsed.toString();
    } catch {
      return next;
    }
  }

  function resolveImageUrl(candidate) {
    if (!candidate || candidate.startsWith("data:") || candidate.endsWith(".svg")) return null;
    const trimmed = candidate.trim().replace(/[),]+$/g, "");
    try {
      const resolved = new URL(trimmed, window.location.href).toString();
      if (!/^https?:\/\//i.test(resolved)) return null;
      return upgradeImageUrl(resolved);
    } catch {
      return null;
    }
  }

  function bestFromSrcset(srcset) {
    if (!srcset) return null;
    let bestUrl = null;
    let bestScore = -1;
    for (const part of srcset.split(",")) {
      const bits = part.trim().split(/\s+/);
      const candidate = bits[0];
      if (!candidate) continue;
      const descriptor = bits[1] || "";
      const descriptorScore = descriptor.endsWith("w")
        ? Number(descriptor.slice(0, -1)) || 0
        : descriptor.endsWith("x")
          ? (Number(descriptor.slice(0, -1)) || 0) * 1000
          : 0;
      const url = resolveImageUrl(candidate);
      if (!url) continue;
      const score = descriptorScore + (/\/transform\/Large\//i.test(url) ? 5000 : 0);
      if (score >= bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }
    return bestUrl;
  }

  function collectHttpUrls(text) {
    if (!text) return [];
    const found = [];
    for (const match of text.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
      const url = resolveImageUrl(match[0]);
      if (url) found.push(url);
    }
    return found;
  }

  function imageUrl(element) {
    const fromSrcset =
      bestFromSrcset(element.getAttribute("srcset")) ||
      bestFromSrcset(element.getAttribute("data-srcset"));
    if (fromSrcset) return fromSrcset;

    const raw =
      element.getAttribute("data-src") ||
      element.currentSrc ||
      element.getAttribute("src");
    if (raw) {
      const url = resolveImageUrl(raw);
      if (url) return url;
    }
    return null;
  }

  const imageUrls = [];
  const selectors = [
    '[class*="gallery" i] img',
    '[class*="product-image" i] img',
    '[class*="product" i] [class*="image" i] img',
    'img[itemprop="image"]',
    ".woocommerce-product-gallery img",
    "main picture img",
    "main img",
    "picture source[srcset]",
    "source[srcset]",
  ];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (element.tagName.toLowerCase() === "source") {
        const best = bestFromSrcset(element.getAttribute("srcset"));
        if (best) imageUrls.push(best);
        else imageUrls.push(...collectHttpUrls(element.getAttribute("srcset")));
        continue;
      }
      const url = imageUrl(element);
      if (url) imageUrls.push(url);
    }
  }

  const html = document.documentElement.innerHTML;
  imageUrls.push(...collectHttpUrls(html));

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent ?? "");
      const values = [
        ...(Array.isArray(parsed.image) ? parsed.image : parsed.image ? [parsed.image] : []),
        ...(parsed["@graph"] ?? []).flatMap((item) =>
          Array.isArray(item.image) ? item.image : item.image ? [item.image] : [],
        ),
      ];
      for (const value of values) {
        const url = resolveImageUrl(String(value));
        if (url) imageUrls.push(url);
      }
    } catch {
      // Ignore malformed structured data.
    }
  }

  for (const meta of document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')) {
    const content = meta.getAttribute("content");
    if (content) {
      const url = resolveImageUrl(content);
      if (url) imageUrls.push(url);
    }
  }

  const unique = [...new Set(imageUrls)].filter((url) => {
    const lower = url.toLowerCase();
    if (!/^https?:\/\//i.test(url)) return false;
    if (/(logo|icon|avatar|sprite|placeholder|base64|sizefinder|favicon|classification_logo)/.test(lower)) {
      return false;
    }
    if (/iVBORw0KGgo/i.test(url)) return false;
    if (/\/cdn-cgi\/image\/[^/]+$/i.test(url) && !/storyblok\.com|bynder\.com/i.test(url)) return false;
    return /\.(jpe?g|png|webp|avif|tif)(?:$|\?)/i.test(url) || /storyblok\.com|pondigital\.solutions|bynder\.com/i.test(url);
  }).map((url) => upgradeImageUrl(url.replace(/&amp;/g, "&")));

  // Prefer larger CDN variants when the same asset appears multiple times.
  const byAsset = new Map();
  for (const url of unique) {
    const bynderId = url.match(/bynder\.com\/(?:transform\/[^/]+\/)?([0-9a-f-]{36})/i)?.[1];
    const assetKey =
      bynderId ||
      url
        .replace(/\/(?:transform\/)?(?:Large|Medium|Small|Thumb|Thumbnail)\//gi, "/")
        .replace(/width[:=]\d+/gi, "width=X")
        .replace(/quality=\d+/gi, "quality=X")
        .replace(/[?&]io=[^&]+/gi, "");
    const existing = byAsset.get(assetKey);
    const width = Number((url.match(/width[:=](\d+)/i) || [])[1] || 0);
    const score =
      (/\/Large\//i.test(url) ? 300 : /\/Medium\//i.test(url) ? 120 : 1) +
      width +
      (/cdn-cgi\/image\//i.test(url) ? 0 : 80) +
      (/quality=100/i.test(url) ? 100 : 0);
    if (!existing || score > existing.score) {
      byAsset.set(assetKey, { url, score });
    }
  }
  const deduped = [...byAsset.values()]
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url);

  const preferred = deduped.filter((url) =>
    /(storyblok|bynder|cloudinary|cdn|media|upload)/i.test(url),
  );
  const finalUrls = preferred.length > 0 ? preferred : deduped;

  return {
    title: document.title,
    url: window.location.href,
    imageUrls: finalUrls,
    heroImageUrl: finalUrls[0] ?? null,
  };
}

function collectBrandSubcategoryLinks(input) {
  const brandUrl = input?.brandUrl ? new URL(input.brandUrl) : new URL(window.location.href);
  const brandPath = brandUrl.pathname.replace(/\/$/, "");
  const results = [];
  const seen = new Set();
  // FE Sports brand hubs are /Shop/C_1549/Name; product grids are /Shop/c_230_1549/...
  const feBrandId = brandPath.match(/\/Shop\/C_(\d+)\b/i)?.[1] ?? null;
  const isFesports = /fesports\.com\.au/i.test(brandUrl.hostname);

  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.href;
    try {
      const url = new URL(href);
      if (url.origin !== brandUrl.origin) continue;
      const path = url.pathname.replace(/\/$/, "");
      if (!path || path === brandPath) continue;
      if (path === "/" || path.length < 2) continue;

      // Skip product detail pages and utility links.
      if (/\/(product|products|cart|checkout|account|login|wishlist|compare)\b/i.test(path)) {
        continue;
      }
      if (/\.(jpg|jpeg|png|gif|pdf|css|js)$/i.test(path)) continue;

      if (isFesports && feBrandId) {
        // Only keep this brand's product grid, or true path children.
        // Reject sibling brand hubs (/Shop/C_999/Other) from the global nav.
        const isOwnProductGrid = new RegExp(`/Shop/c_\\d+_${feBrandId}\\b`, "i").test(path);
        const isPathChild = path.startsWith(`${brandPath}/`);
        const isSiblingBrandHub = /\/Shop\/C_\d+\b/i.test(path) && path !== brandPath;
        if (isSiblingBrandHub || (!isOwnProductGrid && !isPathChild)) continue;
      } else {
        const underBrand =
          brandPath.length > 1 &&
          (path.startsWith(`${brandPath}/`) ||
            path.includes(brandPath.split("/").filter(Boolean).at(-1) || "__none__"));
        const looksLikeCategory =
          /\/(category|categories|collection|collections|c|shop|filter|product-category)\b/i.test(
            path,
          ) ||
          /[?&](category|cat|product_cat|filter)=/i.test(url.search) ||
          underBrand;

        if (!looksLikeCategory) continue;
      }

      const name = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!name || name.length > 80) continue;
      if (/^(home|shop|all|view all|next|previous|prev|\d+)$/i.test(name)) continue;

      const key = `${path}?${url.search}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ name, url: url.toString() });
    } catch {
      // Ignore invalid hrefs.
    }
  }

  return results.slice(0, 60);
}

module.exports = {
  captureSupplierLoginState,
  captureSupplierPageSnapshot,
  loadLazyImages,
  extractSupplierProduct,
  collectPublicProductLinks,
  collectPublicProductLinksWithText,
  collectBrandSubcategoryLinks,
  extractPublicProductImages,
};

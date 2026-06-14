/**
 * Canonical site constants and URL helpers for SEO.
 *
 * Every absolute URL we emit — canonical tags, Open Graph URLs, the sitemap,
 * JSON-LD `url`/`@id` fields — must point at the real production origin even if
 * a stray `NEXT_PUBLIC_SITE_URL=http://localhost:3000` leaks into a production
 * build (it currently sits in `.env.local`). A canonical pointing at localhost
 * would tell Google the real pages are duplicates of an unreachable host and
 * deindex the site. So we only honour the env var when it is a real https
 * origin, and otherwise fall back to the known production domain.
 */
const ENV_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');

export const SITE_URL =
  ENV_SITE_URL && ENV_SITE_URL.startsWith('https://') && !ENV_SITE_URL.includes('localhost')
    ? ENV_SITE_URL
    : 'https://yellowjersey.store';

export const SITE_NAME = 'Yellow Jersey';

/** Default homepage / fallback meta description (kept under ~155 chars for SERP). */
export const SITE_DESCRIPTION =
  'Shop new and used bikes, parts and apparel from independent local bike shops on Yellow Jersey — or sell your own gear. Delivery or local pickup.';

/** Strong, keyword-led title used for the homepage and as the default. */
export const SITE_TITLE = `${SITE_NAME} — Bikes, parts & apparel from local bike shops`;

/** Default Open Graph / Twitter image (brand). Relative — resolved via metadataBase. */
export const SITE_OG_IMAGE = '/yjlogo.png';

/** Turn a path or already-absolute URL into an absolute production URL. */
export function absoluteUrl(path = ''): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function storePath(storeId: string): string {
  return `/marketplace/store/${storeId}`;
}

export function productPath(productId: string): string {
  return `/marketplace/product/${productId}`;
}

export function storeUrl(storeId: string): string {
  return absoluteUrl(storePath(storeId));
}

export function productUrl(productId: string): string {
  return absoluteUrl(productPath(productId));
}

const PRODUCT_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Turn arbitrary text into a URL slug (lowercase, alphanumerics + hyphens, capped). */
export function slugify(input?: string | null): string {
  return (input || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
}

/**
 * Extract the trailing product id (UUID) from a `slug-id` URL segment, or return
 * the segment unchanged when it's already a bare id. The slug prefix is purely
 * decorative — the id is what we look the product up by, so renames never break links.
 */
export function extractProductId(param: string): string {
  const m = param?.match(PRODUCT_ID_RE);
  return m ? m[1] : param;
}

/** Canonical, keyword-rich product path: `/marketplace/product/{name-slug}-{id}`. */
export function productSlugId(id: string, name?: string | null): string {
  const slug = slugify(name);
  return slug ? `${slug}-${id}` : id;
}

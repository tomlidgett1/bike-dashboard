import type { MetadataRoute } from 'next';
import { SITE_URL, productSlugId } from '@/lib/seo/site';
import { getAllLandingSlugs } from '@/lib/seo/landing-pages';
import { createPublicSupabaseClient } from '@/lib/marketplace/public-card-feed';
import { resolveProductImage } from '@/lib/services/image-resolver';
import { toCurrentHeroPublicId } from '@/lib/utils/cloudinary-transforms';

// Served at /sitemap.xml. Regenerated hourly (ISR) so new storefronts and
// listings get discovered quickly. Enumerates every public storefront and
// marketplace listing alongside the static public routes.
export const revalidate = 3600;

type SupabaseLike = ReturnType<typeof createPublicSupabaseClient>;

const PAGE_SIZE = 1000; // PostgREST caps rows per request; page through with range().
const MAX_ROWS = 50000; // single-sitemap URL ceiling.

const STATIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
}> = [
  { path: '/marketplace', priority: 1.0, changeFrequency: 'daily' },
  { path: '/marketplace/new-products', priority: 0.8, changeFrequency: 'daily' },
  { path: '/marketplace/used-products', priority: 0.8, changeFrequency: 'daily' },
  { path: '/sell-your-bike', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/used-bikes', priority: 0.8, changeFrequency: 'daily' },
  { path: '/guides', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/for-you', priority: 0.5, changeFrequency: 'daily' },
  { path: '/marketplace/help', priority: 0.3, changeFrequency: 'monthly' },
];

async function fetchAllRows<T>(
  label: string,
  query: (supabase: SupabaseLike, from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  supabase: SupabaseLike,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await query(supabase, from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`[sitemap] ${label} page ${from} failed:`, error);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

type StoreRow = { user_id: string | null; store_slug?: string | null };

// Stores are few, so one page is enough. Tries the slug-aware select and
// falls back when the store_slug column isn't present yet (pre-migration),
// so the sitemap keeps listing storefronts either way.
async function fetchStoreRows(supabase: SupabaseLike): Promise<StoreRow[]> {
  // Slug-aware select first; fall back to user_id only when the store_slug
  // column isn't present yet (pre-migration). Separate branches keep the two
  // differently-shaped responses from clashing under the type checker.
  const withSlug = await supabase
    .from('users')
    .select('user_id, store_slug')
    .eq('account_type', 'bicycle_store')
    .eq('bicycle_store', true)
    .range(0, 4999);
  if (!withSlug.error) {
    return (withSlug.data ?? []) as StoreRow[];
  }

  const idOnly = await supabase
    .from('users')
    .select('user_id')
    .eq('account_type', 'bicycle_store')
    .eq('bicycle_store', true)
    .range(0, 4999);
  if (idOnly.error) {
    console.error('[sitemap] stores failed:', idOnly.error);
    return [];
  }
  return (idOnly.data ?? []) as StoreRow[];
}

interface ProductSitemapRow {
  id: string;
  created_at: string | null;
  display_name: string | null;
  resolved_image_id: string | null;
  resolved_image_source: string | null;
  resolved_external_url: string | null;
  resolved_cloudinary_url: string | null;
  resolved_cloudinary_public_id: string | null;
}

// Resolve a product's primary image to an absolute URL for the image sitemap.
function resolveProductImageUrl(p: ProductSitemapRow): string | null {
  try {
    const publicId = toCurrentHeroPublicId(p.resolved_cloudinary_public_id, p.resolved_image_source);
    const resolved = resolveProductImage({
      id: p.resolved_image_id,
      cloudinary_public_id: publicId,
      cloudinary_url: p.resolved_cloudinary_url,
      external_url: p.resolved_external_url,
      approval_status: 'approved',
    });
    const url = resolved?.card_url ?? resolved?.original_url ?? null;
    return url && /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  for (const slug of getAllLandingSlugs()) {
    entries.push({
      url: `${SITE_URL}/guides/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.75,
    });
  }

  // City used-bike hubs
  for (const city of ['melbourne', 'sydney', 'brisbane', 'perth', 'adelaide']) {
    entries.push({
      url: `${SITE_URL}/used-bikes/${city}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.75,
    });
  }

  try {
    const supabase = createPublicSupabaseClient();

    const [stores, products] = await Promise.all([
      fetchStoreRows(supabase),
      fetchAllRows<ProductSitemapRow>(
        'products',
        (sb, from, to) =>
          sb
            .from('public_marketplace_cards')
            .select(
              'id, created_at, display_name, resolved_image_id, resolved_image_source, resolved_external_url, resolved_cloudinary_url, resolved_cloudinary_public_id',
            )
            .order('created_at', { ascending: false })
            .range(from, to),
        supabase,
      ),
    ]);

    for (const s of stores) {
      if (!s.user_id) continue;
      // Prefer the slug; the raw user_id still resolves (and 301s to the slug).
      const idOrSlug = s.store_slug || s.user_id;
      entries.push({
        url: `${SITE_URL}/marketplace/store/${idOrSlug}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.9,
      });
    }

    for (const p of products) {
      if (!p.id) continue;
      const imageUrl = resolveProductImageUrl(p);
      entries.push({
        url: `${SITE_URL}/marketplace/product/${productSlugId(p.id, p.display_name)}`,
        lastModified: p.created_at ? new Date(p.created_at) : now,
        changeFrequency: 'weekly',
        priority: 0.7,
        // Image sitemap entry → helps the listing photo rank in Google Images.
        ...(imageUrl ? { images: [imageUrl] } : {}),
      });
    }
  } catch (err) {
    // Never let a transient DB error 500 the sitemap — return the static routes.
    console.error('[sitemap] Failed to enumerate dynamic routes:', err);
  }

  return entries.slice(0, MAX_ROWS);
}

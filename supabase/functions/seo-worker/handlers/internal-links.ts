// internal-links — weave published SEO pages into a local graph. Category <->
// suburb <-> store-directory <-> brand links spread crawl equity and help users
// move between supply. Deterministic; stored on each page's content.internal_links.
import type { Handler, SeoPageRow } from '../../_shared/seo-types.ts';

export const internalLinks: Handler = async (_task, { db }) => {
  const { data, error } = await db
    .from('seo_pages')
    .select('url, page_type, title, h1, params, content, status')
    .eq('status', 'published');
  if (error) throw new Error(error.message);
  const pages = (data ?? []) as Array<SeoPageRow & { content: SeoPageRow['content'] }>;
  if (pages.length === 0) return { updated: 0 };

  const placeOf = (p: SeoPageRow) => String((p.params as Record<string, string>)?.place ?? '');
  const catOf = (p: SeoPageRow) => String((p.params as Record<string, string>)?.categorySlug ?? '');
  const anchor = (p: SeoPageRow) => p.h1 || p.title || p.url;

  let updated = 0;
  for (const page of pages) {
    const place = placeOf(page);
    const links: Array<{ url: string; anchor: string }> = [];

    for (const other of pages) {
      if (other.url === page.url) continue;
      if (links.length >= 6) break;
      const samePlace = placeOf(other) === place && place !== '';

      const relevant =
        // same place, different surface (category <-> shops <-> service)
        (samePlace && other.page_type !== page.page_type) ||
        // sibling categories in the same place
        (samePlace && other.page_type === page.page_type) ||
        // brand pages link to the all-category Melbourne hubs
        (page.page_type === 'brand_city' && other.page_type === 'marketplace_category') ||
        // category city hub links to its suburb variants
        (page.page_type === 'marketplace_category' && other.page_type === 'suburb_category' && catOf(other) === catOf(page));

      if (relevant) links.push({ url: other.url, anchor: anchor(other) });
    }

    if (links.length) {
      const content = { ...(page.content ?? {}), internal_links: links };
      const { error: upErr } = await db.from('seo_pages').update({ content }).eq('url', page.url);
      if (!upErr) updated++;
    }
  }

  return { pages: pages.length, updated };
};

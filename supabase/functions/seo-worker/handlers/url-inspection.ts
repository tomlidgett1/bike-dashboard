// url-inspection — ask Google how it sees our URLs (index status, canonical,
// last crawl) via the URL Inspection API. Quota is 2,000/day, 600/min; we spend
// a small slice per hour on freshly published + recently changed pages so the
// budget lasts. Includes agent SEO pages and blog posts. No-ops without creds.
import type { Handler } from '../../_shared/seo-types.ts';
import { getGoogleAccessToken, googleConfigStatus, gscSiteProperty, GSC_SCOPE_READONLY } from '../../_shared/google-auth.ts';

const PER_RUN = 40; // ~960/day across 24 hourly runs, well under the 2,000 cap
const BLOG_SLOTS = 12;

export const urlInspection: Handler = async (_task, { db, site }) => {
  const siteProperty = gscSiteProperty();
  if (!siteProperty) return { skipped: 'GSC_SITE_URL not set' };
  const cfg = googleConfigStatus();
  if (!cfg.ok) return { skipped: cfg.reason };
  const token = await getGoogleAccessToken([GSC_SCOPE_READONLY]);
  if (!token) return { skipped: 'service-account token mint failed' };

  const seoLimit = PER_RUN - BLOG_SLOTS;

  const [{ data: pages }, { data: blogPosts }] = await Promise.all([
    db
      .from('seo_pages')
      .select('url, canonical_url')
      .eq('status', 'published')
      .neq('page_type', 'blog')
      .order('last_published_at', { ascending: false })
      .limit(seoLimit),
    db
      .from('blog_posts')
      .select('slug, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(BLOG_SLOTS),
  ]);

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const p of (pages ?? []) as Array<{ url: string; canonical_url: string | null }>) {
    const absolute = p.canonical_url || `${site}${p.url}`;
    if (!seen.has(absolute)) {
      seen.add(absolute);
      urls.push(absolute);
    }
  }

  for (const post of (blogPosts ?? []) as Array<{ slug: string }>) {
    const absolute = `${site}/blog/${post.slug}`;
    if (!seen.has(absolute)) {
      seen.add(absolute);
      urls.push(absolute);
    }
  }

  // Also pick up blog rows registered in seo_pages (deduped above).
  const { data: blogSeoPages } = await db
    .from('seo_pages')
    .select('url, canonical_url')
    .eq('status', 'published')
    .eq('page_type', 'blog')
    .order('last_published_at', { ascending: false })
    .limit(BLOG_SLOTS);

  for (const p of (blogSeoPages ?? []) as Array<{ url: string; canonical_url: string | null }>) {
    const absolute = p.canonical_url || `${site}${p.url}`;
    if (!seen.has(absolute) && urls.length < PER_RUN) {
      seen.add(absolute);
      urls.push(absolute);
    }
  }

  let inspected = 0;
  for (const url of urls.slice(0, PER_RUN)) {
    try {
      const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: siteProperty }),
      });
      if (!res.ok) {
        if (res.status === 429) break;
        continue;
      }
      const data = await res.json();
      const r = data?.inspectionResult?.indexStatusResult ?? {};
      await db.from('url_inspections').insert({
        url,
        verdict: data?.inspectionResult?.verdict ?? null,
        coverage_state: r.coverageState ?? null,
        indexing_state: r.indexingState ?? null,
        robots_txt_state: r.robotsTxtState ?? null,
        google_canonical: r.googleCanonical ?? null,
        user_canonical: r.userCanonical ?? null,
        last_crawl_time: r.lastCrawlTime ?? null,
        rich_results: data?.inspectionResult?.richResultsResult ?? null,
        raw: data?.inspectionResult ?? null,
      });
      inspected++;
    } catch (err) {
      console.warn('[url-inspection]', err instanceof Error ? err.message : String(err));
    }
  }

  return { inspected, budget: PER_RUN, blog_urls: (blogPosts ?? []).length };
};

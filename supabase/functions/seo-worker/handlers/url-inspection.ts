// url-inspection — ask Google how it sees our URLs (index status, canonical,
// last crawl) via the URL Inspection API. Quota is 2,000/day, 600/min; we spend
// a small slice per hour on freshly published + recently changed pages so the
// budget lasts. No-ops without creds.
import type { Handler } from '../../_shared/seo-types.ts';
import { getGoogleAccessToken, googleConfigStatus, gscSiteProperty, GSC_SCOPE_READONLY } from '../../_shared/google-auth.ts';

const PER_RUN = 40; // ~960/day across 24 hourly runs, well under the 2,000 cap

export const urlInspection: Handler = async (_task, { db, site }) => {
  const siteProperty = gscSiteProperty();
  if (!siteProperty) return { skipped: 'GSC_SITE_URL not set' };
  const cfg = googleConfigStatus();
  if (!cfg.ok) return { skipped: cfg.reason };
  const token = await getGoogleAccessToken([GSC_SCOPE_READONLY]);
  if (!token) return { skipped: 'service-account token mint failed' };

  // Prioritise: published pages we haven't inspected recently.
  const { data: pages } = await db
    .from('seo_pages')
    .select('url, canonical_url')
    .eq('status', 'published')
    .order('last_published_at', { ascending: false })
    .limit(PER_RUN);

  const urls = ((pages ?? []) as Array<{ url: string; canonical_url: string | null }>)
    .map((p) => p.canonical_url || `${site}${p.url}`);

  let inspected = 0;
  for (const url of urls) {
    try {
      const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: siteProperty }),
      });
      if (!res.ok) {
        if (res.status === 429) break; // rate limited — stop, resume next run
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

  return { inspected, budget: PER_RUN };
};

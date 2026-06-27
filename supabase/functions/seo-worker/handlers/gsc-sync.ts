// gsc-sync — pull Search Console performance into gsc_query_page_daily.
//
// One request for the last ~90 days with the `date` dimension gives true daily
// rows (the 3/7/28/90-day "windows" the doc mentions are then just filters over
// this table in keyword-engine). No-ops cleanly when Google isn't configured.
import type { Handler } from '../../_shared/seo-types.ts';
import { getGoogleAccessToken, googleConfigStatus, gscSiteProperty, GSC_SCOPE_READONLY } from '../../_shared/google-auth.ts';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

interface GscRow {
  keys: string[]; // [date, query, page, country, device]
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export const gscSync: Handler = async (_task, { db }) => {
  const siteProperty = gscSiteProperty(); // e.g. "sc-domain:yellowjersey.store"
  if (!siteProperty) return { skipped: 'GSC_SITE_URL not set' };

  const cfg = googleConfigStatus();
  if (!cfg.ok) return { skipped: cfg.reason };
  const token = await getGoogleAccessToken([GSC_SCOPE_READONLY]);
  if (!token) return { skipped: 'service-account token mint failed — verify the private key is intact and the SA exists' };

  const endDate = isoDaysAgo(2); // GSC data lags ~2 days
  const startDate = isoDaysAgo(90);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteProperty)}/searchAnalytics/query`;

  let startRow = 0;
  const pageSize = 25_000;
  const maxPages = 6;
  let upserted = 0;

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['date', 'query', 'page', 'country', 'device'],
        rowLimit: pageSize,
        startRow,
        dataState: 'all',
      }),
    });

    if (!res.ok) {
      throw new Error(`GSC ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = await res.json();
    const rows = (data.rows ?? []) as GscRow[];
    if (rows.length === 0) break;

    const mapped = rows.map((r) => ({
      date: r.keys[0],
      query: r.keys[1] ?? '',
      page: r.keys[2] ?? '',
      country: r.keys[3] ?? '',
      device: r.keys[4] ?? '',
      search_appearance: '',
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));

    // chunked upsert on the natural key
    for (let i = 0; i < mapped.length; i += 500) {
      const chunk = mapped.slice(i, i + 500);
      const { error } = await db
        .from('gsc_query_page_daily')
        .upsert(chunk, { onConflict: 'date,query,page,country,device,search_appearance', ignoreDuplicates: false });
      if (error) throw new Error(`gsc upsert: ${error.message}`);
      upserted += chunk.length;
    }

    if (rows.length < pageSize) break;
    startRow += pageSize;
  }

  return { upserted, startDate, endDate };
};

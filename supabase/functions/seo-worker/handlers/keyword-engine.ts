// keyword-engine — maintain the keyword universe from GSC demand.
//
// Rolls up Search Console queries (28d), classifies intent heuristically,
// extracts the local place, computes a priority score, and merges the demand
// into seo_keywords (without clobbering the inventory supply snapshot).
import type { Handler } from '../../_shared/seo-types.ts';
import { findPlaceInText } from '../../_shared/seo-geo.ts';

interface Rollup {
  query: string;
  impressions: number;
  clicks: number;
  avg_position: number;
  top_page: string | null;
}

function classifyIntent(q: string): string {
  const t = q.toLowerCase();
  if (/\b(shop|store|near me|stores|shops)\b/.test(t)) return 'local_store';
  if (/\b(service|servicing|repair|repairs|puncture|tune)\b/.test(t)) return 'service';
  if (/\b(used|second hand|second-hand|for sale|buy|cheap|pre-?owned)\b/.test(t)) return 'transactional_local';
  if (/\b(best|vs|versus|how|what size|guide|review|laws)\b/.test(t)) return 'guide';
  return 'product';
}

// Position 8-30 with real impressions = the "money zone"; weight it up.
function priority(r: Rollup, local: boolean): number {
  const demand = Math.log10((r.impressions || 0) + 1) * 10; // ~40 at 10k
  const gap = r.avg_position >= 6 && r.avg_position <= 30 ? 20 : r.avg_position > 0 && r.avg_position < 6 ? 8 : 5;
  const localBonus = local ? 12 : 0;
  return Math.round(demand + gap + localBonus);
}

export const keywordEngine: Handler = async (_task, { db }) => {
  const { data, error } = await db.rpc('seo_gsc_query_rollup', { p_days: 28 });
  if (error) throw new Error(`gsc rollup: ${error.message}`);
  const rollups = (data ?? []) as Rollup[];
  if (rollups.length === 0) return { rollups: 0, note: 'no GSC data yet (sync needs Google creds)' };

  // Fetch existing demand so we MERGE rather than overwrite the supply snapshot.
  const keywords = rollups.map((r) => r.query.toLowerCase().trim()).filter(Boolean);
  const existing = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < keywords.length; i += 500) {
    const { data: rows } = await db
      .from('seo_keywords')
      .select('keyword, demand')
      .in('keyword', keywords.slice(i, i + 500));
    for (const row of (rows ?? []) as Array<{ keyword: string; demand: Record<string, unknown> }>) {
      existing.set(row.keyword, row.demand ?? {});
    }
  }

  const now = new Date().toISOString();
  const upserts = rollups.map((r) => {
    const keyword = r.query.toLowerCase().trim();
    const place = findPlaceInText(keyword);
    const local = !!place;
    const prevDemand = existing.get(keyword) ?? {};
    return {
      keyword,
      intent: classifyIntent(keyword),
      location: place ?? null,
      priority_score: priority(r, local),
      source: 'gsc',
      last_seen_at: now,
      demand: {
        ...prevDemand,
        impressions: r.impressions,
        clicks: r.clicks,
        position: r.avg_position,
        top_page: r.top_page,
      },
    };
  });

  let upserted = 0;
  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500);
    const { error: upErr } = await db.from('seo_keywords').upsert(chunk, { onConflict: 'keyword', ignoreDuplicates: false });
    if (upErr) throw new Error(`keyword upsert: ${upErr.message}`);
    upserted += chunk.length;
  }

  return { rollups: rollups.length, upserted };
};

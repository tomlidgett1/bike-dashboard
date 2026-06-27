// ============================================================================
// page-planner — turn real supply + demand into scored page candidates.
//
// For every potential surface (category x city, category x suburb, store
// directory, brand x city, owned store) it gathers live supply + GSC demand,
// scores it (seo-scoring), and writes an seo_pages row. Only pages that clear
// the bar get status=draft + intended index and a page-generator task; thin
// ones stay candidate/noindex; pages whose supply dried up are retired. This is
// the gate that stops the agent from mass-producing doorway pages.
// ============================================================================
import type { Handler, PageType } from '../../_shared/seo-types.ts';
import { scorePage } from '../../_shared/seo-scoring.ts';
import { slugify } from '../../_shared/seo-slug.ts';
import { MELBOURNE_SUBURBS, placeLabel } from '../../_shared/seo-geo.ts';
import { isBikeBrand, isJunkBrand } from '../../_shared/seo-brands.ts';

interface Candidate {
  url: string;
  page_type: PageType;
  target_keyword: string;
  params: Record<string, unknown>;
  supplyCount: number;
  storeBacked: boolean;
}

const REFRESH_AFTER_DAYS = 7;

export const pagePlanner: Handler = async (_task, { db, site }) => {
  // --- Gather supply in a handful of round-trips ---------------------------
  const [{ data: cats }, { data: brands }, { data: stores }, { data: matrix }, { data: kwRows }, { data: existingPages }] =
    await Promise.all([
      db.rpc('seo_category_supply'),
      db.rpc('seo_brand_supply', { p_min: 5 }),
      db.rpc('seo_store_directory'),
      db.rpc('seo_suburb_supply_matrix', { p_suburbs: MELBOURNE_SUBURBS }),
      db.from('seo_keywords').select('keyword, demand, location'),
      db.from('seo_pages').select('url, status, target_keyword, last_refreshed_at'),
    ]);

  const demandByKeyword = new Map<string, { impressions?: number; position?: number }>();
  for (const k of (kwRows ?? []) as Array<{ keyword: string; demand: Record<string, number> }>) {
    demandByKeyword.set(k.keyword, k.demand ?? {});
  }
  const pageByUrl = new Map<string, { status: string; target_keyword: string | null; last_refreshed_at: string | null }>();
  const keywordToUrl = new Map<string, string>();
  for (const p of (existingPages ?? []) as Array<{ url: string; status: string; target_keyword: string | null; last_refreshed_at: string | null }>) {
    pageByUrl.set(p.url, p);
    if (p.target_keyword) keywordToUrl.set(p.target_keyword, p.url);
  }

  const candidates: Candidate[] = [];

  // A. category x Melbourne (city hubs) — only categories that actually exist.
  for (const c of (cats ?? []) as Array<{ category: string; n: number }>) {
    const cat = (c.category || '').trim();
    if (!cat || cat.toLowerCase() === 'uncategorised') continue;
    const slug = slugify(cat);
    candidates.push({
      url: `/bikes/${slug}/melbourne`,
      page_type: 'marketplace_category',
      target_keyword: `${cat.toLowerCase()} melbourne`,
      params: { category: cat, categorySlug: slug, place: 'melbourne', placeLabel: 'Melbourne', scope: 'city' },
      supplyCount: Number(c.n) || 0,
      storeBacked: false,
    });
  }

  // B. category x suburb — only where real local supply exists.
  for (const row of (matrix ?? []) as Array<{ suburb: string; category: string; n: number }>) {
    const cat = (row.category || '').trim();
    if (!cat || cat.toLowerCase() === 'uncategorised') continue;
    const slug = slugify(cat);
    candidates.push({
      url: `/bikes/${slug}/${row.suburb}`,
      page_type: 'suburb_category',
      target_keyword: `${cat.toLowerCase()} ${row.suburb.replace(/-/g, ' ')}`,
      params: { category: cat, categorySlug: slug, place: row.suburb, placeLabel: placeLabel(row.suburb), scope: 'suburb' },
      supplyCount: Number(row.n) || 0,
      storeBacked: false,
    });
  }

  // C. store directory — Melbourne + suburbs that actually have stores.
  const storeList = (stores ?? []) as Array<{ user_id: string; store_slug: string | null; business_name: string; address: string | null; product_count: number }>;
  candidates.push({
    url: `/bike-shops/melbourne`,
    page_type: 'store_directory',
    target_keyword: 'bike shops melbourne',
    params: { place: 'melbourne', placeLabel: 'Melbourne', scope: 'city' },
    supplyCount: storeList.length,
    storeBacked: storeList.length > 0,
  });
  for (const suburb of MELBOURNE_SUBURBS) {
    const name = suburb.replace(/-/g, ' ');
    const inSuburb = storeList.filter((s) => (s.address ?? '').toLowerCase().includes(name)).length;
    if (inSuburb > 0) {
      candidates.push({
        url: `/bike-shops/${suburb}`,
        page_type: 'store_directory',
        target_keyword: `bike shop ${name}`,
        params: { place: suburb, placeLabel: placeLabel(suburb), scope: 'suburb' },
        supplyCount: inSuburb,
        storeBacked: true,
      });
    }
  }

  // D. brand x Melbourne — top brands with depth.
  for (const b of ((brands ?? []) as Array<{ brand: string; n: number }>).slice(0, 15)) {
    const brand = (b.brand || '').trim();
    if (!brand || isJunkBrand(brand)) continue; // skip "Generic", "Mercedes-Benz", etc.
    candidates.push({
      url: `/brands/${slugify(brand)}/melbourne`,
      page_type: 'brand_city',
      // Only claim "bikes" in the keyword for actual bike brands.
      target_keyword: isBikeBrand(brand) ? `${brand.toLowerCase()} bikes melbourne` : `${brand.toLowerCase()} melbourne`,
      params: { brand, place: 'melbourne', placeLabel: 'Melbourne', scope: 'city' },
      supplyCount: Number(b.n) || 0,
      storeBacked: false,
    });
  }

  // E. owned store — Ashburton Cycles is the flagship.
  const ashburton = storeList.find((s) => s.business_name?.toLowerCase().includes('ashburton'));
  if (ashburton) {
    const slug = ashburton.store_slug || slugify(ashburton.business_name);
    candidates.push({
      url: `/stores/${slug}`,
      page_type: 'owned_store',
      target_keyword: `${ashburton.business_name.toLowerCase()}`,
      params: { user_id: ashburton.user_id, store_slug: slug, business_name: ashburton.business_name },
      supplyCount: Number(ashburton.product_count) || 0,
      storeBacked: true,
    });
  }

  // --- Score + persist -----------------------------------------------------
  const now = new Date().toISOString();
  const genTasks: Array<Record<string, unknown>> = [];
  let published = 0, drafts = 0, candidatesKept = 0, retired = 0;

  for (const c of candidates) {
    const demand = demandByKeyword.get(c.target_keyword) ?? {};
    const cannibalUrl = keywordToUrl.get(c.target_keyword);
    const cannibalisationRisk = cannibalUrl && cannibalUrl !== c.url ? 1 : 0;

    const result = scorePage({
      searchDemand: demand.impressions ?? 0,
      position: demand.position ?? 0,
      localIntent: true,
      supplyCount: c.supplyCount,
      storeBacked: c.storeBacked,
      commercialIntent: c.page_type !== 'guide',
      internalLinkPotential: 0.6,
      duplicationRisk: 0,
      cannibalisationRisk,
    });

    const existing = pageByUrl.get(c.url);
    const canonical = `${site}${c.url}`;

    // Decide the row's status/indexability without flapping a live page.
    let status: string;
    let indexability: string;
    let enqueueGen = false;

    if (result.decision === 'publish') {
      indexability = 'index';
      if (existing?.status === 'published') {
        status = 'published';
        const stale = !existing.last_refreshed_at || Date.now() - Date.parse(existing.last_refreshed_at) > REFRESH_AFTER_DAYS * 86_400_000;
        enqueueGen = stale;
        published++;
      } else {
        status = 'draft'; // generate + validate before it goes live
        enqueueGen = true;
        drafts++;
      }
    } else if (result.decision === 'review') {
      status = existing?.status === 'published' ? 'published' : 'draft';
      indexability = existing?.status === 'published' ? 'index' : 'noindex';
      enqueueGen = existing?.status !== 'published';
      drafts++;
    } else if (result.decision === 'candidate') {
      status = existing?.status === 'published' ? 'draft' : 'candidate'; // demote a page that lost supply
      indexability = 'noindex';
      candidatesKept++;
    } else {
      // skip — retire an existing page that no longer has supply
      if (!existing) continue;
      status = 'retired';
      indexability = 'noindex';
      retired++;
    }

    const { error } = await db.from('seo_pages').upsert(
      {
        url: c.url,
        page_type: c.page_type,
        target_keyword: c.target_keyword,
        status,
        indexability,
        canonical_url: canonical,
        quality_score: result.score,
        spam_risk_score: result.spamRisk,
        supply_count: c.supplyCount,
        params: c.params,
      },
      { onConflict: 'url', ignoreDuplicates: false },
    );
    if (error) throw new Error(`seo_pages upsert ${c.url}: ${error.message}`);

    if (enqueueGen) {
      genTasks.push({ task_type: 'page-generator', priority: 35, payload: { page_url: c.url }, run_after: now });
    }
  }

  if (genTasks.length) {
    const { error } = await db.from('seo_tasks').insert(genTasks);
    if (error) throw new Error(`enqueue generators: ${error.message}`);
  }

  return {
    candidates: candidates.length,
    published_kept: published,
    drafts,
    candidates_held: candidatesKept,
    retired,
    generators_enqueued: genTasks.length,
  };
};

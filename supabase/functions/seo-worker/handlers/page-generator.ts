// ============================================================================
// page-generator — draft a page from REAL data, optionally polished by GLM.
//
// Facts (counts, price range, brands, store names, suburb) come from the DB and
// are never invented. GLM only rewrites the title/meta/intro/FAQs around those
// facts; if GLM isn't configured it falls back to deterministic templates, so a
// page is always grounded and shippable. Output lands as status=draft content;
// page-validator decides whether it goes live.
// ============================================================================
import type { Handler, PageContent, SeoPageRow } from '../../_shared/seo-types.ts';
import { callLLMJson } from '../../_shared/seo-llm.ts';
import { titleCase } from '../../_shared/seo-slug.ts';
import { isBikeBrand } from '../../_shared/seo-brands.ts';

const AUD = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;

interface Facts {
  count: number;
  placeLabel: string;
  scopeLabel: string; // "Melbourne" | "Camberwell"
  categoryLabel?: string;
  brandLabel?: string;
  priceMin?: number;
  priceMax?: number;
  topBrands: string[];
  stores: Array<{ name: string; address: string | null }>;
  kind: 'category' | 'store_directory' | 'brand' | 'owned_store';
  isBikeBrand?: boolean; // brand pages: true => may say "Bikes", else neutral wording
}

async function gatherFacts(db: SeoCtxDb, page: SeoPageRow): Promise<Facts> {
  const p = page.params as Record<string, string>;
  const placeLabel = p.placeLabel || 'Melbourne';

  if (page.page_type === 'store_directory') {
    const { data: stores } = await db.rpc('seo_store_directory');
    const name = (p.place || 'melbourne').replace(/-/g, ' ');
    const list = ((stores ?? []) as Array<{ business_name: string; address: string | null }>)
      .filter((s) => p.scope === 'city' || (s.address ?? '').toLowerCase().includes(name))
      .map((s) => ({ name: s.business_name, address: s.address }));
    return { count: list.length, placeLabel, scopeLabel: placeLabel, stores: list, topBrands: [], kind: 'store_directory' };
  }

  if (page.page_type === 'owned_store') {
    const { data: profile } = await db
      .from('users')
      .select('business_name, address')
      .eq('user_id', p.user_id)
      .maybeSingle();
    const sample = await sampleListings(db, (q) => q.eq('user_id', p.user_id));
    return {
      count: page.supply_count,
      placeLabel,
      scopeLabel: (profile as { business_name?: string })?.business_name || 'our store',
      stores: profile ? [{ name: (profile as { business_name: string }).business_name, address: (profile as { address: string | null }).address }] : [],
      topBrands: sample.brands,
      priceMin: sample.min,
      priceMax: sample.max,
      kind: 'owned_store',
    };
  }

  // category / brand: sample listings to derive price range + top brands
  const sample = await sampleListings(db, (q) => {
    let qq = q;
    if (page.page_type === 'brand_city' && p.brand) qq = qq.ilike('brand', p.brand);
    if ((page.page_type === 'marketplace_category' || page.page_type === 'suburb_category') && p.category) qq = qq.eq(p.categoryField || 'marketplace_category', p.category);
    if (page.page_type === 'suburb_category' && p.place) qq = qq.ilike('pickup_location', `%${p.place.replace(/-/g, ' ')}%`);
    return qq;
  });

  return {
    count: page.supply_count,
    placeLabel,
    scopeLabel: placeLabel,
    categoryLabel: p.category ? titleCase(p.category) : undefined,
    brandLabel: p.brand ? titleCase(p.brand) : undefined,
    topBrands: sample.brands,
    priceMin: sample.min,
    priceMax: sample.max,
    stores: [],
    kind: page.page_type === 'brand_city' ? 'brand' : 'category',
    isBikeBrand: page.page_type === 'brand_city' && p.brand ? isBikeBrand(p.brand, sample.hasBicycles) : undefined,
  };
}

// deno-lint-ignore no-explicit-any
type SeoCtxDb = any;

async function sampleListings(db: SeoCtxDb, apply: (q: SeoCtxDb) => SeoCtxDb) {
  const q = apply(db.from('public_marketplace_cards').select('price, brand, marketplace_category').limit(200));
  const { data } = await q;
  const rows = (data ?? []) as Array<{ price: number | string | null; brand: string | null; marketplace_category: string | null }>;
  const prices = rows.map((r) => Number(r.price)).filter((n) => Number.isFinite(n) && n > 0);
  const brandCounts = new Map<string, number>();
  for (const r of rows) {
    const b = (r.brand ?? '').trim();
    if (b) brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
  }
  const brands = [...brandCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([b]) => b);
  // Does this brand actually have a product in the "Bicycles" category? (catches
  // real bike brands not on the allowlist.)
  const hasBicycles = rows.some((r) => /bicycle|bikes?$/i.test((r.marketplace_category ?? '').trim()));
  return {
    min: prices.length ? Math.min(...prices) : undefined,
    max: prices.length ? Math.max(...prices) : undefined,
    brands,
    hasBicycles,
  };
}

function subject(f: Facts): string {
  if (f.kind === 'store_directory') return `Bike Shops in ${f.scopeLabel}`;
  if (f.kind === 'owned_store') return f.scopeLabel;
  if (f.kind === 'brand') return f.isBikeBrand ? `${f.brandLabel} Bikes in ${f.scopeLabel}` : `${f.brandLabel} in ${f.scopeLabel}`;
  return `${f.categoryLabel} in ${f.scopeLabel}`;
}

function templateContent(f: Facts): { title: string; meta: string; h1: string; content: PageContent } {
  const subj = subject(f);
  const priceLine = f.priceMin != null && f.priceMax != null ? ` from ${AUD(f.priceMin)} to ${AUD(f.priceMax)}` : '';
  const blocks: Array<{ heading: string; body: string }> = [];
  const faqs: Array<{ q: string; a: string }> = [];

  if (f.kind === 'store_directory') {
    const names = f.stores.slice(0, 8).map((s) => s.name).filter(Boolean);
    blocks.push({ heading: `Bike shops serving ${f.scopeLabel}`, body: names.length ? `Including ${names.join(', ')}. Compare brands carried, services and live stock in one place.` : `Local bike shops with service, repairs and stock near ${f.scopeLabel}.` });
    blocks.push({ heading: 'Service & repairs', body: `Most stores offer servicing, repairs and e-bike support. Book or call directly from each store's page.` });
    faqs.push({ q: `How many bike shops are near ${f.scopeLabel}?`, a: `${f.count} verified bike ${f.count === 1 ? 'store is' : 'stores are'} listed on Yellow Jersey for ${f.scopeLabel}.` });
  } else if (f.kind === 'owned_store') {
    blocks.push({ heading: `About ${f.scopeLabel}`, body: `${f.scopeLabel} lists ${f.count} live products on Yellow Jersey${priceLine}, with local pickup and delivery.` });
    if (f.topBrands.length) blocks.push({ heading: 'Brands in stock', body: f.topBrands.join(', ') });
    faqs.push({ q: `Does ${f.scopeLabel} sell online?`, a: `Yes — browse ${f.count} live products with delivery or local pickup.` });
  } else {
    // "Apollo bikes" for a bike brand, "Shimano products" otherwise; "Road Bikes" for a category.
    const noun = f.kind === 'brand' ? `${f.brandLabel} ${f.isBikeBrand ? 'bikes' : 'products'}` : (f.categoryLabel ?? 'bikes');
    blocks.push({ heading: subj, body: `${f.count} live ${noun}${priceLine}, from local bike shops and private sellers — with delivery or local pickup.` });
    if (f.kind !== 'brand' && f.topBrands.length) blocks.push({ heading: 'Popular brands', body: f.topBrands.join(', ') });
    blocks.push({ heading: 'Pickup & delivery', body: `Buy with local pickup across ${f.scopeLabel} or delivery, backed by Yellow Jersey buyer protection.` });
    faqs.push({ q: `How many ${noun} are for sale in ${f.scopeLabel}?`, a: `${f.count} live listing${f.count === 1 ? '' : 's'}${priceLine} right now on Yellow Jersey.` });
  }

  const title = `${subj}${f.count ? ` — ${f.count} Listings` : ''} | Yellow Jersey`.slice(0, 65);
  const meta = `Browse ${f.count} ${subj.toLowerCase()}${priceLine} on Yellow Jersey. Verified listings, local pickup & delivery.`.replace(/\s+/g, ' ').slice(0, 158);

  return {
    title,
    meta,
    h1: subj,
    content: {
      intro: `${subj} — ${f.count} live listing${f.count === 1 ? '' : 's'}${priceLine} on Yellow Jersey.`,
      blocks,
      faqs,
      internal_links: [],
      schema: f.kind === 'store_directory' ? ['BreadcrumbList', 'ItemList', 'LocalBusiness']
        : f.kind === 'owned_store' ? ['BreadcrumbList', 'LocalBusiness']
        : ['BreadcrumbList', 'ItemList'],
      generated_by: 'template',
      generated_at: new Date().toISOString(),
    },
  };
}

interface LlmDraft {
  title?: string;
  meta_description?: string;
  intro?: string;
  faqs?: Array<{ q: string; a: string }>;
}

export const pageGenerator: Handler = async (task, { db }) => {
  const url = task.payload.page_url as string;
  if (!url) throw new Error('page-generator: missing page_url');

  const { data: page, error } = await db.from('seo_pages').select('*').eq('url', url).maybeSingle();
  if (error) throw new Error(error.message);
  if (!page) return { skipped: `no seo_page ${url}` };

  const facts = await gatherFacts(db, page as SeoPageRow);
  const base = templateContent(facts);

  // Optional GLM polish — grounded strictly in the facts we pass.
  const draft = await callLLMJson<LlmDraft>({
    system:
      'You are an SEO copywriter for Yellow Jersey, a Melbourne cycling marketplace. Write only from the FACTS provided. Never invent counts, prices, stores or claims. Australian English. Return JSON {title, meta_description, intro, faqs:[{q,a}]}. title <= 60 chars, meta_description <= 155 chars.',
    user: JSON.stringify({ subject: subject(facts), facts }),
    maxTokens: 800,
  });

  const title = clampStr(draft?.title, 65) || base.title;
  const meta = clampStr(draft?.meta_description, 158) || base.meta;
  const intro = clampStr(draft?.intro, 300) || base.content.intro;
  const faqs = Array.isArray(draft?.faqs) && draft!.faqs!.length ? draft!.faqs!.slice(0, 5) : base.content.faqs;

  const content: PageContent = {
    ...base.content,
    intro,
    faqs,
    generated_by: draft ? 'glm' : 'template',
    generated_at: new Date().toISOString(),
  };

  const { error: upErr } = await db
    .from('seo_pages')
    .update({ title, meta_description: meta, h1: base.h1, content, last_refreshed_at: new Date().toISOString() })
    .eq('url', url);
  if (upErr) throw new Error(`update page: ${upErr.message}`);

  // Hand off to the validator (the gate that can flip a draft to published).
  const { error: tErr } = await db.from('seo_tasks').insert({ task_type: 'page-validator', priority: 38, payload: { page_url: url } });
  if (tErr) throw new Error(`enqueue validator: ${tErr.message}`);

  return { url, generated_by: content.generated_by, supply: facts.count };
};

function clampStr(s: string | undefined, max: number): string | null {
  const t = (s ?? '').trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trim() : t;
}

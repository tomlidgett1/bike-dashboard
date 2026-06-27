// inventory-sync — snapshot live supply (category / brand / store) into the
// keyword universe so the keyword engine and planner can score against REAL
// inventory. Pages only get built where supply exists.
import type { Handler } from '../../_shared/seo-types.ts';

export const inventorySync: Handler = async (_task, { db }) => {
  const [{ data: cats }, { data: brands }, { data: stores }] = await Promise.all([
    db.rpc('seo_category_supply'),
    db.rpc('seo_brand_supply', { p_min: 3 }),
    db.rpc('seo_store_directory'),
  ]);

  const now = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];

  for (const c of (cats ?? []) as Array<{ category: string; n: number }>) {
    const cat = (c.category || '').toLowerCase().trim();
    if (!cat || cat === 'uncategorised') continue;
    rows.push({
      keyword: `${cat} melbourne`,
      intent: 'transactional_local',
      location: 'melbourne',
      category: cat,
      source: 'inventory',
      last_seen_at: now,
      demand: { supply_count: Number(c.n) || 0 },
    });
  }

  for (const b of (brands ?? []) as Array<{ brand: string; n: number }>) {
    const brand = (b.brand || '').toLowerCase().trim();
    if (!brand) continue;
    rows.push({
      keyword: `${brand} bikes melbourne`,
      intent: 'product',
      location: 'melbourne',
      brand,
      source: 'inventory',
      last_seen_at: now,
      demand: { supply_count: Number(b.n) || 0 },
    });
  }

  // Upsert the universe (keyword is unique). demand is overwritten with the
  // latest supply snapshot; GSC demand is merged later by keyword-engine.
  if (rows.length) {
    const { error } = await db.from('seo_keywords').upsert(rows, { onConflict: 'keyword', ignoreDuplicates: false });
    if (error) throw new Error(`seo_keywords upsert: ${error.message}`);
  }

  const storeList = (stores ?? []) as Array<{ business_name: string; product_count: number }>;
  return {
    categories: (cats ?? []).length,
    brands: (brands ?? []).length,
    stores: storeList.length,
    stores_with_inventory: storeList.filter((s) => Number(s.product_count) > 0).length,
    keywords_upserted: rows.length,
  };
};

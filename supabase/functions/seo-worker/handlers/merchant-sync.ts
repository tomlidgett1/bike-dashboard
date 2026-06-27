// merchant-sync — push eligible live products into Google Merchant Center via
// the Merchant API v1 (free listings / Shopping). Feed data must match the
// product page. No-ops without MERCHANT_ID + creds, but still reports how many
// products are feed-eligible so the dashboard shows the opportunity.
//
// v1 flow: products are pushed into a "primary product data source" (API type).
// We find-or-create one, then upsert productInputs against it.
import type { Handler } from '../../_shared/seo-types.ts';
import { getGoogleAccessToken, MERCHANT_SCOPE } from '../../_shared/google-auth.ts';
import { slugify } from '../../_shared/seo-slug.ts';

const API = 'https://merchantapi.googleapis.com';
const DS_DISPLAY = 'Yellow Jersey API feed';

interface CardRow {
  id: string;
  display_name: string | null;
  description: string | null;
  price: number | string | null;
  brand: string | null;
  qoh: number | null;
  condition_rating: string | null;
  marketplace_category: string | null;
}

// Find our API data source or create it; returns its resource name.
async function ensureDataSource(merchantId: string, token: string): Promise<{ name?: string; error?: string }> {
  const base = `${API}/datasources/v1/accounts/${merchantId}/dataSources`;
  const auth = { Authorization: `Bearer ${token}` };

  const list = await fetch(base, { headers: auth });
  if (list.ok) {
    const data = await list.json();
    const found = (data.dataSources ?? []).find(
      (d: { displayName?: string; primaryProductDataSource?: unknown; name?: string }) =>
        d.displayName === DS_DISPLAY && d.primaryProductDataSource,
    );
    if (found?.name) return { name: found.name };
  } else if (list.status === 401 || list.status === 403) {
    return { error: `data source list ${list.status}: ${(await list.text()).slice(0, 160)}` };
  }

  const create = await fetch(base, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: DS_DISPLAY,
      primaryProductDataSource: { contentLanguage: 'en', feedLabel: 'AU' },
    }),
  });
  if (!create.ok) return { error: `create data source ${create.status}: ${(await create.text()).slice(0, 200)}` };
  const ds = await create.json();
  return { name: ds.name };
}

const BATCH = 120; // products per task invocation
const CONCURRENCY = 8; // parallel inserts — Merchant API tolerates this fine

export const merchantSync: Handler = async (task, { db, site }) => {
  const offset = (task.payload.offset as number) ?? 0;

  // One bounded page of eligible products (live card with a price).
  const { data, error } = await db
    .from('public_marketplace_cards')
    .select('id, display_name, description, price, brand, qoh, condition_rating, marketplace_category')
    .order('created_at', { ascending: false })
    .range(offset, offset + BATCH - 1);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as CardRow[]).filter((r) => Number(r.price) > 0);
  if (rows.length === 0) return { done: true, offset, synced: 0 };

  const merchantId = Deno.env.get('MERCHANT_ID');
  const token = merchantId ? await getGoogleAccessToken([MERCHANT_SCOPE]) : null;
  if (!merchantId || !token) return { skipped: 'MERCHANT_ID/creds not set' };

  const ds = await ensureDataSource(merchantId, token);
  if (!ds.name) return { error: ds.error ?? 'no data source' };
  const endpoint = `${API}/products/v1/accounts/${merchantId}/productInputs:insert?dataSource=${encodeURIComponent(ds.name)}`;

  const insertOne = async (r: CardRow): Promise<string | null> => {
    const productInput = {
      offerId: r.id,
      contentLanguage: 'en',
      feedLabel: 'AU',
      productAttributes: {
        title: (r.display_name || 'Bicycle').slice(0, 150),
        description: (r.description || r.display_name || '').slice(0, 5000),
        link: `${site}/marketplace/product/${slugify(r.display_name)}-${r.id}`,
        price: { amountMicros: String(Math.round(Number(r.price) * 1_000_000)), currencyCode: 'AUD' },
        availability: (r.qoh ?? 0) > 0 ? 'in_stock' : 'out_of_stock',
        condition: (r.condition_rating ?? '').toLowerCase().includes('new') || !r.condition_rating ? 'new' : 'used',
        brand: r.brand ?? undefined,
        productTypes: r.marketplace_category ? [r.marketplace_category] : undefined,
      },
    };
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(productInput) });
      return res.ok ? null : `${res.status}: ${(await res.text()).slice(0, 120)}`;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  // Parallel insert pool — dramatically faster than serial (47/run → whole batch).
  let synced = 0;
  let firstError: string | undefined;
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const err = await insertOne(rows[cursor++]);
      if (err) { if (!firstError) firstError = err; } else synced++;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Chain the next page if this one was full (more products remain).
  const more = (data ?? []).length === BATCH;
  if (more) {
    await db.from('seo_tasks').insert({ task_type: 'merchant-sync', priority: 1, payload: { offset: offset + BATCH } });
  }

  return { offset, synced, more, dataSource: ds.name, ...(firstError ? { firstError } : {}) };
};

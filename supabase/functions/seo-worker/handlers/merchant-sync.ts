// merchant-sync — push eligible live products into Google Merchant Center via
// the Merchant API (free listings / Shopping). Feed data must match the product
// page exactly. No-ops without MERCHANT_ID + creds, but still reports how many
// products are feed-eligible so the dashboard shows the opportunity.
import type { Handler } from '../../_shared/seo-types.ts';
import { getGoogleAccessToken, MERCHANT_SCOPE } from '../../_shared/google-auth.ts';
import { slugify } from '../../_shared/seo-slug.ts';

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

export const merchantSync: Handler = async (task, { db, site }) => {
  const limit = (task.payload.limit as number) ?? 500;

  // Eligible = live marketplace card with a price (image is guaranteed by the view).
  const { data, error } = await db
    .from('public_marketplace_cards')
    .select('id, display_name, description, price, brand, qoh, condition_rating, marketplace_category')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as CardRow[]).filter((r) => Number(r.price) > 0);

  const merchantId = Deno.env.get('MERCHANT_ID');
  const token = merchantId ? await getGoogleAccessToken([MERCHANT_SCOPE]) : null;

  if (!merchantId || !token) {
    return { skipped: 'MERCHANT_ID/creds not set', eligible: rows.length };
  }

  let synced = 0;
  for (const r of rows) {
    const productUrl = `${site}/marketplace/product/${slugify(r.display_name)}-${r.id}`;
    const productInput = {
      channel: 'ONLINE',
      offerId: r.id,
      contentLanguage: 'en',
      feedLabel: 'AU',
      attributes: {
        title: (r.display_name || 'Bicycle').slice(0, 150),
        description: (r.description || r.display_name || '').slice(0, 5000),
        link: productUrl,
        price: { amountMicros: String(Math.round(Number(r.price) * 1_000_000)), currencyCode: 'AUD' },
        availability: (r.qoh ?? 0) > 0 ? 'in_stock' : 'out_of_stock',
        condition: (r.condition_rating ?? '').toLowerCase().includes('new') || !r.condition_rating ? 'new' : 'used',
        brand: r.brand ?? undefined,
        productTypes: r.marketplace_category ? [r.marketplace_category] : undefined,
      },
    };
    try {
      const res = await fetch(
        `https://merchantapi.googleapis.com/products/v1beta/accounts/${merchantId}/productInputs:insert?dataSource=accounts/${merchantId}/dataSources/primary`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(productInput) },
      );
      if (res.ok) synced++;
      else if (res.status === 429) break;
    } catch (err) {
      console.warn('[merchant-sync]', err instanceof Error ? err.message : String(err));
    }
  }

  return { eligible: rows.length, synced };
};

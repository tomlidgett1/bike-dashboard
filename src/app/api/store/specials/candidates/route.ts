/**
 * Specials candidate search — powers the "add a product" picker. Returns
 * in-stock, storefront-ready products matching a query, each with its live
 * economics and a margin-safe proposed discount preview.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedStoreUserId } from '@/lib/store/specials/api-helpers';
import { loadSpecialsConfig } from '@/lib/store/specials/config';
import { gatherMetricsForProductIds } from '@/lib/store/specials/metrics';
import { proposeDiscount } from '@/lib/store/specials/discount-engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { userId, error } = await getVerifiedStoreUserId(supabase);
  if (!userId) return NextResponse.json({ error: error!.message }, { status: error!.status });

  const { searchParams } = new URL(request.url);
  const rawQuery = (searchParams.get('q') ?? '').trim().replace(/[%,]/g, ' ').slice(0, 80);
  const cycleId = searchParams.get('cycleId');

  let query = supabase
    .from('marketplace_ready_products')
    .select('id')
    .eq('user_id', userId)
    .gt('qoh', 0)
    .limit(25);

  if (rawQuery.length >= 2) {
    query = query.or(`display_name.ilike.%${rawQuery}%,description.ilike.%${rawQuery}%`);
  } else {
    // No query → most recently added in-stock products as a starting list.
    query = query.order('created_at', { ascending: false });
  }

  const { data, error: searchError } = await query;
  if (searchError) {
    if (searchError.code === '42P01') return NextResponse.json({ candidates: [] });
    console.error('[specials/candidates] search failed:', searchError.message);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  let ids = (data ?? []).map((r) => (r as { id: string }).id);

  // Exclude products already in the target cycle.
  if (cycleId) {
    const { data: existing } = await supabase
      .from('store_specials_cycle_items')
      .select('product_id')
      .eq('cycle_id', cycleId)
      .eq('is_removed', false);
    const taken = new Set((existing ?? []).map((r) => (r as { product_id: string }).product_id));
    ids = ids.filter((id) => !taken.has(id));
  }

  if (ids.length === 0) return NextResponse.json({ candidates: [] });

  const [config, metrics] = await Promise.all([
    loadSpecialsConfig(supabase, userId),
    gatherMetricsForProductIds(supabase, userId, ids),
  ]);

  const candidates = metrics.map((m) => ({ ...m, proposal: proposeDiscount(m, config) }));
  return NextResponse.json({ candidates });
}

/**
 * Specials cycle items API — the manual controls.
 *  POST   add a product to a cycle (pinned)            { cycleId, productId }
 *  DELETE remove a product from a cycle (tombstoned)   ?cycleId=&productId=
 *  PUT    reorder and/or override discounts            { cycleId, order?, discounts? }
 *
 * Edits to the live (active) cycle re-apply discounts + re-sync the storefront
 * carousel immediately; edits to upcoming cycles just persist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedStoreUserId } from '@/lib/store/specials/api-helpers';
import { loadSpecialsConfig } from '@/lib/store/specials/config';
import { buildManualItemRow } from '@/lib/store/specials/generate-cycle';
import { resyncActiveCycle } from '@/lib/store/specials/activate';
import {
  discountCeilingPercent,
  salePriceForDiscount,
} from '@/lib/store/specials/discount-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getCycle(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, cycleId: string) {
  const { data } = await supabase
    .from('store_specials_cycles')
    .select('id, status')
    .eq('id', cycleId)
    .eq('user_id', userId)
    .maybeSingle();
  return data as { id: string; status: string } | null;
}

async function refreshItemCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cycleId: string,
) {
  const { count } = await supabase
    .from('store_specials_cycle_items')
    .select('id', { count: 'exact', head: true })
    .eq('cycle_id', cycleId)
    .eq('is_removed', false);
  await supabase
    .from('store_specials_cycles')
    .update({ item_count: count ?? 0 })
    .eq('id', cycleId);
}

// ── Add product ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { userId, error } = await getVerifiedStoreUserId(supabase);
  if (!userId) return NextResponse.json({ error: error!.message }, { status: error!.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const cycleId = typeof body.cycleId === 'string' ? body.cycleId : null;
  const productId = typeof body.productId === 'string' ? body.productId : null;
  if (!cycleId || !productId) {
    return NextResponse.json({ error: 'cycleId and productId are required' }, { status: 400 });
  }

  const cycle = await getCycle(supabase, userId, cycleId);
  if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  if (cycle.status !== 'upcoming' && cycle.status !== 'active') {
    return NextResponse.json({ error: 'Can only edit upcoming or active cycles' }, { status: 400 });
  }

  const config = await loadSpecialsConfig(supabase, userId);

  // Already present? Un-tombstone + pin instead of duplicating.
  const { data: existing } = await supabase
    .from('store_specials_cycle_items')
    .select('id')
    .eq('cycle_id', cycleId)
    .eq('product_id', productId)
    .maybeSingle();

  const { data: maxPos } = await supabase
    .from('store_specials_cycle_items')
    .select('position')
    .eq('cycle_id', cycleId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((maxPos as { position: number } | null)?.position ?? -1) + 1;

  if (existing) {
    await supabase
      .from('store_specials_cycle_items')
      .update({ is_removed: false, is_pinned: true, position })
      .eq('id', (existing as { id: string }).id);
  } else {
    const row = await buildManualItemRow(supabase, userId, cycleId, productId, config, position);
    if (!row) return NextResponse.json({ error: 'Product not found or unavailable' }, { status: 400 });
    const { error: insertError } = await supabase.from('store_specials_cycle_items').insert(row);
    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Product already in this cycle' }, { status: 409 });
      }
      console.error('[specials/items] add failed:', insertError.message);
      return NextResponse.json({ error: 'Failed to add product' }, { status: 500 });
    }
  }

  await refreshItemCount(supabase, cycleId);
  await resyncActiveCycle(supabase, userId, config, cycleId);
  return NextResponse.json({ ok: true });
}

// ── Remove product (tombstone so regen won't re-add) ─────────
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { userId, error } = await getVerifiedStoreUserId(supabase);
  if (!userId) return NextResponse.json({ error: error!.message }, { status: error!.status });

  const { searchParams } = new URL(request.url);
  const cycleId = searchParams.get('cycleId');
  const productId = searchParams.get('productId');
  if (!cycleId || !productId) {
    return NextResponse.json({ error: 'cycleId and productId are required' }, { status: 400 });
  }

  const cycle = await getCycle(supabase, userId, cycleId);
  if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

  const { error: updateError } = await supabase
    .from('store_specials_cycle_items')
    .update({ is_removed: true, is_pinned: false })
    .eq('cycle_id', cycleId)
    .eq('product_id', productId)
    .eq('user_id', userId);

  if (updateError) {
    console.error('[specials/items] remove failed:', updateError.message);
    return NextResponse.json({ error: 'Failed to remove product' }, { status: 500 });
  }

  const config = await loadSpecialsConfig(supabase, userId);
  await refreshItemCount(supabase, cycleId);
  await resyncActiveCycle(supabase, userId, config, cycleId);
  return NextResponse.json({ ok: true });
}

// ── Reorder + discount override ──────────────────────────────
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { userId, error } = await getVerifiedStoreUserId(supabase);
  if (!userId) return NextResponse.json({ error: error!.message }, { status: error!.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const cycleId = typeof body.cycleId === 'string' ? body.cycleId : null;
  if (!cycleId) return NextResponse.json({ error: 'cycleId is required' }, { status: 400 });

  const cycle = await getCycle(supabase, userId, cycleId);
  if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

  const config = await loadSpecialsConfig(supabase, userId);

  // Reorder: order is an array of productIds in the desired sequence.
  if (Array.isArray(body.order)) {
    const order = (body.order as unknown[]).filter((v): v is string => typeof v === 'string');
    await Promise.all(
      order.map((productId, index) =>
        supabase
          .from('store_specials_cycle_items')
          .update({ position: index })
          .eq('cycle_id', cycleId)
          .eq('product_id', productId)
          .eq('user_id', userId),
      ),
    );
  }

  // Discount overrides: [{ productId, discountPercent }], clamped to margin-safe ceiling.
  if (Array.isArray(body.discounts)) {
    const { data: rows } = await supabase
      .from('store_specials_cycle_items')
      .select('product_id, retail, cost')
      .eq('cycle_id', cycleId)
      .eq('user_id', userId);
    const byProduct = new Map(
      (rows ?? []).map((r) => [
        (r as { product_id: string }).product_id,
        r as { retail: number; cost: number },
      ]),
    );

    for (const entry of body.discounts as Array<Record<string, unknown>>) {
      const productId = typeof entry.productId === 'string' ? entry.productId : null;
      const requested = Number(entry.discountPercent);
      if (!productId || !Number.isFinite(requested)) continue;
      const econ = byProduct.get(productId);
      if (!econ) continue;

      const ceiling = discountCeilingPercent(econ, config);
      const finalPct = Math.max(0, Math.min(requested, ceiling));
      await supabase
        .from('store_specials_cycle_items')
        .update({
          final_discount_percent: finalPct,
          proposed_sale_price: salePriceForDiscount(econ.retail, finalPct),
        })
        .eq('cycle_id', cycleId)
        .eq('product_id', productId)
        .eq('user_id', userId);
    }
  }

  await resyncActiveCycle(supabase, userId, config, cycleId);
  return NextResponse.json({ ok: true });
}

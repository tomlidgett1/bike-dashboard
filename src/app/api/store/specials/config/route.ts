/**
 * Specials config API — load and update a store's specials carousel settings.
 *
 * Saving structural settings (cadence, strategy, count, discount knobs…) rebuilds
 * the upcoming cycle pipeline so previews reflect the new rules; the active cycle
 * is left running. Enabling/disabling rotates immediately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedStoreUserId } from '@/lib/store/specials/api-helpers';
import {
  loadSpecialsConfig,
  ensureSpecialsCarousel,
} from '@/lib/store/specials/config';
import { ensureUpcomingCycles } from '@/lib/store/specials/generate-cycle';
import { rotateSpecials } from '@/lib/store/specials/activate';
import type {
  SpecialsCadence,
  SpecialsConfig,
  SpecialsConfigUpdate,
  SpecialsSelectionMode,
  SpecialsStrategy,
} from '@/lib/types/specials';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CADENCES: SpecialsCadence[] = ['daily', 'weekly'];
const STRATEGIES: SpecialsStrategy[] = ['random', 'single_category', 'one_per_category', 'clearance'];
const MODES: SpecialsSelectionMode[] = ['auto', 'manual'];

/** Changing any of these rebuilds upcoming cycles. */
const GENERATION_FIELDS: (keyof SpecialsConfig)[] = [
  'cadence',
  'rotation_hour',
  'rotation_weekday',
  'timezone',
  'strategy',
  'selection_mode',
  'products_per_cycle',
  'category_count',
  'min_discount_percent',
  'max_discount_percent',
  'min_margin_floor_percent',
  'discount_aggressiveness',
  'stale_days_threshold',
  'min_cooldown_cycles',
  'ai_enabled',
];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Coerce an untrusted body into a safe partial config update. */
function sanitizeUpdate(body: Record<string, unknown>, current: SpecialsConfig): SpecialsConfigUpdate {
  const out: SpecialsConfigUpdate = {};

  if ('is_enabled' in body) out.is_enabled = !!body.is_enabled;
  if ('ai_enabled' in body) out.ai_enabled = !!body.ai_enabled;
  if (typeof body.cadence === 'string' && CADENCES.includes(body.cadence as SpecialsCadence)) {
    out.cadence = body.cadence as SpecialsCadence;
  }
  if (typeof body.strategy === 'string' && STRATEGIES.includes(body.strategy as SpecialsStrategy)) {
    out.strategy = body.strategy as SpecialsStrategy;
  }
  if (typeof body.selection_mode === 'string' && MODES.includes(body.selection_mode as SpecialsSelectionMode)) {
    out.selection_mode = body.selection_mode as SpecialsSelectionMode;
  }
  if ('rotation_hour' in body) out.rotation_hour = clampInt(body.rotation_hour, 0, 23, current.rotation_hour);
  if ('rotation_weekday' in body) out.rotation_weekday = clampInt(body.rotation_weekday, 0, 6, current.rotation_weekday);
  if (typeof body.timezone === 'string' && body.timezone.trim()) out.timezone = body.timezone.trim().slice(0, 64);
  if ('products_per_cycle' in body) out.products_per_cycle = clampInt(body.products_per_cycle, 1, 60, current.products_per_cycle);
  if ('category_count' in body) out.category_count = clampInt(body.category_count, 1, 20, current.category_count);
  if ('min_discount_percent' in body) out.min_discount_percent = clampNum(body.min_discount_percent, 0, 100, current.min_discount_percent);
  if ('max_discount_percent' in body) out.max_discount_percent = clampNum(body.max_discount_percent, 0, 100, current.max_discount_percent);
  if ('min_margin_floor_percent' in body) out.min_margin_floor_percent = clampNum(body.min_margin_floor_percent, 0, 95, current.min_margin_floor_percent);
  if ('discount_aggressiveness' in body) out.discount_aggressiveness = clampNum(body.discount_aggressiveness, 0, 1, current.discount_aggressiveness);
  if ('stale_days_threshold' in body) out.stale_days_threshold = clampInt(body.stale_days_threshold, 1, 1000, current.stale_days_threshold);
  if ('min_cooldown_cycles' in body) out.min_cooldown_cycles = clampInt(body.min_cooldown_cycles, 0, 52, current.min_cooldown_cycles);
  if (typeof body.carousel_title === 'string' && body.carousel_title.trim()) out.carousel_title = body.carousel_title.trim().slice(0, 80);
  if ('carousel_subtitle' in body) {
    out.carousel_subtitle = typeof body.carousel_subtitle === 'string' ? body.carousel_subtitle.trim().slice(0, 160) || null : null;
  }

  // Keep discount min ≤ max after merge.
  const min = out.min_discount_percent ?? current.min_discount_percent;
  const max = out.max_discount_percent ?? current.max_discount_percent;
  if (min > max) {
    out.min_discount_percent = Math.min(min, max);
    out.max_discount_percent = Math.max(min, max);
  }

  return out;
}

export async function GET() {
  const supabase = await createClient();
  const { userId, error } = await getVerifiedStoreUserId(supabase);
  if (!userId) return NextResponse.json({ error: error!.message }, { status: error!.status });

  const config = await loadSpecialsConfig(supabase, userId);
  return NextResponse.json({ config, ai_available: !!process.env.OPENAI_API_KEY });
}

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

  const current = await loadSpecialsConfig(supabase, userId);
  const update = sanitizeUpdate(body, current);

  const { error: upsertError } = await supabase
    .from('store_specials_config')
    .upsert({ user_id: userId, ...update }, { onConflict: 'user_id' });

  if (upsertError) {
    console.error('[specials/config] upsert failed:', upsertError.message);
    return NextResponse.json({ error: 'Failed to save settings.' }, { status: 500 });
  }

  const next = await loadSpecialsConfig(supabase, userId);
  await ensureSpecialsCarousel(supabase, userId, next);

  const generationChanged = GENERATION_FIELDS.some(
    (field) => update[field as keyof SpecialsConfigUpdate] !== undefined && update[field as keyof SpecialsConfigUpdate] !== current[field],
  );

  // Rebuild the upcoming pipeline when the rules changed (active cycle untouched).
  if (generationChanged) {
    await supabase
      .from('store_specials_cycles')
      .delete()
      .eq('user_id', userId)
      .eq('status', 'upcoming');
  }

  // Enable/disable + (re)build pipeline + activate the current cycle.
  const rotateResult = await rotateSpecials(supabase, userId, { config: next });
  if (next.is_enabled) {
    await ensureUpcomingCycles(supabase, userId, next);
  }

  return NextResponse.json({ config: next, rotated: rotateResult });
}

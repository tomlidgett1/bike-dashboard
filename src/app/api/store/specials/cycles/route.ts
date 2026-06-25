/**
 * Specials cycles API.
 *  GET  → active + upcoming cycles with items (the preview tables).
 *  POST → { action: 'refresh' }            rebuild/extend the pipeline + rotate
 *         { action: 'regenerate', cycleId } re-pick one upcoming cycle's items
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedStoreUserId } from '@/lib/store/specials/api-helpers';
import { loadSpecialsConfig } from '@/lib/store/specials/config';
import { loadCyclesWithItems } from '@/lib/store/specials/read';
import {
  ensureUpcomingCycles,
  regenerateCycleItems,
} from '@/lib/store/specials/generate-cycle';
import { rotateSpecials } from '@/lib/store/specials/activate';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const supabase = await createClient();
  const { userId, error } = await getVerifiedStoreUserId(supabase);
  if (!userId) return NextResponse.json({ error: error!.message }, { status: error!.status });

  const config = await loadSpecialsConfig(supabase, userId);

  // Top up the pipeline and backfill empty cycles when specials is on.
  if (config.is_enabled) {
    await ensureUpcomingCycles(supabase, userId, config);
  }

  const cycles = await loadCyclesWithItems(supabase, userId, { statuses: ['active', 'upcoming'] });

  return NextResponse.json({ config, cycles });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { userId, error } = await getVerifiedStoreUserId(supabase);
  if (!userId) return NextResponse.json({ error: error!.message }, { status: error!.status });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body → treat as refresh */
  }

  const config = await loadSpecialsConfig(supabase, userId);
  const action = typeof body.action === 'string' ? body.action : 'refresh';

  if (action === 'regenerate') {
    const cycleId = typeof body.cycleId === 'string' ? body.cycleId : null;
    if (!cycleId) return NextResponse.json({ error: 'cycleId is required' }, { status: 400 });
    const result = await regenerateCycleItems(supabase, userId, cycleId, config);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  } else {
    // Refresh: rotate (activates current) + top up the upcoming pipeline.
    await rotateSpecials(supabase, userId, { config });
    if (config.is_enabled) await ensureUpcomingCycles(supabase, userId, config);
  }

  const cycles = await loadCyclesWithItems(supabase, userId, { statuses: ['active', 'upcoming'] });
  return NextResponse.json({ config, cycles });
}

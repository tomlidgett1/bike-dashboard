/**
 * Specials rotation cron.
 *
 * Runs hourly: for every store with specials enabled it promotes the cycle whose
 * window now contains "now" to active (applying its discounts + syncing the
 * storefront carousel), retires the previous one, and tops up the upcoming
 * pipeline. rotateSpecials is idempotent, so running each hour simply flips the
 * carousel right after each daily/weekly boundary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { rotateSpecials } from '@/lib/store/specials/activate';
import { withConfigDefaults } from '@/lib/store/specials/config';
import type { SpecialsConfig } from '@/lib/types/specials';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization');
  if (expected && provided !== `Bearer ${expected}`) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: configs, error } = await supabase
    .from('store_specials_config')
    .select('*')
    .eq('is_enabled', true);

  if (error) {
    // Table not migrated yet → nothing to do.
    if (error.code === '42P01') {
      return NextResponse.json({ success: true, rotated: 0, note: 'specials not migrated' });
    }
    console.error('[cron/specials-rotate] load configs failed:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const now = new Date();
  let rotated = 0;
  let refreshed = 0;
  let failed = 0;

  for (const row of configs ?? []) {
    const config = withConfigDefaults((row as SpecialsConfig).user_id, row as Partial<SpecialsConfig>);
    try {
      const result = await rotateSpecials(supabase, config.user_id, { now, config });
      if (result.changed) rotated += 1;
      else refreshed += 1;
    } catch (err) {
      failed += 1;
      console.error('[cron/specials-rotate] store failed:', config.user_id, err);
    }
  }

  return NextResponse.json({
    success: failed === 0,
    stores: (configs ?? []).length,
    rotated,
    refreshed,
    failed,
  });
}

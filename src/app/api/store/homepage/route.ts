/**
 * Store Homepage Config API
 *
 * GET  → the authenticated store's raw homepage_config (or {} if unset).
 * PUT  → persist the full homepage_config JSON for the authenticated store.
 *
 * Owner-only, verified bicycle stores. The config is stored verbatim as JSONB
 * on users.homepage_config; the public renderer merges it over defaults via
 * resolveHomepageConfig, so partial/empty configs are always safe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { StoreHomepageConfig } from '@/lib/types/store';

async function requireStoreOwner() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single();
  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }
  return { supabase, userId: user.id };
}

export async function GET() {
  try {
    const ctx = await requireStoreOwner();
    if ('error' in ctx) return ctx.error;
    const { supabase, userId } = ctx;

    const { data, error } = await supabase
      .from('users')
      .select('homepage_config')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Column may not exist yet (migration pending) — treat as unconfigured.
      if (error.code === '42703') {
        return NextResponse.json({ config: {}, migrated: false });
      }
      throw error;
    }

    return NextResponse.json({ config: data?.homepage_config ?? {}, migrated: true });
  } catch (err) {
    console.error('Error in GET /api/store/homepage:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireStoreOwner();
    if ('error' in ctx) return ctx.error;
    const { supabase, userId } = ctx;

    const body = await request.json().catch(() => null);
    const config = body?.config as StoreHomepageConfig | undefined;

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return NextResponse.json({ error: 'A config object is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('users')
      .update({ homepage_config: config, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      if (error.code === '42703') {
        return NextResponse.json(
          { error: 'Homepage is not enabled yet. Run the database migration (supabase db push) to add users.homepage_config.' },
          { status: 503 },
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in PUT /api/store/homepage:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

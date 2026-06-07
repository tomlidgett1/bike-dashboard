/**
 * Store Page Layout API
 *
 * Stores the ordered page layout for the Products tab in homepage_config.
 * The layout is an array of {type: 'section'|'carousel', id: string} items
 * that controls how sections and standalone carousels are interleaved.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function authorisedStore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { user: null, error: 'Unauthorized', status: 401 as const };

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return { user: null, error: 'Access denied.', status: 403 as const };
  }

  return { user, error: null, status: 200 as const };
}

/** PUT /api/store/page-layout — save the products page layout order */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { user, error, status } = await authorisedStore(supabase);
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const layout: Array<{ type: 'section' | 'carousel'; id: string }> = body.layout;
    const page = body.page === 'bikes' ? 'bikes' : 'products';

    if (!Array.isArray(layout)) {
      return NextResponse.json({ error: 'layout must be an array' }, { status: 400 });
    }

    if (page === 'bikes') {
      const invalid = layout.some((item) => item.type !== 'carousel');
      if (invalid) {
        return NextResponse.json(
          { error: 'Bikes page layout only supports carousel items' },
          { status: 400 },
        );
      }
    }

    // Read existing homepage_config so we only update the requested page layout
    const { data: profile } = await supabase
      .from('users')
      .select('homepage_config')
      .eq('user_id', user.id)
      .single();

    const existing = (profile?.homepage_config as Record<string, unknown>) || {};
    const layoutKey = page === 'bikes' ? 'bikes_page_layout' : 'products_page_layout';
    const updated = { ...existing, [layoutKey]: layout };

    const { error: dbError } = await supabase
      .from('users')
      .update({ homepage_config: updated })
      .eq('user_id', user.id);

    if (dbError) {
      console.error('Error saving page layout:', dbError);
      return NextResponse.json({ error: 'Failed to save layout' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in PUT /api/store/page-layout:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

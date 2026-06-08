/**
 * POST /api/store/brands/search-logo
 * Serper image search for brand logos (verified bicycle stores only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildBrandLogoSearchQuery, searchBrandLogoImages } from '@/lib/store/brand-logo-serper';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = (await request.json()) as { query?: string; brandName?: string };
    const query = buildBrandLogoSearchQuery({
      query: body.query,
      brandName: body.brandName,
    });

    if (!query) {
      return NextResponse.json(
        { error: 'Enter a search query or brand name first' },
        { status: 400 },
      );
    }

    const { results } = await searchBrandLogoImages({ query });

    return NextResponse.json({
      success: true,
      query,
      results,
      total: results.length,
    });
  } catch (err) {
    console.error('Error in POST /api/store/brands/search-logo:', err);
    return NextResponse.json({ error: 'Logo search failed' }, { status: 500 });
  }
}

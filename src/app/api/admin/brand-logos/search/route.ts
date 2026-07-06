import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAdminAccess } from '@/lib/admin-auth';
import {
  buildCurationSearchQuery,
  getBrandLogoCurationById,
} from '@/lib/admin/brand-logo-curation';
import { searchBrandLogoImages } from '@/lib/store/brand-logo-serper';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAdminAccess(supabase);
    if (!auth.authorized) return auth.response;

    const body = (await request.json()) as {
      curationId?: string;
      query?: string;
      page?: number;
    };

    if (!body.curationId) {
      return NextResponse.json({ error: 'curationId is required' }, { status: 400 });
    }

    const adminDb = createServiceRoleClient();
    const curation = await getBrandLogoCurationById(adminDb, body.curationId);
    if (!curation) {
      return NextResponse.json({ error: 'Brand curation not found' }, { status: 404 });
    }

    if (body.query?.trim()) {
      await adminDb
        .from('brand_logo_curations')
        .update({
          search_query: body.query.trim(),
          search_page: 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', curation.id);
    }

    const query =
      body.query?.trim() ||
      curation.search_query?.trim() ||
      buildCurationSearchQuery(curation);
    const page = body.page ?? curation.search_page ?? 1;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token ?? null;

    const { results } = await searchBrandLogoImages({
      query,
      brandName: curation.brand_name,
      accessToken,
      page,
      excludeUrls: curation.rejected_urls ?? [],
    });

    return NextResponse.json({
      success: true,
      query,
      page,
      results,
      total: results.length,
      rejectedCount: curation.rejected_urls?.length ?? 0,
    });
  } catch (error) {
    console.error('[admin/brand-logos/search] POST failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Logo search failed' },
      { status: 500 },
    );
  }
}

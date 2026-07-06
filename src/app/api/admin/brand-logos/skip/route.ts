import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAdminAccess } from '@/lib/admin-auth';
import { skipBrandLogoCuration } from '@/lib/admin/brand-logo-curation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAdminAccess(supabase);
    if (!auth.authorized) return auth.response;

    const body = (await request.json()) as { curationId?: string };

    if (!body.curationId) {
      return NextResponse.json({ error: 'curationId is required' }, { status: 400 });
    }

    const adminDb = createServiceRoleClient();
    const curation = await skipBrandLogoCuration({
      supabase: adminDb,
      curationId: body.curationId,
      reviewedBy: auth.user.email || 'admin',
    });

    return NextResponse.json({ success: true, curation });
  } catch (error) {
    console.error('[admin/brand-logos/skip] POST failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to skip brand' },
      { status: 500 },
    );
  }
}

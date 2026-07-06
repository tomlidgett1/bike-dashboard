import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAdminAccess } from '@/lib/admin-auth';
import {
  ensureYellowJerseyStore,
  listBrandLogoCurations,
  syncBrandLogoCurations,
  type BrandLogoCurationStatus,
} from '@/lib/admin/brand-logo-curation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAdminAccess(supabase);
    if (!auth.authorized) return auth.response;

    const adminDb = createServiceRoleClient();
    const storeUserId = await ensureYellowJerseyStore(adminDb);
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'pending') as BrandLogoCurationStatus | 'all';
    const shouldSync = searchParams.get('sync') !== 'false';

    if (shouldSync) {
      await syncBrandLogoCurations(adminDb, storeUserId);
    }

    const allBrands = await listBrandLogoCurations(adminDb, { storeUserId, status: 'all' });
    const counts = {
      pending: allBrands.filter((b) => b.status === 'pending').length,
      approved: allBrands.filter((b) => b.status === 'approved').length,
      skipped: allBrands.filter((b) => b.status === 'skipped').length,
      total: allBrands.length,
    };

    const brands =
      status === 'all'
        ? allBrands
        : allBrands.filter((b) => b.status === status);

    return NextResponse.json({
      success: true,
      storeUserId,
      status,
      counts,
      brands,
    });
  } catch (error) {
    console.error('[admin/brand-logos] GET failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load brand logos' },
      { status: 500 },
    );
  }
}

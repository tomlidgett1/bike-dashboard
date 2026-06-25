/**
 * Specials analytics — per-product views/clicks/add-to-cart attributed to each
 * cycle's live window. Backs the Performance view on the Specials page.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedStoreUserId } from '@/lib/store/specials/api-helpers';
import { loadSpecialsAnalytics } from '@/lib/store/specials/read';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { userId, error } = await getVerifiedStoreUserId(supabase);
  if (!userId) return NextResponse.json({ error: error!.message }, { status: error!.status });

  const analytics = await loadSpecialsAnalytics(supabase, userId);
  return NextResponse.json({ analytics });
}

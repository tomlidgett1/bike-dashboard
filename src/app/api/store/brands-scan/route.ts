/**
 * Store Brands Scan API
 *
 * Returns distinct manufacturer_name values from the authenticated store's
 * active products so the UI can offer a pre-populated brand picker.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    // Distinct manufacturer names with product counts
    const { data, error } = await supabase
      .from('products')
      .select('manufacturer_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gt('qoh', 0)
      .not('manufacturer_name', 'is', null)
      .neq('manufacturer_name', '');

    if (error) {
      console.error('Error fetching brand names:', error);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    // Count occurrences and sort by frequency
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const name = row.manufacturer_name as string;
      counts[name] = (counts[name] ?? 0) + 1;
    }

    const brands = Object.entries(counts)
      .map(([name, product_count]) => ({ name, product_count }))
      .sort((a, b) => b.product_count - a.product_count);

    return NextResponse.json({ brands });
  } catch (err) {
    console.error('Error in GET /api/store/brands-scan:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

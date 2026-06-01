/**
 * Lightspeed Categories Scan API
 *
 * Returns categories sourced from products_all_ls (the raw Lightspeed cache)
 * so the list exactly matches the Connect Lightspeed page.
 * Category names are enriched from the Lightspeed API where possible.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLightspeedClient } from '@/lib/services/lightspeed';
import type { LightspeedCategoryOption } from '@/lib/types/store';

/**
 * GET /api/lightspeed/categories/scan
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // Verify user is a verified bicycle store
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can scan categories.' },
        { status: 403 }
      );
    }

    // Check if user has Lightspeed connection
    const { data: connection } = await supabase
      .from('lightspeed_connections')
      .select('status')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: 'No active Lightspeed connection found. Please connect your Lightspeed account first.' },
        { status: 400 }
      );
    }

    // ── Step 1: get all Lightspeed products from products_all_ls ─────────────
    // This is the same source the Connect Lightspeed page uses, so the category
    // list will always match what appears there.
    let allLsProducts: Array<{ category_id: string | null; total_qoh?: number | null }> = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error: lsErr } = await supabase
        .from('products_all_ls')
        .select('category_id, total_qoh')
        .eq('user_id', user.id)
        .range(from, to);

      if (lsErr) {
        console.error('[categories/scan] products_all_ls error:', lsErr);
        break;
      }

      if (data && data.length > 0) {
        allLsProducts = allLsProducts.concat(data);
        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    // ── Step 2: count products per category_id from products_all_ls ──────────
    const lsCounts = new Map<string, number>();
    for (const p of allLsProducts) {
      const catId = p.category_id ? String(p.category_id) : 'uncategorized';
      lsCounts.set(catId, (lsCounts.get(catId) ?? 0) + 1);
    }

    // ── Step 3: enrich with category names from Lightspeed API ───────────────
    let lsNameById = new Map<string, string>();
    try {
      const client = createLightspeedClient(user.id);
      const lsCategories = await client.getAllCategories({ archived: 'false' });
      if (Array.isArray(lsCategories)) {
        lsCategories.forEach((c: { categoryID: string | number; name?: string; fullPathName?: string }) => {
          lsNameById.set(String(c.categoryID), c.fullPathName || c.name || String(c.categoryID));
        });
      }
    } catch (err) {
      console.warn('[categories/scan] Lightspeed API name lookup failed (non-fatal):', err);
    }

    // ── Step 4: build result — every category from products_all_ls ───────────
    const categoryOptions: LightspeedCategoryOption[] = [];

    for (const [catId, count] of lsCounts) {
      if (catId === 'uncategorized') continue; // skip uncategorised
      const name = lsNameById.get(catId) || `Category ${catId}`;
      categoryOptions.push({
        id: catId,
        name,
        product_count: count,
      });
    }

    // Sort by product count descending
    categoryOptions.sort((a, b) => b.product_count - a.product_count);

    return NextResponse.json({ categories: categoryOptions });
  } catch (error) {
    console.error('Error in GET /api/lightspeed/categories/scan:', error);

    if (error instanceof Error) {
      if (error.message.includes('No valid access token')) {
        return NextResponse.json(
          { error: 'Lightspeed connection expired. Please reconnect your account.' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to scan Lightspeed categories' },
      { status: 500 }
    );
  }
}

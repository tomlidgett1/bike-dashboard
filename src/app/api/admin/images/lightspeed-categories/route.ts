/**
 * GET /api/admin/images/lightspeed-categories
 *
 * Returns the Lightspeed categories that have at least one canonical product
 * in the image workbench, with real names resolved from the Lightspeed API.
 *
 * sync-from-cache populates products.lightspeed_category_id but leaves
 * category_name null, so we can't rely on stored names. Instead we:
 *   1. Collect distinct ls_category_id values from the workbench view
 *   2. Call the Lightspeed API to get real names for those IDs
 *   3. Return [{id, name}] sorted by name
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // ── Step 1: Distinct category IDs present in the workbench ──────────────
    const { data: rows, error: viewError } = await supabase
      .from('image_workbench_products')
      .select('ls_category_id')
      .not('ls_category_id', 'is', null)
      .neq('ls_category_id', '')

    if (viewError) {
      console.error('[lightspeed-categories] View query error:', viewError)
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
    }

    const categoryIds = Array.from(
      new Set((rows || []).map((r: any) => r.ls_category_id as string))
    )

    if (categoryIds.length === 0) {
      return NextResponse.json({ success: true, categories: [] })
    }

    // ── Step 2: Resolve names from Lightspeed API ────────────────────────────
    // Fall back to stored name or raw ID if Lightspeed is unavailable.
    let nameMap = new Map<string, string>()

    try {
      const { createLightspeedClient } = await import('@/lib/services/lightspeed')
      const client = createLightspeedClient(user.id)
      const lsCategories = await client.getCategories({ archived: 'false' })

      for (const cat of lsCategories as any[]) {
        nameMap.set(String(cat.categoryID), cat.fullPathName || cat.name || String(cat.categoryID))
      }
    } catch (err) {
      // Lightspeed may not be connected — fall back to stored category_name or ID
      console.warn('[lightspeed-categories] Could not reach Lightspeed API:', err)

      // Try stored ls_category_name as fallback
      const { data: namedRows } = await supabase
        .from('image_workbench_products')
        .select('ls_category_id, ls_category_name')
        .not('ls_category_id', 'is', null)
        .not('ls_category_name', 'is', null)

      for (const row of namedRows || []) {
        if (row.ls_category_id && row.ls_category_name) {
          nameMap.set(row.ls_category_id, row.ls_category_name)
        }
      }
    }

    // ── Step 3: Build and sort response ─────────────────────────────────────
    const categories = categoryIds
      .map((id) => ({ id, name: nameMap.get(id) || id }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ success: true, categories })
  } catch (error) {
    console.error('[lightspeed-categories] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}

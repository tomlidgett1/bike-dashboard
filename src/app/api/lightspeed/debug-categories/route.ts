/**
 * GET /api/lightspeed/debug-categories
 * Temporary diagnostic endpoint — returns the raw category fetch result
 * so we can confirm what Lightspeed is actually returning.
 * DELETE after diagnosis is complete.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { createLightspeedClient } = await import('@/lib/services/lightspeed')
    const client = createLightspeedClient(user.id)

    // First, confirm account resolves
    const accountId = await client.getAccountId()

    // Try getAllCategories
    let allCats: any[] = []
    let allCatsError: string | null = null
    try {
      allCats = await client.getAllCategories({ archived: 'false' })
    } catch (e: any) {
      allCatsError = e?.message ?? String(e)
    }

    // Also try without filter as a comparison
    let noCats: any[] = []
    let noCatsError: string | null = null
    try {
      noCats = await client.getAllCategories()
    } catch (e: any) {
      noCatsError = e?.message ?? String(e)
    }

    return NextResponse.json({
      accountId,
      withArchivedFalseFilter: {
        count: allCats.length,
        error: allCatsError,
        sample: allCats.slice(0, 5).map(c => ({
          categoryID: c.categoryID,
          name: c.name,
          fullPathName: c.fullPathName,
        })),
      },
      withNoFilter: {
        count: noCats.length,
        error: noCatsError,
        sample: noCats.slice(0, 5).map(c => ({
          categoryID: c.categoryID,
          name: c.name,
          fullPathName: c.fullPathName,
        })),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? String(error) }, { status: 500 })
  }
}

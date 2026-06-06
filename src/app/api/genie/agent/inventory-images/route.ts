import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { resolveThumbnailUrlsByLightspeedItemIds } from '@/lib/services/product-images'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const itemIds = Array.isArray(body?.lightspeed_item_ids)
      ? body.lightspeed_item_ids.map(String).filter(Boolean)
      : []

    if (itemIds.length === 0) {
      return NextResponse.json({ images: {} })
    }

    const imageByItem = await resolveThumbnailUrlsByLightspeedItemIds(
      createServiceRoleClient(),
      user.id,
      itemIds.slice(0, 100),
    )

    const images: Record<string, string | null> = {}
    for (const [itemId, url] of imageByItem.entries()) {
      images[itemId] = url
    }

    return NextResponse.json({ images })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve images' },
      { status: 500 },
    )
  }
}

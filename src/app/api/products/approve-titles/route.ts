import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/products/approve-titles
// For each product in productIds: if display_name is null, set display_name = description.
// This "locks in" the current live title so it becomes the official display name.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await request.json()
    const { productIds }: { productIds: string[] } = body

    if (!productIds?.length) {
      return NextResponse.json({ error: 'No product IDs provided' }, { status: 400 })
    }

    // Fetch the products to get their descriptions — must belong to this user
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, description, display_name')
      .eq('user_id', user.id)
      .in('id', productIds)

    if (fetchError || !products) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }

    // Only update products that don't already have a display_name
    const toApprove = products.filter(p => !p.display_name && p.description)

    if (!toApprove.length) {
      return NextResponse.json({ approved: 0, skipped: products.length })
    }

    // Bulk update: set display_name = description for each
    const updates = toApprove.map(p =>
      supabase
        .from('products')
        .update({ display_name: p.description, updated_at: new Date().toISOString() })
        .eq('id', p.id)
        .eq('user_id', user.id)
    )

    await Promise.all(updates)

    return NextResponse.json({
      approved: toApprove.length,
      skipped: products.length - toApprove.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

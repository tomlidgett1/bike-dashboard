/**
 * GET  /api/products/reject  – list all rejected products (with product details)
 * POST /api/products/reject  – reject a product { product_id }
 * DELETE /api/products/reject – restore a product { product_id }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data: rows, error } = await supabase
      .from('optimizer_rejected_products')
      .select('id, product_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[reject] GET error:', error)
      return NextResponse.json({ error: 'Failed to fetch rejected products' }, { status: 500 })
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ rejected: [] })
    }

    const productIds = rows.map((r) => r.product_id)

    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id, description, display_name, manufacturer_name, category_name, price, qoh')
      .eq('user_id', user.id)
      .in('id', productIds)

    if (prodError) {
      console.error('[reject] products lookup error:', prodError)
      return NextResponse.json({ error: 'Failed to fetch product details' }, { status: 500 })
    }

    const productMap = new Map((products ?? []).map((p) => [p.id, p]))

    const rejected = rows.map((r) => {
      const p = productMap.get(r.product_id)
      return {
        id: r.id,
        product_id: r.product_id,
        created_at: r.created_at,
        description: p?.description ?? '',
        display_name: p?.display_name ?? null,
        brand: p?.manufacturer_name ?? null,
        category_name: p?.category_name ?? null,
        price: p?.price ?? 0,
        qoh: p?.qoh ?? 0,
      }
    })

    return NextResponse.json({ rejected })
  } catch (err) {
    console.error('[reject] GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { product_id } = await request.json()
    if (!product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 })

    const { error } = await supabase
      .from('optimizer_rejected_products')
      .upsert({ user_id: user.id, product_id }, { onConflict: 'user_id,product_id' })

    if (error) {
      console.error('[reject] POST error:', error)
      return NextResponse.json({ error: 'Failed to reject product' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reject] POST error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { product_id } = await request.json()
    if (!product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 })

    const { error } = await supabase
      .from('optimizer_rejected_products')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', product_id)

    if (error) {
      console.error('[reject] DELETE error:', error)
      return NextResponse.json({ error: 'Failed to restore product' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reject] DELETE error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

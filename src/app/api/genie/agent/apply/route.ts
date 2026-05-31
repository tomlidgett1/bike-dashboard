/**
 * Genie Store Agent — APPLY (mutation) endpoint.
 *
 * Receives a proposal produced by /api/genie/agent and performs the change.
 * Authenticated to verified bicycle stores. Every write is scoped to the
 * authenticated user_id, so a tampered proposal can only ever affect the
 * caller's own rows.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { GenieProposal, ApplyResult, CarouselSizeOption } from '@/lib/types/genie-agent'

export const dynamic = 'force-dynamic'

const SIZE_VALUES: CarouselSizeOption[] = ['featured', 'normal', 'compact']

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Store agent is only available to verified bicycle stores.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const proposal = body?.proposal as GenieProposal | undefined
    if (!proposal || typeof proposal !== 'object' || !('kind' in proposal)) {
      return NextResponse.json({ error: 'Missing or invalid proposal.' }, { status: 400 })
    }

    // ── Carousel layout ──────────────────────────────────────────────────
    if (proposal.kind === 'carousel_layout') {
      const changes = Array.isArray(proposal.changes) ? proposal.changes : []
      if (changes.length === 0) {
        return NextResponse.json({ error: 'No changes to apply.' }, { status: 400 })
      }

      let affected = 0
      for (const ch of changes) {
        if (!ch?.id) continue
        const size: CarouselSizeOption = SIZE_VALUES.includes(ch.carousel_size) ? ch.carousel_size : 'normal'
        const { error } = await supabase
          .from('store_categories')
          .update({
            display_order: Number(ch.display_order) || 0,
            is_active: ch.is_active !== false,
            carousel_size: size,
          })
          .eq('id', ch.id)
          .eq('user_id', user.id) // ownership scope
        if (error) {
          console.error('Apply carousel_layout error:', error)
          return NextResponse.json({ error: 'Failed to update carousels.' }, { status: 500 })
        }
        affected++
      }

      const result: ApplyResult = {
        ok: true,
        kind: 'carousel_layout',
        affected,
        message: `Updated ${affected} carousel${affected === 1 ? '' : 's'}.`,
      }
      return NextResponse.json(result)
    }

    // ── Apply discount ───────────────────────────────────────────────────
    if (proposal.kind === 'discount_apply') {
      const ids = Array.isArray(proposal.product_ids) ? proposal.product_ids.filter(Boolean) : []
      const pct = Number(proposal.discount_percent)
      if (ids.length === 0) {
        return NextResponse.json({ error: 'No products to discount.' }, { status: 400 })
      }
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json({ error: 'Invalid discount percentage.' }, { status: 400 })
      }
      let endsAt: string | null = null
      if (proposal.ends_at) {
        const d = new Date(proposal.ends_at)
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Invalid end date.' }, { status: 400 })
        }
        endsAt = d.toISOString()
      }

      const { data, error } = await supabase
        .from('products')
        .update({
          discount_percent: Math.round(pct * 100) / 100,
          discount_active: true,
          discount_ends_at: endsAt,
        })
        .eq('user_id', user.id) // ownership scope
        .in('id', ids)
        .select('id')

      if (error) {
        console.error('Apply discount_apply error:', error)
        return NextResponse.json({ error: 'Failed to apply discount.' }, { status: 500 })
      }

      const affected = data?.length ?? 0
      const result: ApplyResult = {
        ok: true,
        kind: 'discount_apply',
        affected,
        message: `${Math.round(pct)}% off applied to ${affected} product${affected === 1 ? '' : 's'}${endsAt ? ' (with end date)' : ''}.`,
      }
      return NextResponse.json(result)
    }

    // ── Remove discount ──────────────────────────────────────────────────
    if (proposal.kind === 'discount_remove') {
      const ids = Array.isArray(proposal.product_ids) ? proposal.product_ids.filter(Boolean) : []
      if (ids.length === 0) {
        return NextResponse.json({ error: 'No products to update.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('products')
        .update({
          discount_percent: null,
          discount_active: false,
          discount_ends_at: null,
        })
        .eq('user_id', user.id) // ownership scope
        .in('id', ids)
        .select('id')

      if (error) {
        console.error('Apply discount_remove error:', error)
        return NextResponse.json({ error: 'Failed to remove discount.' }, { status: 500 })
      }

      const affected = data?.length ?? 0
      const result: ApplyResult = {
        ok: true,
        kind: 'discount_remove',
        affected,
        message: `Discount removed from ${affected} product${affected === 1 ? '' : 's'}.`,
      }
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unsupported proposal kind.' }, { status: 400 })
  } catch (error) {
    console.error('Error in POST /api/genie/agent/apply:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

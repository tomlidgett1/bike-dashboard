import { NextRequest, NextResponse } from 'next/server'
import {
  countOpenWorkordersDueByDay,
  countOpenWorkordersDueOnDate,
  isServiceBookingWeekend,
  SERVICE_BOOKING_DAILY_CAP,
} from '@/lib/marketplace/service-booking'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function loadStore(storeId: string) {
  const supabase = createServiceRoleClient()
  const { data: profile, error } = await supabase
    .from('users')
    .select('user_id, business_name, bicycle_store, account_type')
    .eq('user_id', storeId)
    .maybeSingle()

  if (error) {
    console.error('[service-bookings/availability] profile load failed:', error)
    return { error: json({ error: 'Could not load this store.' }, 500) } as const
  }

  if (!profile || profile.account_type !== 'bicycle_store' || profile.bicycle_store !== true) {
    return { error: json({ error: 'Store not found.' }, 404) } as const
  }

  return { supabase, storeUserId: profile.user_id as string } as const
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await context.params
    if (!storeId || !UUID_RE.test(storeId)) {
      return json({ error: 'Invalid store.' }, 400)
    }

    const loaded = await loadStore(storeId)
    if ('error' in loaded) return loaded.error

    const date = request.nextUrl.searchParams.get('date')?.trim() || ''
    if (date) {
      if (!DATE_RE.test(date)) {
        return json({ error: 'date must be YYYY-MM-DD' }, 400)
      }
      const result = await countOpenWorkordersDueOnDate(loaded.storeUserId, date)
      return json({
        connected: result.connected,
        date,
        count: result.count,
        capacity: result.capacity,
        available: result.available,
        remaining: Math.max(0, result.capacity - result.count),
        weekend: isServiceBookingWeekend(date),
      })
    }

    const result = await countOpenWorkordersDueByDay(loaded.storeUserId)
    const fullDates = Object.entries(result.counts)
      .filter(([, count]) => count >= SERVICE_BOOKING_DAILY_CAP)
      .map(([day]) => day)
      .sort()

    return json({
      connected: result.connected,
      capacity: result.capacity,
      counts: result.counts,
      fullDates,
    })
  } catch (error) {
    console.error(
      '[service-bookings/availability] failed:',
      error instanceof Error ? error.message : error,
    )
    // Soft-fail so the booking form still opens; create will re-check capacity.
    return json({
      connected: false,
      capacity: SERVICE_BOOKING_DAILY_CAP,
      counts: {},
      fullDates: [],
      warning: 'Could not check availability right now.',
    })
  }
}

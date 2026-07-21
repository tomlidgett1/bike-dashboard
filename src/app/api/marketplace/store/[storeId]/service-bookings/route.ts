import { NextRequest, NextResponse } from 'next/server'
import { createServiceBooking } from '@/lib/marketplace/service-booking'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await context.params
    if (!storeId || !UUID_RE.test(storeId)) {
      return json({ error: 'Invalid store.' }, 400)
    }

    const supabase = createServiceRoleClient()
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('user_id, business_name, bicycle_store, account_type, nest_brand_key')
      .eq('user_id', storeId)
      .maybeSingle()

    if (profileError) {
      console.error('[service-bookings] profile load failed:', profileError)
      return json({ error: 'Could not load this store.' }, 500)
    }

    if (!profile || profile.account_type !== 'bicycle_store' || profile.bicycle_store !== true) {
      return json({ error: 'Store not found.' }, 404)
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const result = await createServiceBooking(supabase, {
      storeUserId: profile.user_id as string,
      storeName:
        (typeof profile.business_name === 'string' && profile.business_name.trim()) ||
        'the shop',
      brandKey: typeof profile.nest_brand_key === 'string' ? profile.nest_brand_key : null,
      customerName: typeof body.customer_name === 'string' ? body.customer_name : '',
      customerPhone: typeof body.customer_phone === 'string' ? body.customer_phone : '',
      bike: typeof body.bike === 'string' ? body.bike : '',
      notes: typeof body.notes === 'string' ? body.notes : '',
      dropOffDate: typeof body.drop_off_date === 'string' ? body.drop_off_date : '',
      serviceName: typeof body.service_name === 'string' ? body.service_name : null,
      serviceId: typeof body.service_id === 'string' ? body.service_id : null,
    })

    if (!result.ok) {
      const status =
        result.code === 'day_full'
          ? 409
          : result.code === 'not_connected'
            ? 503
            : result.code === 'validation' ||
                result.code === 'invalid_phone' ||
                result.code === 'invalid_date' ||
                result.code === 'past_date' ||
                result.code === 'weekend'
              ? 400
              : 502
      return json({ error: result.error, code: result.code }, status)
    }

    return json(
      {
        ok: true,
        workorder_id: result.workorderId,
        drop_off_date: result.dropOffDate,
        nest_sent: result.nestSent,
        ...(result.nestError ? { nest_error: result.nestError } : {}),
      },
      201,
    )
  } catch (error) {
    console.error(
      '[service-bookings] POST failed:',
      error instanceof Error ? error.message : error,
    )
    return json({ error: 'Could not create the booking right now.' }, 500)
  }
}

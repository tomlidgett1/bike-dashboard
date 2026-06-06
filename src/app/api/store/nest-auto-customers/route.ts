import { NextResponse } from 'next/server'
import { isNestMessagingConfigured } from '@/lib/nest/config'
import { resolveNestMessageTemplates } from '@/lib/nest/message-format'
import { getConnection } from '@/lib/services/lightspeed/token-manager'
import { fetchNestAutoServiceCustomers } from '@/lib/services/lightspeed/service-reminder-customers'
import { createClient } from '@/lib/supabase/server'

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return json({ error: 'Unauthorised' }, 401)
    }

    const { data: profile } = await supabase
      .from('users')
      .select(
        'account_type, bicycle_store, business_name, nest_message_intro, nest_message_signoff',
      )
      .eq('user_id', user.id)
      .maybeSingle()

    if (profile?.account_type !== 'bicycle_store' || profile?.bicycle_store !== true) {
      return json({ error: 'Store access required.' }, 403)
    }

    const connection = await getConnection(user.id)
    if (!connection || connection.status !== 'connected') {
      return json({
        customers: [],
        lightspeedConnected: false,
        nestConfigured: isNestMessagingConfigured(),
      })
    }

    const customers = await fetchNestAutoServiceCustomers(user.id, {
      messageTemplates: resolveNestMessageTemplates({
        intro: profile?.nest_message_intro,
        signoff: profile?.nest_message_signoff,
      }),
      storeName: profile?.business_name ?? null,
    })

    return json({
      customers,
      lightspeedConnected: true,
      nestConfigured: isNestMessagingConfigured(),
    })
  } catch (error) {
    console.error('[nest-auto-customers] failed:', error)
    return json(
      {
        error: error instanceof Error ? error.message : 'Could not load service reminders.',
        customers: [],
        lightspeedConnected: true,
        nestConfigured: isNestMessagingConfigured(),
      },
      500,
    )
  }
}

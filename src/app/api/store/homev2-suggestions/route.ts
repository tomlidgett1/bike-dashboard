import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnection } from '@/lib/services/lightspeed'
import { fetchHomeV2WorkorderNestSuggestions } from '@/lib/services/lightspeed/workorder-suggestions'
import { isNestMessagingConfigured } from '@/lib/nest/config'
import { resolveNestMessageTemplates } from '@/lib/nest/message-format'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const [{ data: profile }, connection, hiddenResult] = await Promise.all([
      supabase
        .from('users')
        .select(
          'account_type, bicycle_store, business_name, nest_message_intro, nest_message_signoff',
        )
        .eq('user_id', user.id)
        .maybeSingle(),
      getConnection(user.id),
      supabase
        .from('store_nest_hidden_pickup_suggestions')
        .select('workorder_id')
        .eq('user_id', user.id),
    ])

    if (profile?.account_type !== 'bicycle_store' || profile?.bicycle_store !== true) {
      return NextResponse.json({ error: 'Store access required.' }, { status: 403 })
    }

    if (!connection || connection.status !== 'connected') {
      return NextResponse.json({
        suggestions: [],
        lightspeedConnected: false,
        nestConfigured: isNestMessagingConfigured(),
      })
    }

    const hiddenIds = new Set<string>()
    const { data: hiddenRows, error: hiddenError } = hiddenResult

    if (hiddenError) {
      console.warn('[homev2-suggestions] hidden filter unavailable:', hiddenError.message)
    } else {
      for (const row of hiddenRows ?? []) {
        hiddenIds.add(String(row.workorder_id))
      }
    }

    const seenWorkorderIds = new Set<string>()
    const suggestions = (
      await fetchHomeV2WorkorderNestSuggestions(user.id, 5, {
        messageTemplates: resolveNestMessageTemplates({
          intro: profile?.nest_message_intro,
          signoff: profile?.nest_message_signoff,
        }),
        storeName: profile?.business_name ?? null,
      })
    ).filter((suggestion) => {
      const workorderId = String(suggestion.workorderId ?? suggestion.id ?? '').trim()
      if (!workorderId || hiddenIds.has(workorderId) || seenWorkorderIds.has(workorderId)) {
        return false
      }
      seenWorkorderIds.add(workorderId)
      return true
    })

    return NextResponse.json({
      storeOwnerId: user.id,
      suggestions,
      lightspeedConnected: true,
      nestConfigured: isNestMessagingConfigured(),
    })
  } catch (error) {
    console.error('[homev2-suggestions] failed:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not load suggestions.',
        suggestions: [],
        lightspeedConnected: true,
        nestConfigured: isNestMessagingConfigured(),
      },
      { status: 500 },
    )
  }
}

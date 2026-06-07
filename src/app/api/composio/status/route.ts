import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isComposioConfigured } from '@/lib/composio/client'
import { listGmailConnections, mintGmailConnectLink } from '@/lib/composio/gmail'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Store access only.' }, { status: 403 })
    }

    if (!isComposioConfigured()) {
      return NextResponse.json({
        configured: false,
        connected: false,
        gmail: null,
        accounts: [],
        connectUrl: null,
      })
    }

    const accounts = await listGmailConnections(user.id)
    const link = await mintGmailConnectLink(user.id).catch((error) => {
      console.warn('[composio/status] connect link unavailable:', error)
      return null
    })

    return NextResponse.json({
      configured: true,
      connected: accounts.length > 0,
      gmail: accounts[0] ?? null,
      accounts: accounts.map((account) => ({
        id: account.id,
        label: account.label,
        email_address: account.email_address ?? null,
        status: account.status,
      })),
      connectUrl: link?.url ?? null,
      canAddMore: true,
    })
  } catch (error) {
    console.error('[composio/status] failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load Composio status.' },
      { status: 500 },
    )
  }
}
